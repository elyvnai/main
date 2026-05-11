const fetch = require('node-fetch');

class CalComService {
    constructor() {
        this.apiKey = process.env.CALCOM_API_KEY;
        this.eventTypeId = process.env.CALCOM_EVENT_TYPE_ID;
        this.baseUrl = 'https://api.cal.com/v1';
    }

    async checkAvailability(date) {
        try {
            if (!this.apiKey || !this.eventTypeId) {
                console.warn('⚠️ CALCOM_API_KEY or CALCOM_EVENT_TYPE_ID is not set.');
                return 'Availability check is currently unavailable.';
            }

            // Cal.com v1 /slots expects startTime and endTime
            const startTime = `${date}T00:00:00Z`;
            const endTime = `${date}T23:59:59Z`;
            
            const url = `${this.baseUrl}/slots?apiKey=${this.apiKey}&eventTypeId=${this.eventTypeId}&startTime=${startTime}&endTime=${endTime}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (!response.ok) {
                console.error('❌ Cal.com checkAvailability error:', data);
                return `Error checking availability: ${data.message || 'Unknown error'}`;
            }

            // In Cal.com v1, slots are returned in an object keyed by date
            const slots = data.slots[date] || [];
            if (slots.length === 0) {
                return `No available slots for ${date}. Please try another date.`;
            }

            const availableTimes = slots.map(slot => {
                // slot.time is usually ISO string
                const time = new Date(slot.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                return time;
            }).join(', ');

            return `Available slots for ${date}: ${availableTimes}`;
        } catch (error) {
            console.error('❌ Cal.com checkAvailability exception:', error.message);
            return 'Failed to check availability due to a technical error.';
        }
    }

    async bookAppointment(bookingData) {
        try {
            if (!this.apiKey || !this.eventTypeId) {
                console.warn('⚠️ CALCOM_API_KEY or CALCOM_EVENT_TYPE_ID is not set.');
                return { success: false, message: 'Booking is currently unavailable.' };
            }

            // bookingData: { name, email, date, time, phoneNumber }
            // Ensure time is in HH:mm format
            const start = new Date(`${bookingData.date}T${bookingData.time}:00Z`).toISOString();
            
            const response = await fetch(`${this.baseUrl}/bookings?apiKey=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventTypeId: parseInt(this.eventTypeId),
                    start: start,
                    responses: {
                        name: bookingData.name,
                        email: bookingData.email,
                        location: {
                            value: 'phone',
                            optionValue: bookingData.phoneNumber
                        }
                    },
                    metadata: {
                        phoneNumber: bookingData.phoneNumber
                    },
                    timeZone: 'UTC'
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('❌ Cal.com bookAppointment error:', data);
                return { success: false, message: data.message || 'Failed to book appointment.' };
            }

            return { 
                success: true, 
                booking: data.booking,
                scheduledAt: start
            };
        } catch (error) {
            console.error('❌ Cal.com bookAppointment exception:', error.message);
            return { success: false, message: 'Failed to book appointment due to a technical error.' };
        }
    }
}

module.exports = new CalComService();
