const express = require('express');
const router = express.Router();
const Call = require('../../models/Call');
const TwilioService = require('../../services/TwilioService');
const Client = require('../../models/Client');
const Message = require('../../models/Message');
const TelegramService = require('../../services/TelegramService');

router.post('/', express.json(), async (req, res) => {
    try {
        const { message, edited_message } = req.body;
        const msg = message || edited_message;
        if (!msg || !msg.text) return res.status(200).send();
        const text = msg.text.trim();
        const chatId = String(msg.chat.id);
        if (text.startsWith('/start') || text.startsWith('/help')) {
            const welcome = `🤖 <b>Elyvn: Speed-to-Lead</b>\n\nCommands:\n/status - System Health\n/calls - Recent Calls\n/pause - Stop Notifications\n/resume - Start Notifications\n/reply [phone] [msg] - Send SMS`;
            await TelegramService.sendMessage(welcome);
        } else if (text === '/status') {
            const uptime = process.uptime();
            const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
            await TelegramService.sendMessage(`🟢 <b>Elyvn System OK</b>\nUptime: ${Math.floor(uptime / 60)}m\nMemory: ${mem}MB\nDB: Connected`);
        } else if (text === '/calls') {
            const calls = Call.getRecent(5);
            if (!calls.length) {
                await TelegramService.sendMessage('No recent calls.');
            } else {
                const lines = calls.map(c => `• ${c.call_id} | ${c.status || 'n/a'} | ${c.duration || 0}s`).join('\n');
                await TelegramService.sendMessage(`📞 <b>Recent Calls</b>\n${lines}`);
            }
        } else if (text.startsWith('/reply')) {
            const parts = text.split(' ');
            if (parts.length < 3) {
                await TelegramService.sendMessage('Usage: /reply [phone] [message]');
            } else {
                const phone = TwilioService.normalizePhoneNumber(parts[1]);
                const replyText = parts.slice(2).join(' ');
                const result = await TwilioService.sendSMS(phone, replyText);
                if (result.success) {
                    let client = Client.findByPhone(phone);
                    if (!client) client = Client.create({ phone_number: phone, source: 'telegram_reply' });
                    Message.create({ client_id: client.id, direction: 'outbound', content: replyText, status: 'sent', twilio_sid: result.sid });
                    await TelegramService.sendMessage(`✅ SMS sent to ${phone}`);
                } else {
                    await TelegramService.sendMessage(`❌ Failed: ${result.error}`);
                }
            }
        }
        res.status(200).send();
    } catch (error) {
        console.error('❌ Telegram webhook error:', error);
        res.status(200).send();
    }
});

module.exports = router;