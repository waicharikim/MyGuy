CREATE TYPE "OperatorNotificationType" AS ENUM ('HUMAN_QUERY', 'ESCALATION');

ALTER TABLE "DecisionRecord"
ADD COLUMN "recommendedAt" TIMESTAMP(3),
ADD COLUMN "closedAt" TIMESTAMP(3);

ALTER TABLE "Agent"
ADD COLUMN "ownerUserId" TEXT;

ALTER TABLE "Agent"
ADD CONSTRAINT "Agent_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentPermission"
ADD CONSTRAINT "AgentPermission_requesterAgentId_fkey"
FOREIGN KEY ("requesterAgentId") REFERENCES "Agent"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "AgentPermission_responderAgentId_fkey"
FOREIGN KEY ("responderAgentId") REFERENCES "Agent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OperatorNotification" (
    "id" TEXT NOT NULL,
    "type" "OperatorNotificationType" NOT NULL,
    "humanQueryId" TEXT,
    "escalationId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OperatorNotification_exactly_one_resource_check" CHECK (
      ("type" = 'HUMAN_QUERY' AND "humanQueryId" IS NOT NULL AND "escalationId" IS NULL)
      OR
      ("type" = 'ESCALATION' AND "escalationId" IS NOT NULL AND "humanQueryId" IS NULL)
    ),
    CONSTRAINT "OperatorNotification_humanQueryId_fkey"
      FOREIGN KEY ("humanQueryId") REFERENCES "HumanQuery"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorNotification_escalationId_fkey"
      FOREIGN KEY ("escalationId") REFERENCES "Escalation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OperatorNotification_humanQueryId_key"
ON "OperatorNotification"("humanQueryId");

CREATE UNIQUE INDEX "OperatorNotification_escalationId_key"
ON "OperatorNotification"("escalationId");

CREATE INDEX "OperatorNotification_sentAt_nextAttemptAt_idx"
ON "OperatorNotification"("sentAt", "nextAttemptAt");
