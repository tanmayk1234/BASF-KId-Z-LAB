/* ============================================================
   Database Connection & Schema — Neon Postgres
   ============================================================ */

const { Pool } = require('pg');

// Create connection pool with SSL (required by Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Initialize database — create tables if they don't exist
 */
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        principal VARCHAR(255),
        email VARCHAR(255),
        present_count INTEGER DEFAULT 0,
        absent_count INTEGER DEFAULT 0,
        consent_form TEXT,
        consent_form_name VARCHAR(255),
        attendance_sheet TEXT,
        attendance_sheet_name VARCHAR(255),
        group_photo TEXT,
        group_photo_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS batches (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transit_logs (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        trip_name VARCHAR(50) NOT NULL,
        mentor_name VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        distance_km DOUBLE PRECISION,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE transit_logs ADD COLUMN IF NOT EXISTS weather VARCHAR(50);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS batch_logs (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        batch_id INTEGER REFERENCES batches(id) ON DELETE CASCADE,
        current_step VARCHAR(50) NOT NULL,
        step_order VARCHAR(50) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
