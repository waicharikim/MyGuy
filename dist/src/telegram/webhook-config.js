"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTelegramWebhookUrl = isTelegramWebhookUrl;
function isTelegramWebhookUrl(value) {
    if (!value) {
        return false;
    }
    try {
        const url = new URL(value);
        return (url.protocol === "https:" &&
            url.pathname.replace(/\/$/, "") === "/webhook/telegram" &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash);
    }
    catch {
        return false;
    }
}
