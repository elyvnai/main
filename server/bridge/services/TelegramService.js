const fetch = require('node-fetch');

class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.rateLimit = new Map();
  }

  async sendMessage(text, options = {}) {
    const chatId = options.chat_id;
    if (!chatId) {
      console.warn('⚠️ Telegram sendMessage: No chat_id provided');
      return { ok: false, error: 'No chat_id provided' };
    }

    // Rate limiting logic
    const key = `telegram:${chatId}`;
    const now = Date.now();
    
    if (!this.rateLimit.has(key)) {
      this.rateLimit.set(key, []);
    }
    
    let timestamps = this.rateLimit.get(key).filter(t => now - t < 1000);
    
    if (timestamps.length >= 20) { // 20 msg/sec safety margin
      try {
        const { webhookQueue } = require('../utils/queue');
        await webhookQueue.add('telegram-delayed', { 
          source: 'telegram-delayed',
          payload: { text, options } 
        }, { delay: 1000 });
        console.log(`[Telegram] Rate limit hit for ${chatId}, message queued with delay`);
        return { ok: true, queued: true };
      } catch (queueError) {
        console.error('❌ Failed to queue delayed telegram message:', queueError.message);
        // Fallback: try to send anyway or just fail
      }
    }
    
    timestamps.push(now);
    this.rateLimit.set(key, timestamps);

    try {
      const payload = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...options
      };
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!result.ok) {
        console.error('❌ Telegram sendMessage error:', result.description);
      }
      return result;
    } catch (error) {
      console.error('❌ Telegram sendMessage exception:', error.message);
      return { ok: false, error: error.message };
    }
  }

  async sendAudio(audioUrl, caption, chatId) {
    try {
      const payload = {
        chat_id: chatId,
        audio: audioUrl,
        caption,
        parse_mode: 'HTML'
      };
      const response = await fetch(`${this.apiUrl}/sendAudio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Telegram sendAudio error:', error.message);
      return { ok: false, error: error.message };
    }
  }

  async sendDocument(docUrl, caption, chatId) {
    try {
      const payload = {
        chat_id: chatId,
        document: docUrl,
        caption,
        parse_mode: 'HTML'
      };
      const response = await fetch(`${this.apiUrl}/sendDocument`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Telegram sendDocument error:', error.message);
      return { ok: false, error: error.message };
    }
  }

  async sendCallNotification(call, client, type = 'ended') {
    if (!client.ai_enabled) return;
    const emoji = type === 'started' ? '🔔' : (call.outcome === 'booked' ? '✅' : (call.status === 'missed' ? '❌' : '📞'));
    const duration = call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : '0s';
    let text = `${emoji} <b>${type === 'started' ? 'Inbound Call' : 'Call ' + call.status.toUpperCase()}</b>\n\n`;
    text += `👤 From: ${call.caller_phone || 'Unknown'}\n`;
    if (type !== 'started') text += `⏱ Duration: ${duration}\n`;
    if (call.outcome) text += `🎯 Outcome: ${call.outcome.toUpperCase()}\n`;
    if (call.summary) text += `\n📝 <b>Summary:</b> ${call.summary}\n`;
    const buttons = [];
    if (call.transcript) buttons.push([{ text: '📄 View Transcript', callback_data: `transcript_${call.call_id}` }]);
    if (call.recording_url) buttons.push([{ text: '🔊 Download Recording', callback_data: `recording_${call.call_id}` }]);
    buttons.push([{ text: '💬 Reply via SMS', callback_data: `sms_reply_${call.call_id}` }]);
    return this.sendMessage(text, { chat_id: client.telegram_chat_id, reply_markup: { inline_keyboard: buttons } });
  }

  async sendAppointmentNotification(appointment, client) {
    if (!client.ai_enabled) return;
    const text = `📅 <b>New Appointment Booked!</b>\n\n👤 ${appointment.name}\n📧 ${appointment.email}\n📅 ${appointment.date} at ${appointment.time}\n${appointment.confirmationId ? `🔖 Confirmation: ${appointment.confirmationId}\n` : ''}`;
    return this.sendMessage(text, { chat_id: client.telegram_chat_id });
  }

  async sendTransferNotification(callId, client, reason) {
    if (!client.ai_enabled) return;
    const text = `🚨 <b>Transfer Requested</b>\n\nCall ID: ${callId}\nReason: ${reason}\nClient: ${client.business_name}\n\nPlease be ready to take the call.`;
    return this.sendMessage(text, { chat_id: client.telegram_chat_id });
  }

  async sendErrorAlert(error, context = 'Error') {
    const text = `❌ <b>${context}</b>\n\n<code>${error.message || error}</code>`;
    return this.sendMessage(text, { chat_id: process.env.TELEGRAM_CHAT_ID, force: true });
  }

  async sendSMSNotification(message, client) {
    if (!client.ai_enabled) return;
    const text = `💬 <b>Reply from ${message.phone || 'Unknown'}</b>\n\n"${message.body || message.content}"\n\nReply to this message to text them back.`;
    return this.sendMessage(text, {
      chat_id: client.telegram_chat_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📞 Call them', callback_data: `call_back:${message.phone}` }],
          [{ text: '✅ Mark booked', callback_data: `mark_booked:${message.phone}` }]
        ]
      }
    });
  }
}

module.exports = new TelegramService();
