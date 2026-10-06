CREATE TABLE "TelegramOperator" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramOperator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramOperator_chatId_key"
ON "TelegramOperator"("chatId");
