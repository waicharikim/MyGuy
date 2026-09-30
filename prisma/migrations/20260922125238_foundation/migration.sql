-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('OPEN', 'CLOSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DecisionPass" AS ENUM ('INTAKE', 'SKEPTIC', 'GROUND', 'CLOSE');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FollowupStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "HumanQueryStatus" AS ENUM ('OPEN', 'ANSWERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KnowledgeCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentInteractionStatus" AS ENUM ('REQUESTED', 'ANSWERED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recurringConcerns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pastDecisions" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "communicationStyle" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ThreadStatus" NOT NULL DEFAULT 'OPEN',
    "currentPass" "DecisionPass" NOT NULL DEFAULT 'INTAKE',
    "awaitingReply" BOOLEAN NOT NULL DEFAULT false,
    "awaitingHuman" BOOLEAN NOT NULL DEFAULT false,
    "pendingCloseConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "followupCount" INTEGER NOT NULL DEFAULT 0,
    "known" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "open" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "leaning" TEXT,
    "skepticArgument" TEXT,
    "decisionSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundReceipt" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "pass" "DecisionPass",
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "externalId" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphCheckpoint" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "graphThreadId" TEXT NOT NULL,
    "pass" "DecisionPass" NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledFollowup" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "promptContext" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "FollowupStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledFollowup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroundingEvidence" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "finding" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroundingEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "matter" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "knownContext" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "HumanQueryStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "HumanQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanQueryMessage" (
    "id" TEXT NOT NULL,
    "humanQueryId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanQueryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationMessage" (
    "id" TEXT NOT NULL,
    "escalationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "proposition" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "KnowledgeCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutRequestId" TEXT,
    "mpesaReceipt" TEXT,
    "originalMessage" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    "description" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCapability" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AgentCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPermission" (
    "id" TEXT NOT NULL,
    "requesterAgentId" TEXT NOT NULL,
    "responderAgentId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AgentPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentInteraction" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "threadId" TEXT,
    "capability" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB,
    "status" "AgentInteractionStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentInteractionMessage" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentInteractionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "Thread_userId_status_updatedAt_idx" ON "Thread"("userId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundReceipt_channel_externalId_key" ON "InboundReceipt"("channel", "externalId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_channel_externalId_key" ON "Message"("channel", "externalId");

-- CreateIndex
CREATE INDEX "GraphCheckpoint_threadId_createdAt_idx" ON "GraphCheckpoint"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GraphCheckpoint_threadId_graphThreadId_pass_createdAt_key" ON "GraphCheckpoint"("threadId", "graphThreadId", "pass", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledFollowup_idempotencyKey_key" ON "ScheduledFollowup"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScheduledFollowup_status_runAt_idx" ON "ScheduledFollowup"("status", "runAt");

-- CreateIndex
CREATE INDEX "GroundingEvidence_threadId_retrievedAt_idx" ON "GroundingEvidence"("threadId", "retrievedAt");

-- CreateIndex
CREATE INDEX "HumanQuery_threadId_status_idx" ON "HumanQuery"("threadId", "status");

-- CreateIndex
CREATE INDEX "Escalation_status_createdAt_idx" ON "Escalation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeCandidate_status_createdAt_idx" ON "KnowledgeCandidate"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_threadId_key" ON "Payment"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_checkoutRequestId_key" ON "Payment"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalMessageId_key" ON "Payment"("externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_name_key" ON "Agent"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCapability_agentId_name_key" ON "AgentCapability"("agentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPermission_requesterAgentId_responderAgentId_capabilit_key" ON "AgentPermission"("requesterAgentId", "responderAgentId", "capability");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphCheckpoint" ADD CONSTRAINT "GraphCheckpoint_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledFollowup" ADD CONSTRAINT "ScheduledFollowup_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroundingEvidence" ADD CONSTRAINT "GroundingEvidence_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanQuery" ADD CONSTRAINT "HumanQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanQuery" ADD CONSTRAINT "HumanQuery_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanQueryMessage" ADD CONSTRAINT "HumanQueryMessage_humanQueryId_fkey" FOREIGN KEY ("humanQueryId") REFERENCES "HumanQuery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationMessage" ADD CONSTRAINT "EscalationMessage_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "Escalation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCandidate" ADD CONSTRAINT "KnowledgeCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCandidate" ADD CONSTRAINT "KnowledgeCandidate_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCapability" ADD CONSTRAINT "AgentCapability_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInteraction" ADD CONSTRAINT "AgentInteraction_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInteraction" ADD CONSTRAINT "AgentInteraction_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInteraction" ADD CONSTRAINT "AgentInteraction_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInteractionMessage" ADD CONSTRAINT "AgentInteractionMessage_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "AgentInteraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
