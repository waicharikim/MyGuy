UPDATE "DecisionRecord" AS decision
SET "closedAt" = thread."closedAt"
FROM "Thread" AS thread
WHERE decision."threadId" = thread."id"
  AND decision."status" = 'RESOLVED'
  AND decision."closedAt" IS NULL
  AND thread."closedAt" IS NOT NULL;
