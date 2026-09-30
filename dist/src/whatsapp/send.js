"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsappMessage = sendWhatsappMessage;
async function sendWhatsappMessage(toPhone, text) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_TOKEN;
    if (!phoneNumberId || !token)
        throw new Error("WhatsApp Cloud API is not configured");
    const version = process.env.WHATSAPP_API_VERSION ?? "v20.0";
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: toPhone, type: "text", text: { body: text } }),
    });
    if (!res.ok)
        throw new Error(`WhatsApp send failed (${res.status}): ${await res.text()}`);
}
