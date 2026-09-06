/**
 * Backfill missing/null `updatedAt` on MongoDB documents.
 *
 * Prisma requires non-null DateTime @updatedAt; legacy docs (pre-field or
 * PG→Mongo copy) break findUnique/login with:
 *   Error converting field "updatedAt" ... found incompatible value of "null"
 *
 * Uses the native MongoDB driver — Prisma cannot load the broken rows.
 *
 * Usage:
 *   bun run scripts/backfill_user_updated_at.ts
 *   DATABASE_URL='mongodb+srv://...' bun run scripts/backfill_user_updated_at.ts
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

/** Prisma model names = MongoDB collection names (no @@map). */
const COLLECTIONS_WITH_UPDATED_AT = [
  "User",
  "CourseResource",
  "StudentPayment",
  "Payment",
  "LiveClass",
  "DeviceToken",
  "Category",
  "Product",
  "StockSettings",
  "Cart",
  "Order",
  "Coupon",
  "BulkDiscountTier",
  "WalletPass",
] as const;

const MISSING_UPDATED_AT = {
  $or: [{ updatedAt: null }, { updatedAt: { $exists: false } }],
};

async function backfillCollection(
  db: ReturnType<MongoClient["db"]>,
  name: string,
): Promise<{ matched: number; modified: number }> {
  const collection = db.collection(name);
  const now = new Date();

  const result = await collection.updateMany(MISSING_UPDATED_AT, [
    {
      $set: {
        updatedAt: { $ifNull: ["$createdAt", now] },
      },
    },
  ]);

  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  };
}

async function countRemaining(
  db: ReturnType<MongoClient["db"]>,
  name: string,
): Promise<number> {
  return db.collection(name).countDocuments(MISSING_UPDATED_AT);
}

async function main() {
  const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.error("DATABASE_URL or MONGODB_URI is required");
    process.exit(1);
  }

  // Redact credentials in logs
  const safeUri = uri.replace(/\/\/([^@]+)@/, "//***@");
  console.log(`Connecting: ${safeUri}`);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  try {
    let totalMatched = 0;
    let totalModified = 0;

    console.log("\nBackfilling missing/null updatedAt...\n");

    for (const name of COLLECTIONS_WITH_UPDATED_AT) {
      const { matched, modified } = await backfillCollection(db, name);
      totalMatched += matched;
      totalModified += modified;
      const remaining = await countRemaining(db, name);
      const status = remaining === 0 ? "ok" : `WARN ${remaining} remaining`;
      console.log(
        `  ${name}: matched=${matched} modified=${modified} (${status})`,
      );
    }

    console.log(
      `\nDone. matched=${totalMatched} modified=${totalModified}`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
