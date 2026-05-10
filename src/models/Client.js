const { get, run, all, getLastInsertRowId } = require('../database');

function toDbValue(val) {
    return val === undefined || val === null ? null : val;
}

class Client {
    static create(data) {
        const sql = `
            INSERT INTO clients (phone_number, first_name, last_name, email, source)
            VALUES (?, ?, ?, ?, ?)
        `;
        const params = [
            toDbValue(data.phone_number),
            toDbValue(data.first_name),
            toDbValue(data.last_name),
            toDbValue(data.email),
            toDbValue(data.source)
        ];
        
        run(sql, params);
        const id = getLastInsertRowId();
        return this.findById(id);
    }

    static findById(id) {
        return get('SELECT * FROM clients WHERE id = ?', [id]);
    }

    static findByPhone(phoneNumber) {
        if (!phoneNumber) return undefined;
        return get('SELECT * FROM clients WHERE phone_number = ?', [phoneNumber]);
    }

    static findOrCreate(phoneNumber, data = {}) {
        let client = this.findByPhone(phoneNumber);
        if (!client) {
            client = this.create({ phone_number: phoneNumber, ...data });
        }
        return client;
    }

    static update(id, data) {
        const fields = [];
        const values = [];
        
        if (data.first_name !== undefined) { fields.push('first_name = ?'); values.push(toDbValue(data.first_name)); }
        if (data.last_name !== undefined) { fields.push('last_name = ?'); values.push(toDbValue(data.last_name)); }
        if (data.email !== undefined) { fields.push('email = ?'); values.push(toDbValue(data.email)); }
        if (data.source !== undefined) { fields.push('source = ?'); values.push(toDbValue(data.source)); }
        
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        
        const sql = `UPDATE clients SET ${fields.join(', ')} WHERE id = ?`;
        run(sql, values);
        return this.findById(id);
    }

    static findAll(limit = 100, offset = 0) {
        return all('SELECT * FROM clients ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    }

    static search(query) {
        const pattern = `%${query}%`;
        return all(`
            SELECT * FROM clients 
            WHERE phone_number LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
            ORDER BY created_at DESC
        `, [pattern, pattern, pattern, pattern]);
    }
}

module.exports = Client;