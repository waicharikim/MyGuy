CREATE TABLE "ChannelIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelIdentity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChannelIdentity_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ChannelIdentity_channel_externalId_key"
ON "ChannelIdentity"("channel", "externalId");

CREATE INDEX "ChannelIdentity_userId_lastUsedAt_idx"
ON "ChannelIdentity"("userId", "lastUsedAt");
