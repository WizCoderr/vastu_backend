import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "./config";

const connectionString = `${process.env.DATABASE_URL}`;

function resolveSsl(url: string): false | { rejectUnauthorized: boolean } {
  if (/sslmode=disable/i.test(url)) return false;
  if (/sslmode=(require|verify-full|verify-ca|prefer)/i.test(url)) {
    return { rejectUnauthorized: false };
  }

  try {
    const host = new URL(url.replace(/^postgres(ql)?:/i, "http:")).hostname;
    if (host === "postgres" || host === "localhost" || host === "127.0.0.1") {
      return false;
    }
  } catch {
    // fall through to remote default
  }

  // Managed/remote Postgres usually requires TLS
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString,
  ssl: resolveSsl(connectionString),
  max: config.database.poolMax,
  idleTimeoutMillis: config.database.poolIdleTimeoutMs,
  connectionTimeoutMillis: config.database.poolConnectionTimeoutMs,
});
const adapter = new PrismaPg(pool);

/** Remote pooled DB + multi-query POS/order txs routinely exceed Prisma's 5s default. */
export const INTERACTIVE_TX = { maxWait: 10_000, timeout: 30_000 } as const;

const prisma = new PrismaClient({
  adapter,
  transactionOptions: INTERACTIVE_TX,
});

export { prisma };
