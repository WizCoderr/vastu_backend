-- AlterTable
ALTER TABLE "Section" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 1;

-- Backfill orderIndex from class number in title (e.g. "Class 1", "CLASS 9"), fallback to creation order
UPDATE "Section" s
SET "orderIndex" = sub.ord
FROM (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY "courseId"
            ORDER BY
                COALESCE(NULLIF(regexp_replace(title, '\D', '', 'g'), '')::int, 999999),
                title ASC
        ) AS ord
    FROM "Section"
) sub
WHERE s.id = sub.id;

-- CreateIndex
CREATE INDEX "Section_courseId_orderIndex_idx" ON "Section"("courseId", "orderIndex");
