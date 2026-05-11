const twilio = require('twilio');

class TwilioService {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
        this.businessName = process.env.BUSINESS_NAME || 'Elyvn';
        this.bookingLink = process.env.BOOKING_LINK || '';
        this.businessHours = process.env.BUSINESS_HOURS || '';
        this.transferPhoneNumber = process.env.TRANSFER_PHONE_NUMBER || '';
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

    /**
     * Sends the Full Menu SMS with all appointment booking options
     * This is the Speed-to-Lead message sent after missed calls
     * @param {string} to - Recipient phone number
     * @returns {Promise<{success: boolean, sid?: string, status?: string, error?: string}>}
     */
    async sendFullMenuSMS(to) {
        const callbackNumber = this.phoneNumber;
        
        let body = `Hi from ${this.businessName}! 👋

We noticed you tried to reach us. Here's how we can help:

1️⃣ Book Online: ${this.bookingLink}
2️⃣ Our Hours: ${this.businessHours}
3️⃣ Request a Callback: Reply CALLBACK
4️⃣ Need Help Now? Reply URGENT

We'll reach out within 1 hour!

Call or text us: ${callbackNumber}
Reply STOP to opt out.`;

        return this.sendSMS(to, body);
    }

    /**
     * Sends a quick response acknowledging a callback request
     * @param {string} to - Recipient phone number
     * @returns {Promise<{success: boolean, sid?: string, status?: string, error?: string}>}
     */
    async sendCallbackConfirmation(to) {
        const body = `Thanks! A team member from ${this.businessName} will call you back within the next hour. 

If you need immediate assistance, call us at ${this.phoneNumber}.

Reply STOP to opt out.`;

        return this.sendSMS(to, body);
    }

    /**
     * Sends confirmation of an urgent priority flag
     * @param {string} to - Recipient phone number
     * @returns {Promise<{success: boolean, sid?: string, status?: string, error?: string}>}
     */
    async sendUrgentAcknowledgment(to) {
        const body = `Your request has been marked URGENT. A team member from ${this.businessName} will prioritize your call and reach out immediately.

For instant help, call us at ${this.phoneNumber}.

Reply STOP to opt out.`;

        return this.sendSMS(to, body);
    }

    /**
     * Sends appointment booking confirmation via SMS
     * @param {string} to - Recipient phone number
     * @param {Object} appointmentDetails - Appointment information
     * @param {string} appointmentDetails.date - Appointment date
     * @param {string} appointmentDetails.time - Appointment time
     * @param {string} [appointmentDetails.confirmationId] - Booking confirmation ID
     * @returns {Promise<{success: boolean, sid?: string, status?: string, error?: string}>}
     */
    async sendAppointmentConfirmation(to, appointmentDetails) {
        const body = `📅 Appointment Confirmed with ${this.businessName}!

Date: ${appointmentDetails.date}
Time: ${appointmentDetails.time}
${appointmentDetails.confirmationId ? `Confirmation: ${appointmentDetails.confirmationId}` : ''}

Need to reschedule? Visit: ${this.bookingLink}

Reply STOP to opt out.`;

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