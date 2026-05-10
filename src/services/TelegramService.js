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
                chat_id: this.chatId,
                text: text,
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
                caption: caption,
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

    async sendToAdmin(text, options = {}) {
        return this.sendMessage(text, options);
    }

    async sendCallNotification(call, client, type = 'ended') {
        const firstName = client?.first_name || 'Unknown';
        const phone = client?.phone_number || call.phone_number || 'Unknown';
        
        let message = '';
        if (type === 'started') {
            message = `📞 <b>Call Started</b>\n\n👤 <b>Client:</b> ${firstName}\n📱 <b>Phone:</b> ${phone}\n🆔 <b>ID:</b> <code>${call.call_id}</code>`;
        } else {
            const statusEmoji = call.status === 'completed' ? '✅' : '❌';
            message = `${statusEmoji} <b>Call Ended</b>\n\n👤 <b>Client:</b> ${firstName}\n📱 <b>Phone:</b> ${phone}\n⏱️ <b>Duration:</b> ${call.duration || 0}s\n📊 <b>Status:</b> ${call.status}\n🆔 <b>ID:</b> <code>${call.call_id}</code>`;
        }

        return this.sendMessage(message);
    }

    async sendSMSNotification(message, client) {
        const firstName = client?.first_name || 'Unknown';
        const phone = client?.phone_number || 'Unknown';
        
        const text = `💬 <b>New SMS</b>\n\n👤 <b>From:</b> ${firstName}\n📱 <b>Phone:</b> ${phone}\n\n${message.content}`;
        
        return this.sendMessage(text);
    }

    async sendErrorAlert(error, context) {
        const text = `🚨 <b>Error Alert</b>\n\n<b>Context:</b> ${context}\n<b>Error:</b> <code>${error.message || error}</code>`;
        return this.sendMessage(text, { force: true });
    }
}

module.exports = new TelegramService();
