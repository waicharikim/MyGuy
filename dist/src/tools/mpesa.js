"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiateSTKPush = initiateSTKPush;
const prisma_1 = require("../infrastructure/prisma");
const PRICE = Number(process.env.SHAURI_PRICE_KES || 200);
async function getDarajaAccessToken() {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    if (!key || !secret)
        throw new Error("M-Pesa credentials are not configured");
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    const res = await fetch(`${process.env.MPESA_BASE_URL || "https://sandbox.safaricom.co.ke"}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok)
        throw new Error(`Daraja auth failed: ${res.status}`);
    const data = await res.json();
    return data.access_token;
}
async function initiateSTKPush(input) {
    if (input.externalMessageId) {
        const existing = await prisma_1.prisma.payment.findUnique({ where: { externalMessageId: input.externalMessageId } });
        if (existing)
            return { paymentId: existing.id, checkoutRequestId: existing.checkoutRequestId };
    }
    const payment = await prisma_1.prisma.payment.create({ data: { userId: input.userId, amount: PRICE, originalMessage: input.originalMessage, externalMessageId: input.externalMessageId } });
    try {
        const token = await getDarajaAccessToken();
        const shortcode = process.env.MPESA_SHORTCODE;
        const passkey = process.env.MPESA_PASSKEY;
        const callback = process.env.MPESA_CALLBACK_URL;
        if (!shortcode || !passkey || !callback)
            throw new Error("M-Pesa shortcode/passkey/callback are not configured");
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
        const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
        const res = await fetch(`${process.env.MPESA_BASE_URL || "https://sandbox.safaricom.co.ke"}/mpesa/stkpush/v1/processrequest`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, TransactionType: "CustomerPayBillOnline", Amount: PRICE, PartyA: input.phone, PartyB: shortcode, PhoneNumber: input.phone, CallBackURL: callback, AccountReference: "Shauri", TransactionDesc: "Shauri decision session" }) });
        if (!res.ok)
            throw new Error(`STK push failed: ${res.status} ${await res.text()}`);
        const data = await res.json();
        await prisma_1.prisma.payment.update({ where: { id: payment.id }, data: { checkoutRequestId: data.CheckoutRequestID } });
        return { paymentId: payment.id, checkoutRequestId: data.CheckoutRequestID };
    }
    catch (e) {
        await prisma_1.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
        console.error(e);
        return { paymentId: payment.id, checkoutRequestId: null };
    }
}
