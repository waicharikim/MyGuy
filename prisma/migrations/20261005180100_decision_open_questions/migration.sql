-- AlterTable
ALTER TABLE "DecisionRecord"
ADD COLUMN "unresolvedQuestions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
