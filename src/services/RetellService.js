const fetch = require('node-fetch');
class RetellService {
    constructor() {
        this.apiKey = process.env.RETELL_API_KEY;
    }
    async registerCall(callId, phoneNumber, agentId) {
        if (!this.apiKey) return;
        try {
            await fetch('https://api.retellai.com/register-phone-number', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone_number_id: callId,
                    customer_number: phoneNumber,
                    agent_id: agentId
                })
            });
        } catch (error) {
            console.warn('RetellService registerCall error:', error.message);
        }
    }
}
module.exports = new RetellService();