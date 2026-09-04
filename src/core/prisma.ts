import "dotenv/config";
import { PrismaClient } from "../generated/prisma";

/** Kept for call-site compatibility; Mongo interactive tx uses Atlas replica-set defaults. */
export const INTERACTIVE_TX = { maxWait: 10_000, timeout: 30_000 } as const;

const prisma = new PrismaClient();

export { prisma };
