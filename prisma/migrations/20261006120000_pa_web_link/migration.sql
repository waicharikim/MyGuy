CREATE TABLE "PaLinkChallenge" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "browserSecretHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PaLinkChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaWebSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PaWebSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaLinkChallenge_codeHash_key" ON "PaLinkChallenge"("codeHash");
CREATE UNIQUE INDEX "PaLinkChallenge_browserSecretHash_key" ON "PaLinkChallenge"("browserSecretHash");
CREATE INDEX "PaLinkChallenge_ipHash_createdAt_idx" ON "PaLinkChallenge"("ipHash", "createdAt");
CREATE INDEX "PaLinkChallenge_expiresAt_idx" ON "PaLinkChallenge"("expiresAt");

CREATE UNIQUE INDEX "PaWebSession_tokenHash_key" ON "PaWebSession"("tokenHash");
CREATE INDEX "PaWebSession_userId_lastUsedAt_idx" ON "PaWebSession"("userId", "lastUsedAt");
CREATE INDEX "PaWebSession_expiresAt_idx" ON "PaWebSession"("expiresAt");

CREATE INDEX "InboundReceipt_channel_phone_createdAt_idx" ON "InboundReceipt"("channel", "phone", "createdAt");

ALTER TABLE "PaLinkChallenge"
ADD CONSTRAINT "PaLinkChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaWebSession"
ADD CONSTRAINT "PaWebSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
