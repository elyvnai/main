const fetch = require('node-fetch');

class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.paused = false;
  }

  async sendMessage(text, options = {}) {
    if (this.paused && !options.force) return;
    try {
      const payload = {
        chat_id: options.chat_id || this.chatId,
        text,
        parse_mode: 'HTML',
        ...options
      };
      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Telegram sendMessage error:', error.message);
      return { ok: false, error: error.message };
    }
  }

  async sendAudio(audioUrl, caption) {
    if (this.paused) return;
    try {
      const payload = {
        chat_id: this.chatId,
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

  async sendDocument(docUrl, caption) {
    if (this.paused) return;
    try {
      const payload = {
        chat_id: this.chatId,
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

  async sendToAdmin(text, options = {}) {
    return this.sendMessage(text, options);
  }

  async sendCallNotification(call, client, type = 'ended') {
    const emoji = type === 'started' ? '🔔' : (call.outcome === 'booked' ? '✅' : (call.status === 'missed' ? '❌' : '📞'));
    const duration = call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : '0s';
    
    let text = `${emoji} <b>${type === 'started' ? 'Inbound Call' : 'Call ' + call.status.toUpperCase()}</b>\n\n`;
    text += `👤 From: ${call.caller_phone || 'Unknown'}\n`;
    if (type !== 'started') text += `⏱ Duration: ${duration}\n`;
    if (call.outcome) text += `🎯 Outcome: ${call.outcome.toUpperCase()}\n`;
    if (call.summary) text += `\n📝 <b>Summary:</b> ${call.summary}\n`;
    
    const buttons = [];
    if (call.transcript) {
      buttons.push([{ text: '📄 View Transcript', callback_data: `transcript_${call.call_id}` }]);
    }
    if (call.recording_url) {
      buttons.push([{ text: '🔊 Download Recording', callback_data: `recording_${call.call_id}` }]);
    }
    buttons.push([{ text: '💬 Reply via SMS', callback_data: `sms_reply_${call.call_id}` }]);

    return this.sendMessage(text, {
      reply_markup: { inline_keyboard: buttons },
      chat_id: client?.telegram_chat_id || this.chatId
    });
  }

  async sendAppointmentNotification({ name, email, date, time, confirmationId }, client) {
    const text = `📅 <b>New Appointment Booked!</b>\n\n` +
      `👤 ${name}\n` +
      `📧 ${email}\n` +
      `📅 ${date} at ${time}\n` +
      `${confirmationId ? `🔖 Confirmation: ${confirmationId}\n` : ''}`;
    return this.sendMessage(text, { chat_id: client?.telegram_chat_id || this.chatId });
  }

  async sendTransferNotification(callId, client, reason) {
    const text = `🚨 <b>Transfer Requested</b>\n\n` +
      `Call ID: ${callId}\n` +
      `Reason: ${reason}\n` +
      `Client: ${client?.business_name || 'Unknown'}\n\n` +
      `Please be ready to take the call.`;
    return this.sendMessage(text, { chat_id: client?.telegram_chat_id || this.chatId });
  }

  async sendErrorAlert(error, context = 'Error') {
    const text = `❌ <b>${context}</b>\n\n<code>${error.message || error}</code>`;
    return this.sendMessage(text, { force: true });
  }

  async sendSMSNotification(message, client) {
    const text = `💬 <b>Reply from ${message.phone || 'Unknown'}</b>\n\n` +
      `"${message.body || message.content}"\n\n` +
      `Reply to this message to text them back.`;
    return this.sendMessage(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📞 Call them', callback_data: `call_back:${message.phone}` }],
          [{ text: '✅ Mark booked', callback_data: `mark_booked:${message.phone}` }]
        ]
      },
      chat_id: client?.telegram_chat_id || this.chatId
    });
  }
}

module.exports = new TelegramService();
