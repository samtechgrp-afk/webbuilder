-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('READ', 'READ_WRITE');

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "graphqlEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "graphqlPublic" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "ApiKeyScope" NOT NULL DEFAULT 'READ',
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_siteId_createdAt_idx" ON "ApiKey"("siteId", "createdAt");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Designers (and any system role granted everything) get the new developer permission.
UPDATE "Role" SET "permissions" = array_append("permissions", 'developer.api')
WHERE "key" = 'designer' AND NOT ('developer.api' = ANY("permissions"));
