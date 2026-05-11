const express = require('express');
const router = express.Router();
const Call = require('../../models/Call');
const Client = require('../../models/Client');
const Message = require('../../models/Message');
const TwilioService = require('../../services/TwilioService');
const TelegramService = require('../../services/TelegramService');

router.post('/', async (req, res) => {
    try {
        const body = req.body;
        
        // Handle callback query from inline keyboard buttons
        if (body.callback_query) {
            return handleCallbackQuery(body.callback_query, res);
        }
        
        const { message } = body;
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

/**
 * Handle callback query from inline keyboard buttons
 * @param {Object} callbackQuery - Telegram callback query
 * @param {Object} res - Express response object
 */
async function handleCallbackQuery(callbackQuery, res) {
    const chatId = callbackQuery.message.chat.id.toString();
    
    // Authorization check
    if (chatId !== process.env.TELEGRAM_CHAT_ID) {
        return res.sendStatus(200);
    }
    
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;
    
    // Answer the callback query first (remove loading state)
    await answerCallbackQuery(callbackQuery.id);
    
    // Parse callback data: type_id format (e.g., transcript_123, recording_456, sms_reply_789)
    const parts = data.split('_');
    if (parts.length < 2) return res.sendStatus(200);
    
    const action = parts[0];
    const callId = parseInt(parts[1]);
    
    if (isNaN(callId)) return res.sendStatus(200);
    
    const call = Call.findById(callId);
    if (!call) {
        await TelegramService.sendMessage('❌ Call not found.', { force: true });
        return res.sendStatus(200);
    }
    
    switch (action) {
        case 'transcript':
            await handleTranscriptRequest(call, chatId, messageId);
            break;
        case 'recording':
            await handleRecordingRequest(call, chatId, messageId);
            break;
        case 'sms_reply':
            await handleSMSReplyRequest(call, chatId, messageId);
            break;
        default:
            await TelegramService.sendMessage(`Unknown action: ${action}`, { force: true });
    }
    
    res.sendStatus(200);
}

/**
 * Answer a callback query to remove loading indicator
 * @param {string} callbackQueryId - The callback query ID
 */
async function answerCallbackQuery(callbackQueryId) {
    try {
        await fetch(`${TelegramService.apiUrl}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId
            })
        });
    } catch (error) {
        console.error('Failed to answer callback query:', error.message);
    }
}

/**
 * Handle transcript request for a call
 * @param {Object} call - Call record
 * @param {string} chatId - Telegram chat ID
 * @param {number} messageId - Original message ID to edit
 */
async function handleTranscriptRequest(call, chatId, messageId) {
    const transcript = call.transcript;
    
    if (!transcript) {
        await TelegramService.sendMessage('📝 <b>Transcript</b>\n\nNo transcript available for this call.', { force: true });
        return;
    }
    
    const message = `📝 <b>Transcript</b>\n\n🆔 Call ID: <code>${call.call_id}</code>\n\n${transcript}`;
    
    await editMessageReplyMarkup(chatId, messageId, null);
    await TelegramService.sendMessage(message, { force: true });
}

/**
 * Handle recording request for a call
 * @param {Object} call - Call record
 * @param {string} chatId - Telegram chat ID
 * @param {number} messageId - Original message ID to edit
 */
async function handleRecordingRequest(call, chatId, messageId) {
    const recordingUrl = call.recording_url;
    
    if (!recordingUrl) {
        await TelegramService.sendMessage('🎙️ <b>Recording</b>\n\nNo recording available for this call.', { force: true });
        return;
    }
    
    await editMessageReplyMarkup(chatId, messageId, null);
    await TelegramService.sendAudio(recordingUrl, `🎙️ Recording for call ${call.call_id}`);
}

/**
 * Handle SMS reply request for a call
 * Prompts admin to send SMS to the caller's number
 * @param {Object} call - Call record
 * @param {string} chatId - Telegram chat ID
 * @param {number} messageId - Original message ID to edit
 */
async function handleSMSReplyRequest(call, chatId, messageId) {
    // Get client phone number
    let phone = call.phone_number;
    
    if (!phone && call.client_id) {
        const client = Client.findById(call.client_id);
        if (client) {
            phone = client.phone_number;
        }
    }
    
    if (!phone) {
        await TelegramService.sendMessage('💬 <b>SMS Reply</b>\n\nNo phone number found for this caller.', { force: true });
        return;
    }
    
    await editMessageReplyMarkup(chatId, messageId, null);
    
    const instructions = `💬 <b>SMS Reply to ${phone}</b>\n\n` +
                         `Use /reply ${phone} [message] to send an SMS.\n\n` +
                         `Example: /reply ${phone} Thank you for calling!`;
    
    await TelegramService.sendMessage(instructions, { force: true });
}

/**
 * Edit message reply markup (remove buttons)
 * @param {string} chatId - Telegram chat ID
 * @param {number} messageId - Message ID
 * @param {Object|null} replyMarkup - New reply markup or null to remove
 */
async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
    try {
        await fetch(`${TelegramService.apiUrl}/editMessageReplyMarkup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                reply_markup: replyMarkup
            })
        });
    } catch (error) {
        console.error('Failed to edit message reply markup:', error.message);
    }
}

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
