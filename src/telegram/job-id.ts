export function telegramJobId(chatId: string, messageId: number) {
  return `telegram-${chatId}-${messageId}`;
}
