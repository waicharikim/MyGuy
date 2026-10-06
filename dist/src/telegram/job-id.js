"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramJobId = telegramJobId;
function telegramJobId(chatId, messageId) {
    return `telegram-${chatId}-${messageId}`;
}
