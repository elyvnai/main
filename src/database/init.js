require('dotenv').config();
const path = require('path');
async function initDatabase() {
    const initModule = require('./index');
    await initModule.initDatabase();
    console.log('🏗️  Database initialization complete!');
    console.log('📁 Location:', process.env.DATABASE_URL || './elyvn.db');
}
if (require.main === module) {
    initDatabase().catch(err => {
        console.error('Failed:', err);
        process.exit(1);
    });
}
module.exports = { initDatabase };