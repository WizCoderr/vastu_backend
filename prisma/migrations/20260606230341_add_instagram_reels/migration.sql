-- CreateTable
CREATE TABLE "InstagramReel" (
    "id" TEXT NOT NULL,
    "instagramId" TEXT NOT NULL,
    "caption" TEXT,
    "permalink" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InstagramReel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramReel_instagramId_key" ON "InstagramReel"("instagramId");

-- CreateIndex
CREATE INDEX "InstagramReel_publishedAt_idx" ON "InstagramReel"("publishedAt");

-- CreateIndex
CREATE INDEX "InstagramReel_isVisible_publishedAt_idx" ON "InstagramReel"("isVisible", "publishedAt");
