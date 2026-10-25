-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "designTokensVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DesignTokenRevision" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "tokens" JSONB NOT NULL,
    "preset" TEXT,
    "message" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignTokenRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DesignTokenRevision_siteId_version_key" ON "DesignTokenRevision"("siteId", "version");

-- AddForeignKey
ALTER TABLE "DesignTokenRevision" ADD CONSTRAINT "DesignTokenRevision_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignTokenRevision" ADD CONSTRAINT "DesignTokenRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
