-- CreateEnum
CREATE TYPE "FontSource" AS ENUM ('UPLOAD', 'LINK');

-- CreateTable
CREATE TABLE "SiteFont" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "source" "FontSource" NOT NULL,
    "storageKey" TEXT,
    "url" TEXT NOT NULL,
    "format" TEXT,
    "weight" TEXT NOT NULL DEFAULT '400',
    "style" TEXT NOT NULL DEFAULT 'normal',
    "fallback" TEXT NOT NULL DEFAULT 'sans-serif',
    "originalName" TEXT,
    "sizeBytes" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteFont_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteFont_siteId_family_idx" ON "SiteFont"("siteId", "family");

-- AddForeignKey
ALTER TABLE "SiteFont" ADD CONSTRAINT "SiteFont_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
