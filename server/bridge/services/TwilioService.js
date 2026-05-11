const twilio = require('twilio');
const { getDb } = require('../utils/dbAdapter');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this._client = null;
    this.rateLimit = new Map();
  }

  get client() {
    if (!this._client && this.accountSid && this.authToken) {
      this._client = twilio(this.accountSid, this.authToken);
    }
    return this._client;
  }

  async sendSMS(to, body, clientId = null, dbClient = null, fromOverride = null) {
    const db = dbClient || getDb();
    
    // Check opt-out if clientId provided
    if (clientId) {
      const { rows } = await db.query('SELECT 1 FROM sms_opt_outs WHERE phone = $1 AND client_id = $2', [to, clientId]);
      if (rows.length > 0) {
        console.log(`[SMS] Blocked: ${to} is opted out for client ${clientId}`);
        return { success: false, error: 'Opted out' };
      }
    }

    // Determine from number: fromOverride > client.phone_number > env.TWILIO_PHONE_NUMBER
    let from = fromOverride || this.phoneNumber;
    if (!fromOverride && clientId) {
      const { rows: clients } = await db.query('SELECT phone_number FROM clients WHERE id = $1', [clientId]);
      if (clients[0]?.phone_number) {
        from = clients[0].phone_number;
      }
    }

    // Rate limiting logic (per from-number)
    const key = `sms:${from}`;
    const now = Date.now();
    if (!this.rateLimit.has(key)) {
      this.rateLimit.set(key, []);
    }
    let timestamps = this.rateLimit.get(key).filter(t => now - t < 1000);
    
    if (timestamps.length >= 1) { // 1 msg/sec limit for Twilio long codes
      try {
        const { webhookQueue } = require('../utils/queue');
        await webhookQueue.add('sms-delayed', { 
          source: 'sms-delayed',
          payload: { to, body, clientId, fromOverride: from } 
        }, { delay: 1000 });
        console.log(`[SMS] Rate limit hit for ${from}, message queued with delay`);
        return { success: true, queued: true };
      } catch (queueError) {
        console.error('❌ Failed to queue delayed SMS:', queueError.message);
      }
    }
    
    timestamps.push(now);
    this.rateLimit.set(key, timestamps);

    if (!this.client) {
      console.warn('⚠️ Twilio not configured, SMS not sent');
      return { success: false, error: 'Twilio not configured' };
    }
    try {
      const message = await this.client.messages.create({
        body,
        from,
        to
      });
      console.log(`📤 SMS sent from ${from} to ${to}: ${message.sid}`);
      return { success: true, sid: message.sid, status: message.status };
    } catch (error) {
      console.error('❌ Twilio sendSMS error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendFullMenuSMS(to, clientId = null, dbClient = null) {
    const body = `Hi! 👋\n\nWe missed you! Here's how to connect:\n\n📅 BOOK APPOINTMENT\n${process.env.BOOKING_LINK || 'Not configured'}\n\n⏰ OUR HOURS\n${process.env.BUSINESS_HOURS || 'Not configured'}\n\n📞 REQUEST CALLBACK\nReply CALLBACK - we'll call you within 1hr\n\n⚡ URGENT?\nReply URGENT - we'll prioritize you\n\n💬 GENERAL QUESTION?\nJust reply and we'll respond\n\nDirect: ${this.phoneNumber || 'Not configured'}\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId, dbClient);
  }

  async sendCallbackConfirmation(to, clientId = null, dbClient = null) {
    const body = `Thanks! A team member will call you back within the next hour.\n\nIf you need immediate assistance, call us at ${this.phoneNumber || 'Not configured'}.\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId, dbClient);
  }

  async sendUrgentAcknowledgment(to, clientId = null, dbClient = null) {
    const body = `Your request has been marked URGENT. A team member will prioritize your call and reach out immediately.\n\nFor instant help, call us at ${this.phoneNumber || 'Not configured'}.\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId, dbClient);
  }

  async sendAppointmentConfirmation(to, { date, time, confirmationId }, clientId = null, dbClient = null) {
    const body = `📅 Appointment Confirmed!\n\nDate: ${date}\nTime: ${time}\n${confirmationId ? `Confirmation: ${confirmationId}\n` : ''}Need to reschedule? Visit: ${process.env.BOOKING_LINK || 'Not configured'}\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId, dbClient);
  }

  async sendWelcomeSMS(to, clientId = null, dbClient = null) {
    const body = `Welcome! 🎉\n\nThank you for reaching out. We're here to help!\n\n📅 Book online: ${process.env.BOOKING_LINK || 'Not configured'}\n⏰ Hours: ${process.env.BUSINESS_HOURS || 'Not configured'}\n📞 Call/Text: ${this.phoneNumber || 'Not configured'}\n\nReply STOP to opt out.`;
    return this.sendSMS(to, body, clientId, dbClient);
  }

  normalizePhoneNumber(phone) {
    if (!phone) return null;
    let normalized = phone.replace(/[^\d+]/g, '');
    if (normalized.length === 10) normalized = '+1' + normalized;
    else if (normalized.length === 11 && normalized.startsWith('1')) normalized = '+' + normalized;
    else if (!normalized.startsWith('+')) normalized = '+' + normalized;
    return normalized;
  }
}

module.exports = new TwilioService();
