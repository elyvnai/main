const express = require('express');
const router = express.Router();
const Call = require('../../models/Call');
const Client = require('../../models/Client');
const SpeedToLeadService = require('../../services/SpeedToLeadService');
const TelegramService = require('../../services/TelegramService');
const RetellService = require('../../services/RetellService');

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
