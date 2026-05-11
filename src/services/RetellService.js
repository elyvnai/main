const fetch = require('node-fetch');
const { generateSystemPrompt } = require('../prompts/systemPrompt');

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

    /**
     * Updates the Retell Agent configuration
     * @param {string} agentId - The ID of the agent to update
     * @param {Object} updateData - The data to update (e.g., { system_prompt: "..." })
     * @returns {Promise<Object|null>} The updated agent data or null if failed
     */
    async updateAgent(agentId, updateData) {
        try {
            if (!this.apiKey) {
                console.warn('⚠️ RETELL_API_KEY is not set. Skipping agent update.');
                return null;
            }

            const response = await fetch(`${this.baseUrl}/update-agent/${agentId}`, {
                method: 'PATCH',
                headers: this.getHeaders(),
                body: JSON.stringify(updateData)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('❌ Retell updateAgent error:', data);
                return null;
            }

            return data;
        } catch (error) {
            console.error('❌ Retell updateAgent exception:', error.message);
            return null;
        }
    }

    /**
     * Synchronizes the local system prompt template with the Retell API
     */
    async syncAgentPrompt() {
        try {
            const agentId = process.env.RETELL_AGENT_ID;
            
            if (!agentId) {
                console.warn('⚠️ RETELL_AGENT_ID is not set. Skipping prompt sync.');
                return;
            }

            const businessConfig = {
                businessName: process.env.BUSINESS_NAME || 'Elyvn',
                businessHours: process.env.BUSINESS_HOURS || 'Not specified',
                bookingLink: process.env.BOOKING_LINK || 'Not specified'
            };

            const systemPrompt = generateSystemPrompt(businessConfig);

            console.log(`🔄 Syncing Retell Agent Prompt for agent: ${agentId}...`);
            
            const result = await this.updateAgent(agentId, {
                system_prompt: systemPrompt
            });

            if (result) {
                console.log('✅ Retell Agent Prompt synchronized successfully.');
            } else {
                console.warn('⚠️ Failed to synchronize Retell Agent Prompt.');
            }
        } catch (error) {
            console.error('❌ Error in syncAgentPrompt:', error.message);
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
