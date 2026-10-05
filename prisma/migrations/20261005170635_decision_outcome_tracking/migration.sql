-- CreateEnum
CREATE TYPE "DecisionOutcomeStatus" AS ENUM ('SUCCESSFUL', 'PARTIAL', 'UNSUCCESSFUL', 'NO_ACTION', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "DecisionOutcomeSource" AS ENUM ('USER', 'OPERATOR');

-- AlterTable
ALTER TABLE "DecisionRecord" ADD COLUMN     "outcomeAt" TIMESTAMP(3),
ADD COLUMN     "outcomeNotes" TEXT,
ADD COLUMN     "outcomeSource" "DecisionOutcomeSource",
ADD COLUMN     "outcomeStatus" "DecisionOutcomeStatus";

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "outcomeRequestedAt" TIMESTAMP(3);
