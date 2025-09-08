/*
  Warnings:

  - You are about to drop the column `answer` on the `FaqSession` table. All the data in the column will be lost.
  - You are about to drop the column `confidence` on the `FaqSession` table. All the data in the column will be lost.
  - You are about to drop the column `escalated` on the `FaqSession` table. All the data in the column will be lost.
  - You are about to drop the column `question` on the `FaqSession` table. All the data in the column will be lost.
  - You are about to drop the column `topic` on the `FaqSession` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."FaqSession" DROP COLUMN "answer",
DROP COLUMN "confidence",
DROP COLUMN "escalated",
DROP COLUMN "question",
DROP COLUMN "topic",
ADD COLUMN     "leadId" TEXT;

-- CreateTable
CREATE TABLE "public"."FaqTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "topic" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaqTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaqSession_leadId_idx" ON "public"."FaqSession"("leadId");

-- AddForeignKey
ALTER TABLE "public"."FaqTurn" ADD CONSTRAINT "FaqTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."FaqSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
