const { get, run, all, getLastInsertRowId } = require('../database');

class Message {
    static create(data) {
        const sql = `
            INSERT INTO messages (client_id, direction, content, status, twilio_sid, retell_call_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = [
            data.client_id || null,
            data.direction || 'outbound',
            data.content,
            data.status || 'queued',
            data.twilio_sid || null,
            data.retell_call_id || null
        ];
        
        run(sql, params);
        const id = getLastInsertRowId();
        return this.findById(id);
    }

    static findById(id) {
        return get('SELECT * FROM messages WHERE id = ?', [id]);
    }

    static findByTwilioSid(sid) {
        return get('SELECT * FROM messages WHERE twilio_sid = ?', [sid]);
    }

    static update(id, data) {
        const fields = [];
        const values = [];
        
        if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
        
        if (fields.length === 0) return this.findById(id);
        
        values.push(id);
        const sql = `UPDATE messages SET ${fields.join(', ')} WHERE id = ?`;
        run(sql, values);
        return this.findById(id);
    }

    static findByClientId(clientId, limit = 50) {
        return all('SELECT * FROM messages WHERE client_id = ? ORDER BY created_at DESC LIMIT ?', [clientId, limit]);
    }

    static findRecent(limit = 20) {
        return all(`
            SELECT m.*, cl.phone_number, cl.first_name
            FROM messages m
            LEFT JOIN clients cl ON m.client_id = cl.id
            ORDER BY m.created_at DESC
            LIMIT ?
        `, [limit]);
    }

    static findByDirection(direction, limit = 50) {
        return all('SELECT * FROM messages WHERE direction = ? ORDER BY created_at DESC LIMIT ?', [direction, limit]);
    }
}

module.exports = Message;