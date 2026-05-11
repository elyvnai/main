const fetch = require('node-fetch');

class CalComService {
  constructor() {
    this.apiKey = process.env.CALCOM_API_KEY;
    this.baseUrl = 'https://api.cal.com/v1';
  }

  getHeaders(apiKeyOverride) {
    const key = apiKeyOverride || this.apiKey;
    return {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    };
  }

  async checkAvailability(date, client) {
    try {
      if (!client?.calcom_booking_link && !client?.calcom_event_type_id) {
        throw new Error('Cal.com not configured for this client');
      }
      
      // TODO: Implement real Cal.com availability check using client credentials
      // For now, still returning stub but accepting client context
      console.log(`[CalCom] Checking availability for ${date} (Client: ${client.business_name})`);
      return {
        available: true,
        slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
      };
    } catch (error) {
      console.error('❌ CalCom checkAvailability error:', error.message);
      return { available: false, error: error.message };
    }
  }

  async bookAppointment({ name, email, date, time, phoneNumber }, client) {
    try {
      if (!client?.calcom_booking_link && !client?.calcom_event_type_id) {
        throw new Error('Cal.com not configured for this client');
      }

      console.log(`[CalCom] Booking appointment for ${name} (Client: ${client.business_name})`);
      
      // TODO: Implement real Cal.com booking using client credentials
      // Return mock success for now
      return {
        success: true,
        confirmationId: `CAL-${Date.now()}`,
        scheduledAt: `${date}T${time}:00Z`,
        message: 'Appointment booked successfully'
      };
    } catch (error) {
      console.error('❌ CalCom bookAppointment error:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new CalComService();
