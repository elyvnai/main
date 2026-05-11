const fetch = require('node-fetch');
const fs = require('fs');
const FormData = require('form-data');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId, text, options = {}) {
  try {
    const response = await fetch(`${API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        ...options
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Telegram sendMessage error:', error);
    return { ok: false, error: error.message };
  }
}

async function sendAudio(chatId, filePath, options = {}) {
  try {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('audio', fs.createReadStream(filePath));
    if (options.caption) formData.append('caption', options.caption);

    const response = await fetch(`${API_URL}/sendAudio`, {
      method: 'POST',
      body: formData
    });
    return await response.json();
  } catch (error) {
    console.error('Telegram sendAudio error:', error);
    return { ok: false, error: error.message };
  }
}

function formatCallNotification(call, client) {
  const duration = call.duration || 0;
  const outcome = call.outcome || 'unknown';
  const emoji = outcome === 'booked' ? '✅' : outcome === 'missed' ? '❌' : '📞';
  
  return `${emoji} **Call ${outcome.toUpperCase()}**\n\n👤 From: ${call.caller_phone}\n⏱ Duration: ${duration}s\n\n_Summary: ${call.summary || 'No summary available.'}_`;
}

function formatTransferAlert(call, client) {
  return `🚨 **Transfer Requested**\n\n👤 From: ${call.caller_phone}\n📞 Transferring to: ${client.transfer_phone || 'Owner'}\n\n_Please be ready to take the call._`;
}

module.exports = {
  sendMessage,
  sendAudio,
  formatCallNotification,
  formatTransferAlert
};
