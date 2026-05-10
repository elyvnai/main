const { get, run, all, getLastInsertRowId } = require('../database');

class Call {
    static create(data) {
        const sql = `
            INSERT INTO calls (call_id, client_id, direction, status, duration, 
                             recording_url, transcript, call_summary, disconnect_reason,
                             sms_sent, started_at, ended_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            data.call_id,
            data.client_id || null,
            data.direction || 'inbound',
            data.status || 'in_progress',
            data.duration || 0,
            data.recording_url || null,
            data.transcript || null,
            data.call_summary || null,
            data.disconnect_reason || null,
            0,
            data.started_at || null,
            data.ended_at || null
        ];
        
        run(sql, params);
        const id = getLastInsertRowId();
        return this.findById(id);
    }

    static findById(id) {
        return get('SELECT * FROM calls WHERE id = ?', [id]);
    }

    static findByCallId(callId) {
        return get('SELECT * FROM calls WHERE call_id = ?', [callId]);
    }

    static update(id, data) {
        const fields = [];
        const values = [];
        
        if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
        if (data.duration !== undefined) { fields.push('duration = ?'); values.push(data.duration); }
        if (data.recording_url !== undefined) { fields.push('recording_url = ?'); values.push(data.recording_url); }
        if (data.transcript !== undefined) { fields.push('transcript = ?'); values.push(data.transcript); }
        if (data.call_summary !== undefined) { fields.push('call_summary = ?'); values.push(data.call_summary); }
        if (data.disconnect_reason !== undefined) { fields.push('disconnect_reason = ?'); values.push(data.disconnect_reason); }
        if (data.ended_at !== undefined) { fields.push('ended_at = ?'); values.push(data.ended_at); }
        if (data.sms_sent !== undefined) { fields.push('sms_sent = ?'); values.push(data.sms_sent ? 1 : 0); }
        
        if (fields.length === 0) return this.findById(id);
        
        values.push(id);
        const sql = `UPDATE calls SET ${fields.join(', ')} WHERE id = ?`;
        run(sql, values);
        return this.findById(id);
    }

    static findByClientId(clientId, limit = 50) {
        return all('SELECT * FROM calls WHERE client_id = ? ORDER BY created_at DESC LIMIT ?', [clientId, limit]);
    }

    static findMissedCalls(withinSeconds = 60) {
        return all(`
            SELECT c.*, cl.phone_number, cl.first_name
            FROM calls c
            LEFT JOIN clients cl ON c.client_id = cl.id
            WHERE c.status = 'missed' 
            AND datetime(c.ended_at) > datetime('now', '-' || ? || ' seconds')
            AND c.sms_sent = 0
        `, [withinSeconds]);
    }

    static findRecent(limit = 20) {
        return all(`
            SELECT c.*, cl.phone_number, cl.first_name, cl.last_name
            FROM calls c
            LEFT JOIN clients cl ON c.client_id = cl.id
            ORDER BY c.created_at DESC
            LIMIT ?
        `, [limit]);
    }

    static getStats() {
        return get(`
            SELECT 
                COUNT(*) as total_calls,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END) as missed,
                AVG(duration) as avg_duration
            FROM calls
        `, []);
    }
}

module.exports = Call;