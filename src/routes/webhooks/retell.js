const express = require('express');
const router = express.Router();
const Call = require('../../models/Call');
const Client = require('../../models/Client');
const Message = require('../../models/Message');
const SmsOptOut = require('../../models/SmsOptOut');
const TwilioService = require('../../services/TwilioService');
const SpeedToLeadService = require('../../services/SpeedToLeadService');
const TelegramService = require('../../services/TelegramService');

router.post('/call-update', express.json(), async (req, res) => {
    try {
        const call = req.body;
        if (!call.call_id) return res.status(400).json({ error: 'Missing call_id' });
        const phone = TwilioService.normalizePhoneNumber(call.phone_number);
        let client = null;
        if (phone) {
            client = Client.findByPhone(phone);
            if (!client) {
                client = Client.create({ phone_number: phone, source: 'retell' });
            }
        }
        let existingCall = Call.findByCallId(call.call_id);
        if (!existingCall) {
            existingCall = Call.create({
                call_id: call.call_id,
                client_id: client ? client.id : null,
                direction: call.direction || 'inbound',
                status: call.status,
                duration: call.duration || 0,
                recording_url: call.recording_url || null,
                transcript: call.transcript || null,
                call_summary: call.call_summary || null,
                disconnect_reason: call.disconnect_reason || null,
                sms_sent: 0,
                started_at: call.started_at || new Date().toISOString(),
                ended_at: call.ended_at || null
            });
        } else {
            Call.update(existingCall.id, {
                status: call.status,
                duration: call.duration || existingCall.duration,
                recording_url: call.recording_url || existingCall.recording_url,
                transcript: call.transcript || existingCall.transcript,
                call_summary: call.call_summary || existingCall.call_summary,
                disconnect_reason: call.disconnect_reason || existingCall.disconnect_reason,
                ended_at: call.ended_at || new Date().toISOString()
            });
        }
        if (call.disconnect_reason && SpeedToLeadService.shouldSendSpeedToLead({
            callId: call.call_id,
            phoneNumber: phone,
            direction: call.direction,
            duration: call.duration,
            disconnectReason: call.disconnect_reason
        })) {
            SpeedToLeadService.handleMissedCall({
                callId: call.call_id,
                phoneNumber: phone,
                direction: call.direction,
                duration: call.duration,
                disconnectReason: call.disconnect_reason
            }).catch(err => console.error('SpeedToLead error:', err));
        }
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('❌ Retell call-update error:', error);
        TelegramService.sendErrorAlert(error, 'Retell call-update').catch(() => {});
        res.status(500).json({ error: 'Internal error' });
    }
});

module.exports = router;