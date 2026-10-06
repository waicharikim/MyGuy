type TelegramReplyMarkup =
  | {
      keyboard: Array<Array<{ text: string; request_contact?: boolean }>>;
      resize_keyboard?: boolean;
      one_time_keyboard?: boolean;
    }
  | { remove_keyboard: true };

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      },
    );
  } catch {
    throw new Error("Telegram send failed before receiving an API response");
  }
  if (!response.ok) {
    throw new Error(`Telegram send failed (${response.status})`);
  }

  const result = (await response.json()) as { ok?: boolean };
  if (!result.ok) {
    throw new Error("Telegram rejected the sendMessage request");
  }
}

export async function requestTelegramPhone(chatId: string) {
  return sendTelegramMessage(
    chatId,
    "To link Telegram to your Shauri account and decision history, share your phone number using the button below.",
    {
      keyboard: [[{ text: "Share my phone number", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  );
}
