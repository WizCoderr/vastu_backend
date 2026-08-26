import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);

/** Remote pooled DB + multi-query POS/order txs routinely exceed Prisma's 5s default. */
export const INTERACTIVE_TX = { maxWait: 10_000, timeout: 30_000 } as const;

const prisma = new PrismaClient({
  adapter,
  transactionOptions: INTERACTIVE_TX,
});

export { prisma };