const fetch = require('node-fetch');

class RetellService {
    constructor() {
        this.apiKey = process.env.RETELL_API_KEY;
        this.agentId = process.env.RETELL_AGENT_ID;
        this.baseUrl = 'https://api.retell.ai/v1';
    }

    getHeaders() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
        };
    }

    async getCall(callId) {
        try {
            const response = await fetch(`${this.baseUrl}/call/${callId}`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('❌ Retell getCall error:', error.message);
            return null;
        }
    }

    parseCallEvent(eventData) {
        const call = eventData.call || eventData;
        return {
            callId: call.call_id,
            agentId: call.agent_id,
            phoneNumber: call.from_number || call.to_number || call.phone_number,
            direction: call.direction,
            status: call.call_status,
            duration: call.duration_ms ? Math.round(call.duration_ms / 1000) : 0,
            transcript: call.transcript,
            summary: call.call_analysis?.call_summary,
            recordingUrl: call.recording_url,
            disconnectReason: call.disconnection_reason,
            startedAt: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
            endedAt: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null
        };
    }
}

module.exports = new RetellService();
