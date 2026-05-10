const { getDatabase } = require('../database');
class Client {
    static findByPhone(phone) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM clients WHERE phone_number = ?');
        stmt.bind([phone]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    }
    static findById(id) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM clients WHERE id = ?');
        stmt.bind([id]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    }
    static create(data) {
        const db = getDatabase();
        db.run(
            'INSERT INTO clients (phone_number, first_name, last_name, email, source) VALUES (?, ?, ?, ?, ?)',
            [data.phone_number, data.first_name || null, data.last_name || null, data.email || null, data.source || null]
        );
        return Client.findById(db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]);
    }
    static update(id, data) {
        const db = getDatabase();
        db.run(
            'UPDATE clients SET first_name = ?, last_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [data.first_name || null, data.last_name || null, data.email || null, id]
        );
    }
}
module.exports = Client;