const twilio = require('twilio');
class TwilioService {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
        this._client = null;
    }
    get client() {
        if (!this._client && this.accountSid && this.authToken) {
            this._client = twilio(this.accountSid, this.authToken);
        }
        return this._client;
    }
    async sendSMS(to, body) {
        if (!this.client) {
            console.warn('⚠️ Twilio client not configured, SMS not sent');
            return { success: false, error: 'Twilio not configured' };
        }
        try {
            const message = await this.client.messages.create({
                body: body,
                from: this.phoneNumber,
                to: to
            });
            console.log(`📤 SMS sent to ${to}: ${message.sid}`);
            return {
                success: true,
                sid: message.sid,
                status: message.status
            };
        } catch (error) {
            console.error('❌ Twilio sendSMS error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    async sendFullMenuSMS(to) {
        const businessName = process.env.BUSINESS_NAME || 'Elyvn';
        const bookingLink = process.env.BOOKING_LINK || 'N/A';
        const businessHours = process.env.BUSINESS_HOURS || 'N/A';
        const callbackNumber = this.phoneNumber;
        const body = `Hi, this is ${businessName}. Sorry we missed your call. How can we help?\n1. Book an appointment: ${bookingLink}\n2. Request a callback: Reply 'CALLBACK'\n3. Our hours: ${businessHours}\n4. URGENT: Reply 'URGENT' to be prioritized.\nCall us back at ${callbackNumber}.`;
        return this.sendSMS(to, body);
    }
    normalizePhoneNumber(phone) {
        if (!phone) return null;
        let normalized = phone.replace(/[^\d+]/g, '');
        if (normalized.length === 10) {
            normalized = '+1' + normalized;
        } else if (normalized.length === 11 && normalized.startsWith('1')) {
            normalized = '+' + normalized;
        } else if (!normalized.startsWith('+')) {
            normalized = '+' + normalized;
        }
        return normalized;
    }
}
module.exports = new TwilioService();