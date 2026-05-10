const { get, run, all, getLastInsertRowId } = require('../database');

class Lead {
    static create(data) {
        const sql = `
            INSERT INTO leads (client_id, status, priority, notes)
            VALUES (?, ?, ?, ?)
        `;
        const params = [
            data.client_id,
            data.status || 'new',
            data.priority || 0,
            data.notes || null
        ];
        
        run(sql, params);
        const id = getLastInsertRowId();
        return this.findById(id);
    }

    static findById(id) {
        return get('SELECT * FROM leads WHERE id = ?', [id]);
    }

    static findByClientId(clientId) {
        return get('SELECT * FROM leads WHERE client_id = ? ORDER BY created_at DESC LIMIT 1', [clientId]);
    }

    static update(id, data) {
        const fields = [];
        const values = [];
        
        if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
        if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
        if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
        
        if (fields.length === 0) return this.findById(id);
        
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        
        const sql = `UPDATE leads SET ${fields.join(', ')} WHERE id = ?`;
        run(sql, values);
        return this.findById(id);
    }

    static findAll(filters = {}) {
        let sql = `
            SELECT l.*, cl.phone_number, cl.first_name, cl.last_name, cl.email
            FROM leads l
            LEFT JOIN clients cl ON l.client_id = cl.id
            WHERE 1=1
        `;
        const params = [];
        
        if (filters.status) {
            sql += ' AND l.status = ?';
            params.push(filters.status);
        }
        
        sql += ' ORDER BY l.priority DESC, l.created_at DESC';
        
        if (filters.limit) {
            sql += ' LIMIT ?';
            params.push(filters.limit);
        }
        
        return all(sql, params);
    }

    static getStats() {
        return get(`
            SELECT 
                COUNT(*) as total_leads,
                SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_leads,
                SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) as contacted,
                SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified,
                SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted,
                SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost
            FROM leads
        `, []);
    }
}

module.exports = Lead;