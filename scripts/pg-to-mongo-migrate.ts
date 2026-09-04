/**
 * Postgres → MongoDB data migration with backup + verification.
 *
 * Uses raw SQL (information_schema + SELECT *) so schema drift vs Prisma
 * does not drop tables like User / Payment.
 *
 * Usage:
 *   MONGODB_URI='mongodb+srv://...' bun run scripts/pg-to-mongo-migrate.ts
 *
 * Optional:
 *   BACKUP_ONLY=true
 *   SKIP_BACKUP=true
 *   BACKUP_DIR=path
 */
import "dotenv/config";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { prisma } from "../src/core/prisma";

type Row = Record<string, unknown>;

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (typeof value === "object") {
    if (typeof (value as { toNumber?: () => number }).toNumber === "function") {
      return (value as { toNumber: () => number }).toNumber();
    }
    if (Array.isArray(value)) return value.map(serializeValue);
    if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = serializeValue(v);
      }
      return out;
    }
  }
  return value;
}

function serializeRows(rows: Row[]): Row[] {
  return rows.map((row) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) out[k] = serializeValue(v);
    return out;
  });
}

async function listPublicTables(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename
     FROM pg_catalog.pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
  );
  return rows.map((r) => r.tablename);
}

async function exportFromPostgres(backupDir: string) {
  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};

  console.log(`\n📦 Backup → ${backupDir}`);
  await mkdir(backupDir, { recursive: true });

  const tables = await listPublicTables();
  console.log(`  Found ${tables.length} public tables`);

  for (const table of tables) {
    try {
      // Quote identifier to preserve Prisma PascalCase table names
      const rows = serializeRows(
        await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM "${table}"`),
      );
      counts[table] = rows.length;
      await writeFile(join(backupDir, `${table}.json`), JSON.stringify(rows, null, 2));
      console.log(`  ✓ ${table}: ${rows.length}`);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      errors[table] = message;
      counts[table] = -1;
      await writeFile(join(backupDir, `${table}.json`), "[]");
      console.log(`  ⚠ ${table}: skipped (${message.split("\n")[0]})`);
    }
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    source: "postgresql",
    method: "raw-sql-select-star",
    tables,
    counts,
    errors,
  };
  await writeFile(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function importToMongo(backupDir: string, mongoUri: string, tables: string[]) {
  console.log(`\n🍃 Import → MongoDB`);
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db();
  const imported: Record<string, number> = {};

  try {
    for (const table of tables) {
      let rows: Row[] = [];
      try {
        rows = JSON.parse(await readFile(join(backupDir, `${table}.json`), "utf8")) as Row[];
      } catch {
        rows = [];
      }

      const collection = db.collection(table);
      await collection.deleteMany({});

      if (rows.length === 0) {
        imported[table] = 0;
        console.log(`  ✓ ${table}: 0`);
        continue;
      }

      const docs = rows.map((row, index) => {
        const id = row.id ?? row._id;
        const doc: Row = { ...row };
        if (id != null) {
          doc._id = String(id);
          doc.id = String(id);
        } else {
          // Composite / no-id tables (e.g. join tables)
          doc._id = `${table}_${index}`;
        }
        return doc;
      });

      await collection.insertMany(docs as any[], { ordered: false });
      imported[table] = docs.length;
      console.log(`  ✓ ${table}: ${docs.length}`);
    }
  } finally {
    await client.close();
  }

  return imported;
}

async function verify(
  backupDir: string,
  mongoUri: string,
  tables: string[],
  pgCounts: Record<string, number>,
) {
  console.log(`\n✅ Verification checklist`);
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db();

  const checklist: Array<{
    table: string;
    postgres: number;
    backupFile: number;
    mongodb: number;
    ok: boolean;
  }> = [];

  try {
    for (const table of tables) {
      const pg = pgCounts[table] ?? 0;
      let backupFile = 0;
      try {
        const rows = JSON.parse(await readFile(join(backupDir, `${table}.json`), "utf8")) as unknown[];
        backupFile = rows.length;
      } catch {
        backupFile = 0;
      }

      const expected = pg < 0 ? backupFile : pg;
      const mongoCount = await db.collection(table).countDocuments();
      const ok = expected === backupFile && backupFile === mongoCount;

      checklist.push({
        table,
        postgres: expected,
        backupFile,
        mongodb: mongoCount,
        ok,
      });

      console.log(
        `  ${ok ? "☑" : "☐"} ${table}: pg/backup=${expected} mongo=${mongoCount}`,
      );
    }
  } finally {
    await client.close();
  }

  const allOk = checklist.every((c) => c.ok);
  const report = {
    verifiedAt: new Date().toISOString(),
    allOk,
    checklist,
  };
  await writeFile(join(backupDir, "verification.json"), JSON.stringify(report, null, 2));
  console.log(
    `\n${allOk ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"} → ${join(backupDir, "verification.json")}`,
  );
  return report;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
  const backupOnly = process.env.BACKUP_ONLY === "true";
  const skipBackup = process.env.SKIP_BACKUP === "true";

  let backupDir = process.env.BACKUP_DIR;
  if (!backupDir) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupDir = join(process.cwd(), "backups", `pg-to-mongo-${stamp}`);
  }

  let manifest: { counts: Record<string, number>; tables: string[] };

  if (!skipBackup) {
    manifest = await exportFromPostgres(backupDir);
  } else {
    const raw = await readFile(join(backupDir, "manifest.json"), "utf8");
    manifest = JSON.parse(raw);
    console.log(`\n📦 Reusing backup ${backupDir}`);
  }

  if (backupOnly) {
    console.log("\nBACKUP_ONLY=true — skipping Mongo import.");
    return;
  }

  if (!mongoUri) {
    console.error("\nSet MONGODB_URI (or MONGO_URL) to import into MongoDB.");
    process.exit(1);
  }

  const safeUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
  console.log(`Target: ${safeUri}`);

  const imported = await importToMongo(backupDir, mongoUri, manifest.tables);
  await writeFile(
    join(backupDir, "import-result.json"),
    JSON.stringify({ importedAt: new Date().toISOString(), imported }, null, 2),
  );

  const report = await verify(backupDir, mongoUri, manifest.tables, manifest.counts);
  if (!report.allOk) process.exit(2);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
