-- CreateEnum
CREATE TYPE "DecisionRecordStatus" AS ENUM ('OPEN', 'AWAITING_HUMAN', 'RESOLVED', 'ESCALATED');

-- CreateTable
CREATE TABLE "DecisionRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "matter" TEXT NOT NULL DEFAULT '',
    "status" "DecisionRecordStatus" NOT NULL DEFAULT 'OPEN',
    "decisionSummary" TEXT NOT NULL DEFAULT '',
    "goal" TEXT NOT NULL DEFAULT '',
    "recommendedOption" TEXT NOT NULL DEFAULT '',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidenceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "humanInputs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "escalationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRecord_threadId_key" ON "DecisionRecord"("threadId");

-- CreateIndex
CREATE INDEX "DecisionRecord_userId_status_updatedAt_idx" ON "DecisionRecord"("userId", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
