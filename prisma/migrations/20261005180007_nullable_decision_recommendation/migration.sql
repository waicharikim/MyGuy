-- AlterTable
ALTER TABLE "DecisionRecord" ALTER COLUMN "recommendedOption" DROP NOT NULL,
ALTER COLUMN "recommendedOption" DROP DEFAULT,
ALTER COLUMN "confidence" DROP NOT NULL,
ALTER COLUMN "confidence" DROP DEFAULT;
