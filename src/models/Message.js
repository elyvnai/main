const { getDatabase } = require('../database');
class Message {
    static create(data) {
        const db = getDatabase();
        db.run(
            `INSERT INTO messages (client_id, direction, content, status, twilio_sid, retell_call_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [data.client_id || null, data.direction || null, data.content || null, data.status || null,
             data.twilio_sid || null, data.retell_call_id || null]
        );
        const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
        return Message.findById(id);
    }
    static findById(id) {
        const db = getDatabase();
        const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
        stmt.bind([id]);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    }
}
module.exports = Message;