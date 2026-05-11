const fetch = require('node-fetch');

class TelegramService {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
        this.businessName = process.env.BUSINESS_NAME || 'Elyvn';
        this.bookingLink = process.env.BOOKING_LINK || '';
        this.businessHours = process.env.BUSINESS_HOURS || '';
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

    async sendDocument(docUrl, caption) {
        if (this.paused) return;
        try {
            const payload = {
                chat_id: this.chatId,
                document: docUrl,
                caption: caption,
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

    /**
     * Send call notification with different formats for started vs ended calls
     * @param {Object} call - Call data from database
     * @param {Object} client - Client data from database
     * @param {string} type - Type of notification: 'started' or 'ended'
     * @returns {Promise<Object>} Telegram API response
     */
    async sendCallNotification(call, client, type = 'ended') {
        const firstName = client?.first_name || client?.name || 'Unknown';
        const phone = client?.phone_number || call.phone_number || 'Unknown';
        const callId = call.call_id || 'Unknown';
        
        if (type === 'started') {
            // Live Call format - shows active call with Listen button
            const now = new Date().toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
            });
            
            const message = `📞 <b>🔴 LIVE CALL STARTED</b>\n\n` +
                          `👤 <b>Caller:</b> ${firstName}\n` +
                          `📱 <b>Phone:</b> ${phone}\n` +
                          `🕐 <b>Started:</b> ${now}\n` +
                          `🆔 <b>Call ID:</b> <code>${callId}</code>\n\n` +
                          `<i>Awaiting call completion...</i>`;
            
            return this.sendMessage(message);
        } else {
            // Completed Call format - shows summary with action buttons
            const duration = call.duration || 0;
            const durationStr = duration >= 60 
                ? `${Math.floor(duration / 60)}m ${duration % 60}s`
                : `${duration}s`;
            
            let summary = call.call_summary || '';
            const outcome = call.outcome || '';
            
            const message = `✅ <b>Call Completed</b>\n\n` +
                          `👤 <b>Caller:</b> ${firstName}\n` +
                          `📱 <b>Phone:</b> ${phone}\n` +
                          `⏱️ <b>Duration:</b> ${durationStr}\n` +
                          `📊 <b>Status:</b> ${call.status || 'completed'}\n`;
            
            if (summary) {
                message += `\n📝 <b>Summary:</b>\n${summary.substring(0, 200)}${summary.length > 200 ? '...' : ''}`;
            }
            
            if (outcome) {
                message += `\n\n🎯 <b>Outcome:</b> ${outcome}`;
            }
            
            message += `\n\n🆔 <b>Call ID:</b> <code>${callId}</code>`;
            
            // Add inline keyboard with action buttons
            return this.sendMessage(message, {
                reply_markup: JSON.stringify({
                    inline_keyboard: [[
                        { text: '📝 Transcript', callback_data: `transcript_${call.id}` },
                        { text: '🎙️ Recording', callback_data: `recording_${call.id}` },
                        { text: '💬 SMS Reply', callback_data: `sms_reply_${call.id}` }
                    ]]
                })
            });
        }
    }

    /**
     * Send SMS notification to admin
     * @param {Object} message - Message data
     * @param {Object} client - Client data
     * @returns {Promise<Object>} Telegram API response
     */
    async sendSMSNotification(message, client) {
        const firstName = client?.first_name || client?.name || 'Unknown';
        const phone = client?.phone_number || 'Unknown';
        const content = message.content || 'No content';
        
        const text = `💬 <b>New SMS</b>\n\n` +
                     `👤 <b>From:</b> ${firstName}\n` +
                     `📱 <b>Phone:</b> ${phone}\n\n` +
                     `${content}`;
        
        return this.sendMessage(text);
    }

    /**
     * Send error alert to admin
     * @param {Error} error - Error object or error message
     * @param {string} context - Context description
     * @returns {Promise<Object>} Telegram API response
     */
    async sendErrorAlert(error, context) {
        const text = `🚨 <b>Error Alert</b>\n\n` +
                     `<b>Context:</b> ${context}\n` +
                     `<b>Error:</b> <code>${error.message || error}</code>`;
        return this.sendMessage(text, { force: true });
    }

    /**
     * Send appointment booking notification
     * @param {Object} appointment - Appointment details
     * @param {Object} client - Client data
     * @returns {Promise<Object>} Telegram API response
     */
    async sendAppointmentNotification(appointment, client) {
        const firstName = client?.first_name || client?.name || 'Unknown';
        const email = client?.email || appointment.email || 'Unknown';
        const phone = client?.phone_number || 'Unknown';
        
        const text = `📅 <b>New Appointment Booked</b>\n\n` +
                     `👤 <b>Name:</b> ${appointment.name || firstName}\n` +
                     `📧 <b>Email:</b> ${appointment.email || email}\n` +
                     `📱 <b>Phone:</b> ${phone}\n` +
                     `📆 <b>Date:</b> ${appointment.date}\n` +
                     `🕐 <b>Time:</b> ${appointment.time}\n` +
                     `🆔 <b>ID:</b> <code>${appointment.confirmationId || 'N/A'}</code>`;
        
        return this.sendMessage(text);
    }

    /**
     * Send transfer request notification
     * @param {string} callId - Call ID
     * @param {Object} client - Client data
     * @param {string} [reason] - Reason for transfer
     * @returns {Promise<Object>} Telegram API response
     */
    async sendTransferNotification(callId, client, reason = '') {
        const firstName = client?.first_name || client?.name || 'Unknown';
        const phone = client?.phone_number || 'Unknown';
        const transferNumber = process.env.TRANSFER_PHONE_NUMBER || 'Not configured';
        
        let text = `📞 <b>Transfer Requested</b>\n\n` +
                   `👤 <b>Caller:</b> ${firstName}\n` +
                   `📱 <b>Phone:</b> ${phone}\n` +
                   `🆔 <b>Call ID:</b> <code>${callId}</code>\n` +
                   `📞 <b>Transfer To:</b> ${transferNumber}`;
        
        if (reason) {
            text += `\n\n<b>Reason:</b> ${reason}`;
        }
        
        return this.sendMessage(text);
    }

    /**
     * Send lead notification (urgent or callback request)
     * @param {string} type - Type: 'urgent' or 'callback'
     * @param {Object} client - Client data
     * @param {Object} call - Call data
     * @returns {Promise<Object>} Telegram API response
     */
    async sendLeadNotification(type, client, call) {
        const firstName = client?.first_name || client?.name || 'Unknown';
        const phone = client?.phone_number || call.phone_number || 'Unknown';
        const callId = call.call_id || 'Unknown';
        
        let emoji = type === 'urgent' ? '⚡' : '📞';
        let title = type === 'urgent' ? 'URGENT LEAD' : 'CALLBACK REQUEST';
        
        const text = `${emoji} <b>${title}</b>\n\n` +
                     `👤 <b>Name:</b> ${firstName}\n` +
                     `📱 <b>Phone:</b> ${phone}\n` +
                     `🆔 <b>Call ID:</b> <code>${callId}</code}`;
        
        return this.sendMessage(text);
    }

    /**
     * Pause notifications (useful during maintenance)
     */
    pause() {
        this.paused = true;
        console.log('📴 Telegram notifications paused');
    }

    /**
     * Resume notifications
     */
    resume() {
        this.paused = false;
        console.log('📴 Telegram notifications resumed');
    }
}

module.exports = new TelegramService();
