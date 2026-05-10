const { getDatabase } = require('../database');
class Lead {
    static create(data) {
        const db = getDatabase();
        db.run(
            `INSERT INTO leads (client_id, status, priority, notes) VALUES (?, ?, ?, ?)`,
            [data.client_id || null, data.status || 'new', data.priority || 0, data.notes || null]
        );
        const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
        return Lead.findById(id);
    }
    static findById(id) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM leads WHERE id = ?');
        stmt.bind([id]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    }
    static update(id, data) {
        const db = getDatabase();
        db.run(
            `UPDATE leads SET status = ?, priority = ?, notes = ? WHERE id = ?`,
            [data.status || null, data.priority || 0, data.notes || null, id]
        );
    }
}
module.exports = Lead;