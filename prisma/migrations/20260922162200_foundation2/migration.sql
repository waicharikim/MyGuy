-- CreateEnum
CREATE TYPE "HumanQuerySource" AS ENUM ('USER', 'OPERATOR');

-- AlterTable
ALTER TABLE "HumanQuery" ADD COLUMN     "source" "HumanQuerySource" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "awaitingSource" "HumanQuerySource" NOT NULL DEFAULT 'USER';
