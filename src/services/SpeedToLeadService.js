const Call = require('../models/Call');
const Client = require('../models/Client');
const Message = require('../models/Message');
const SmsOptOut = require('../models/SmsOptOut');
const TwilioService = require('./TwilioService');
const TelegramService = require('./TelegramService');
class SpeedToLeadService {
    async handleMissedCall(callData) {
        try {
            const phone = TwilioService.normalizePhoneNumber(callData.phoneNumber);
            if (!phone) return;
            if (SmsOptOut.isOptedOut(phone)) {
                console.log(`⏭️ ${phone} opted out, skipping SMS`);
                return;
            }
            let client = Client.findByPhone(phone);
            if (!client) {
                client = Client.create({ phone_number: phone, source: 'missed_call' });
            }
            const response = await TwilioService.sendFullMenuSMS(phone);
            if (response.success) {
                Message.create({
                    client_id: client.id,
                    direction: 'outbound',
                    content: 'Full Menu SMS',
                    status: 'sent',
                    twilio_sid: response.sid,
                    retell_call_id: callData.callId
                });
                await TelegramService.sendMessage(`🚀 <b>Instant SMS Sent</b>\nTo: ${phone}`);
            }
        } catch (error) {
            console.error('❌ SpeedToLead error:', error);
        }
    }
    shouldSendSpeedToLead(callData) {
        if (callData.direction === 'outbound') return false;
        const duration = callData.duration || 0;
        if (duration < 10) return true;
        const missedReasons = [
            'customer_no_response', 'customer_busy', 'customer_declined',
            'abandoned', 'no_answer', 'hang_up', 'voicemail'
        ];
        if (callData.disconnectReason && missedReasons.includes(callData.disconnectReason.toLowerCase())) {
            return true;
        }
        return false;
    }
}
module.exports = new SpeedToLeadService();