-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "outcomeSelectedForReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outcomeSelectionPending" BOOLEAN NOT NULL DEFAULT false;
