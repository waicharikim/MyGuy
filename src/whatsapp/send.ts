/**
 * Send a WhatsApp Cloud API text message.
 *
 * Dev-safe: if WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN are missing,
 * logs and returns instead of throwing so operator resume and smokes
 * can run without Meta credentials.
 */
export async function sendWhatsappMessage(
  toPhone: string,
  text: string
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    console.warn(
      `[whatsapp] not configured — skip send to ${toPhone}: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`
    );
    return;
  }

  const version = process.env.WHATSAPP_API_VERSION ?? "v20.0";
  const res = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body: text },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(
      `WhatsApp send failed (${res.status}): ${await res.text()}`
    );
  }
}