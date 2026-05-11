const express = require('express');
const router = express.Router();
const Call = require('../../models/Call');
const Client = require('../../models/Client');
const Appointment = require('../../models/Appointment');
const SpeedToLeadService = require('../../services/SpeedToLeadService');
const TelegramService = require('../../services/TelegramService');
const RetellService = require('../../services/RetellService');
const CalComService = require('../../services/CalComService');

router.post('/tools', async (req, res) => {
    try {
        const { interaction_type, tool_call_id, name, arguments: toolArguments, call_id } = req.body;

        if (interaction_type !== 'tool_call') {
            return res.status(400).json({ error: 'Invalid interaction type' });
        }

        console.log(`🛠️ Retell Tool Call [${name}] for call ${call_id}`);

        let result;
        if (name === 'check_availability') {
            const { date } = JSON.parse(toolArguments);
            result = await CalComService.checkAvailability(date);
        } else if (name === 'book_appointment') {
            const args = JSON.parse(toolArguments);
            
            // Get client for this call
            const call = Call.findByCallId(call_id);
            const client = call ? Client.findById(call.client_id) : null;
            
            const bookingResult = await CalComService.bookAppointment({
                ...args,
                phoneNumber: client?.phone_number || args.phoneNumber || 'unknown'
            });

            if (bookingResult.success) {
                // Local synchronization
                if (client) {
                    Appointment.create({
                        client_id: client.id,
                        title: `Appointment with ${args.name}`,
                        scheduled_at: bookingResult.scheduledAt,
                        duration_minutes: 30,
                        status: 'scheduled'
                    });
                }
                
                await TelegramService.sendMessage(`📅 <b>New Appointment Booked</b>\nFor: ${args.name}\nDate: ${args.date}\nTime: ${args.time}`);
                result = `Successfully booked appointment for ${args.name} on ${args.date} at ${args.time}.`;
            } else {
                result = `Failed to book appointment: ${bookingResult.message}`;
            }
        } else {
            return res.status(404).json({ error: 'Tool not found' });
        }

        res.status(200).json({
            interaction_type: 'tool_call_result',
            tool_call_id,
            content: result
        });
    } catch (error) {
        console.error('❌ Retell tools webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const event = req.body;
        console.log(`📡 Retell [${event.event}]`);

        const callData = RetellService.parseCallEvent(event);
        let client = Client.findByPhone(callData.phoneNumber);
        if (!client && callData.phoneNumber) {
            client = Client.create({ phone_number: callData.phoneNumber, source: 'retell' });
        }

        let call = Call.findByCallId(callData.callId);

        switch (event.event) {
            case 'call_started':
                if (!call) {
                    call = Call.create({
                        call_id: callData.callId,
                        client_id: client?.id,
                        direction: callData.direction,
                        status: 'in_progress',
                        started_at: callData.startedAt
                    });
                }
                await TelegramService.sendCallNotification(call, client, 'started');
                break;

            case 'call_ended':
                const isMissed = SpeedToLeadService.shouldSendSpeedToLead(callData);
                const status = isMissed ? 'missed' : 'completed';
                
                if (call) {
                    call = Call.update(call.id, {
                        status: status,
                        duration: callData.duration,
                        recording_url: callData.recordingUrl,
                        disconnect_reason: callData.disconnectReason,
                        ended_at: callData.endedAt
                    });
                } else {
                    call = Call.create({
                        call_id: callData.callId,
                        client_id: client?.id,
                        direction: callData.direction,
                        status: status,
                        duration: callData.duration,
                        recording_url: callData.recordingUrl,
                        disconnect_reason: callData.disconnectReason,
                        started_at: callData.startedAt,
                        ended_at: callData.endedAt
                    });
                }

                await TelegramService.sendCallNotification(call, client, 'ended');

                if (callData.recordingUrl) {
                    await TelegramService.sendAudio(callData.recordingUrl, `🎙️ Recording for call ${callData.callId}`);
                }

                if (isMissed) {
                    await SpeedToLeadService.handleMissedCall(callData);
                }
                break;

            case 'call_analyzed':
                if (call) {
                    call = Call.update(call.id, {
                        transcript: callData.transcript,
                        call_summary: callData.summary
                    });
                    
                    if (callData.summary || callData.transcript) {
                        let text = `📝 <b>Call Analyzed</b>\n\n`;
                        if (callData.summary) text += `<b>Summary:</b> ${callData.summary}\n\n`;
                        if (callData.transcript) text += `<b>Transcript:</b> <i>${callData.transcript.substring(0, 500)}...</i>`;
                        await TelegramService.sendMessage(text);
                    }
                }
                break;
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ Retell webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
