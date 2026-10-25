-- CreateEnum
CREATE TYPE "SlugRule" AS ENUM ('TITLE', 'DATE_TITLE', 'ID');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FieldType" ADD VALUE 'VIDEO_URL';
ALTER TYPE "FieldType" ADD VALUE 'FILE';
ALTER TYPE "FieldType" ADD VALUE 'RADIO';
ALTER TYPE "FieldType" ADD VALUE 'CHECKBOX';
ALTER TYPE "FieldType" ADD VALUE 'USER';
ALTER TYPE "FieldType" ADD VALUE 'TAXONOMY';
ALTER TYPE "FieldType" ADD VALUE 'FLEXIBLE';

-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'TRASHED';

-- AlterEnum
ALTER TYPE "RevisionKind" ADD VALUE 'SCHEDULED';

-- Field groups move from a single postTypeId to location rules. Carry each
-- existing attachment over as a one-rule location before the column goes.
UPDATE "FieldGroup" fg
SET "location" = jsonb_build_array(jsonb_build_array(jsonb_build_object('param', 'post_type', 'op', '==', 'value', fg."postTypeId")))
WHERE fg."postTypeId" IS NOT NULL;
UPDATE "FieldGroup" SET "location" = '[]'::jsonb WHERE jsonb_typeof("location") <> 'array';

-- DropForeignKey
ALTER TABLE "FieldGroup" DROP CONSTRAINT "FieldGroup_postTypeId_fkey";

-- AlterTable
ALTER TABLE "CustomField" ADD COLUMN     "instructions" TEXT;

-- AlterTable
ALTER TABLE "FieldGroup" DROP COLUMN "postTypeId",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "location" SET DEFAULT '[]';

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "description" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "featuredImageId" TEXT,
ADD COLUMN     "scheduledRevisionId" TEXT,
ADD COLUMN     "template" TEXT,
ADD COLUMN     "trashedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PostType" ADD COLUMN     "apiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "singleTemplateId" TEXT,
ADD COLUMN     "slugRule" "SlugRule" NOT NULL DEFAULT 'TITLE';

-- CreateIndex
CREATE INDEX "MediaAsset_siteId_mimeType_idx" ON "MediaAsset"("siteId", "mimeType");

-- CreateIndex
CREATE UNIQUE INDEX "Post_scheduledRevisionId_key" ON "Post"("scheduledRevisionId");

-- CreateIndex
CREATE INDEX "Post_siteId_postTypeId_status_idx" ON "Post"("siteId", "postTypeId", "status");

-- CreateIndex
CREATE INDEX "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostType_singleTemplateId_key" ON "PostType"("singleTemplateId");

-- AddForeignKey
ALTER TABLE "PostType" ADD CONSTRAINT "PostType_singleTemplateId_fkey" FOREIGN KEY ("singleTemplateId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_scheduledRevisionId_fkey" FOREIGN KEY ("scheduledRevisionId") REFERENCES "PostRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_featuredImageId_fkey" FOREIGN KEY ("featuredImageId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

