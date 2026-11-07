require('dotenv').config({path:require('node:path').resolve(__dirname,'../../../.env')});
const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('./db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/001_init.sql'), 'utf8');
    await pool.query(sql);
    console.log('Database migration 001 applied.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
