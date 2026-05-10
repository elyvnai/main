const express = require('express');
const router = express.Router();
const Call = require('../../models/Call');
const Client = require('../../models/Client');
const Message = require('../../models/Message');
const TwilioService = require('../../services/TwilioService');
const TelegramService = require('../../services/TelegramService');

router.post('/', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.text) return res.sendStatus(200);

        const text = message.text;
        const chatId = message.chat.id.toString();

        // Simple authorization
        if (chatId !== process.env.TELEGRAM_CHAT_ID) {
            console.warn(`Unauthorized access attempt from chatId: ${chatId}`);
            return res.sendStatus(200);
        }

        if (text.startsWith('/start')) {
            await handleStart();
        } else if (text.startsWith('/status')) {
            await handleStatus();
        } else if (text.startsWith('/calls')) {
            await handleCalls();
        } else if (text.startsWith('/pause')) {
            TelegramService.paused = true;
            await TelegramService.sendMessage('⏸️ Notifications paused.', { force: true });
        } else if (text.startsWith('/resume')) {
            TelegramService.paused = false;
            await TelegramService.sendMessage('▶️ Notifications resumed.', { force: true });
        } else if (text.startsWith('/reply')) {
            await handleReply(text);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('❌ Telegram webhook error:', error);
        res.sendStatus(200); // Always respond 200 to Telegram
    }
});

async function handleStart() {
    const welcome = `🤖 <b>Elyvn: Speed-to-Lead</b>\n\nCommands:\n/status - System Health\n/calls - Recent Calls\n/pause - Stop Notifications\n/resume - Start Notifications\n/reply [phone] [msg] - Send SMS`;
    await TelegramService.sendMessage(welcome, { force: true });
}

async function handleStatus() {
    const calls = Call.getStats();
    const status = `📊 <b>System Status</b>\n\nTotal Calls: ${calls.total_calls || 0}\nMissed: ${calls.missed || 0}\nCompleted: ${calls.completed || 0}\n\nNotifications: ${TelegramService.paused ? 'Paused ⏸️' : 'Active ▶️'}`;
    await TelegramService.sendMessage(status, { force: true });
}

async function handleCalls() {
    const recent = Call.findRecent(10);
    if (!recent.length) return TelegramService.sendMessage('No recent calls.');
    
    let msg = '📞 <b>Recent Calls (Last 10)</b>\n\n';
    recent.forEach(c => {
        const emoji = c.status === 'completed' ? '✅' : '❌';
        msg += `${emoji} ${c.phone_number} (${c.duration}s)\n`;
    });
    await TelegramService.sendMessage(msg, { force: true });
}

async function handleReply(text) {
    const parts = text.split(' ');
    if (parts.length < 3) return TelegramService.sendMessage('Usage: /reply [phone] [message]');
    
    const phone = TwilioService.normalizePhoneNumber(parts[1]);
    const body = parts.slice(2).join(' ');
    
    const res = await TwilioService.sendSMS(phone, body);
    if (res.success) {
        let client = Client.findByPhone(phone);
        if (!client) client = Client.create({ phone_number: phone, source: 'telegram_reply' });
        
        Message.create({
            client_id: client.id,
            direction: 'outbound',
            content: body,
            status: 'sent',
            twilio_sid: res.sid
        });
        await TelegramService.sendMessage(`✅ SMS Sent to ${phone}`);
    } else {
        await TelegramService.sendMessage(`❌ Failed to send: ${res.error}`);
    }
}

module.exports = router;
