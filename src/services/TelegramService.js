const fetch = require('node-fetch');
class TelegramService {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
    }
    async sendMessage(text) {
        if (!this.botToken || !this.chatId) return;
        try {
            await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text,
                    parse_mode: 'HTML'
                })
            });
        } catch (error) {
            console.warn('Telegram sendMessage error:', error.message);
        }
    }
    async sendToAdmin(text) {
        return this.sendMessage(text);
    }
    async sendErrorAlert(error, context = '') {
        const msg = `🚨 <b>Elyvn Error</b>\n${context ? `Context: ${context}\n` : ''}Error: ${error.message || error}`;
        return this.sendMessage(msg);
    }
}
module.exports = new TelegramService();