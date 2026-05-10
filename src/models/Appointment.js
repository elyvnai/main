const { get, run, all, getLastInsertRowId } = require('../database');

class Appointment {
    static create(data) {
        const sql = `
            INSERT INTO appointments (client_id, title, scheduled_at, duration_minutes, status)
            VALUES (?, ?, ?, ?, ?)
        `;
        const params = [
            data.client_id,
            data.title || 'Appointment',
            data.scheduled_at,
            data.duration_minutes || 30,
            data.status || 'scheduled'
        ];
        
        run(sql, params);
        const id = getLastInsertRowId();
        return this.findById(id);
    }

    static findById(id) {
        return get('SELECT * FROM appointments WHERE id = ?', [id]);
    }

    static update(id, data) {
        const fields = [];
        const values = [];
        
        if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
        if (data.scheduled_at !== undefined) { fields.push('scheduled_at = ?'); values.push(data.scheduled_at); }
        if (data.duration_minutes !== undefined) { fields.push('duration_minutes = ?'); values.push(data.duration_minutes); }
        if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
        
        if (fields.length === 0) return this.findById(id);
        
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        
        const sql = `UPDATE appointments SET ${fields.join(', ')} WHERE id = ?`;
        run(sql, values);
        return this.findById(id);
    }

    static findByClientId(clientId) {
        return all('SELECT * FROM appointments WHERE client_id = ? ORDER BY scheduled_at DESC', [clientId]);
    }

    static findUpcoming(limit = 10) {
        return all(`
            SELECT a.*, cl.phone_number, cl.first_name, cl.last_name
            FROM appointments a
            LEFT JOIN clients cl ON a.client_id = cl.id
            WHERE a.scheduled_at > datetime('now')
            AND a.status IN ('scheduled', 'confirmed')
            ORDER BY a.scheduled_at ASC
            LIMIT ?
        `, [limit]);
    }

    static findToday() {
        return all(`
            SELECT a.*, cl.phone_number, cl.first_name, cl.last_name
            FROM appointments a
            LEFT JOIN clients cl ON a.client_id = cl.id
            WHERE date(a.scheduled_at) = date('now')
            AND a.status IN ('scheduled', 'confirmed')
            ORDER BY a.scheduled_at ASC
        `, []);
    }

    static delete(id) {
        run('DELETE FROM appointments WHERE id = ?', [id]);
    }
}

module.exports = Appointment;