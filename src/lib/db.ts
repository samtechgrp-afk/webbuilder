import { PrismaClient } from "@prisma/client";

/**
 * The unscoped client. Only identity code (auth, membership lookup, the public
 * site resolver) imports this directly. Everything inside a tenant goes
 * through `tenantDb(siteId)`.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
