require('dotenv').config();
const { pool } = require('./db.js');

async function fix() {
  try {
    const res = await pool.query('SELECT * FROM schools');
    for (const school of res.rows) {
      const batches = await pool.query('SELECT * FROM batches WHERE school_id = $1 ORDER BY id ASC', [school.id]);
      for (let i = 0; i < batches.rows.length; i++) {
        await pool.query('UPDATE batches SET name = $1 WHERE id = $2', [`Trip ${i + 1}`, batches.rows[i].id]);
      }
    }
    console.log('Batches numbered successfully');
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
fix();
