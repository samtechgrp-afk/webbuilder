-- DropIndex
DROP INDEX "Post_siteId_postTypeId_slug_key";

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "localeDetection" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SiteLocale" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "domain" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteLocale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostTranslation" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "translationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "localeCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteLocale_domain_key" ON "SiteLocale"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "SiteLocale_siteId_code_key" ON "SiteLocale"("siteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SiteLocale_siteId_prefix_key" ON "SiteLocale"("siteId", "prefix");

-- CreateIndex
CREATE UNIQUE INDEX "PostTranslation_postId_key" ON "PostTranslation"("postId");

-- CreateIndex
CREATE INDEX "PostTranslation_siteId_translationId_idx" ON "PostTranslation"("siteId", "translationId");

-- CreateIndex
CREATE UNIQUE INDEX "PostTranslation_translationId_localeCode_key" ON "PostTranslation"("translationId", "localeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Post_siteId_postTypeId_locale_slug_key" ON "Post"("siteId", "postTypeId", "locale", "slug");

-- AddForeignKey
ALTER TABLE "SiteLocale" ADD CONSTRAINT "SiteLocale_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTranslation" ADD CONSTRAINT "PostTranslation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostTranslation" ADD CONSTRAINT "PostTranslation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One default locale per site.
CREATE UNIQUE INDEX "SiteLocale_one_default_per_site" ON "SiteLocale"("siteId") WHERE "isDefault";
