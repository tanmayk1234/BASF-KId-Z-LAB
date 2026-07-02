/* ============================================================
   BASF Kids' Lab Dashboard — Express API Server
   ============================================================ */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files (HTML, CSS, JS, assets)
app.use(express.static(path.join(__dirname)));

// ============================================================
//  API ROUTES
// ============================================================

// ── GET /api/stats — Dashboard overview stats ──
app.get('/api/stats', async (req, res) => {
  try {
    const schoolCount = await pool.query('SELECT COUNT(*) FROM schools');
    const batchCount = await pool.query('SELECT COUNT(*) FROM batches');
    const presentSum = await pool.query('SELECT COALESCE(SUM(present_count), 0) as total FROM schools');
    const absentSum = await pool.query('SELECT COALESCE(SUM(absent_count), 0) as total FROM schools');

    res.json({
      totalSchools: parseInt(schoolCount.rows[0].count),
      totalBatches: parseInt(batchCount.rows[0].count),
      totalPresent: parseInt(presentSum.rows[0].total),
      totalAbsent: parseInt(absentSum.rows[0].total),
    });
  } catch (err) {
    console.error('GET /api/stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── GET /api/schools — List all schools with batch counts ──
app.get('/api/schools', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM batches b WHERE b.school_id = s.id) as batch_count
      FROM schools s
      ORDER BY s.date DESC, s.created_at DESC
    `);

    // Don't send file data in the list view (too heavy)
    const schools = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      date: row.date,
      principal: row.principal,
      email: row.email,
      presentCount: row.present_count,
      absentCount: row.absent_count,
      batchCount: parseInt(row.batch_count),
      hasConsentForm: !!row.consent_form,
      consentFormName: row.consent_form_name,
      hasAttendanceSheet: !!row.attendance_sheet,
      attendanceSheetName: row.attendance_sheet_name,
      createdAt: row.created_at,
    }));

    res.json(schools);
  } catch (err) {
    console.error('GET /api/schools error:', err.message);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// ── GET /api/schools/:id — Get single school with batches ──
app.get('/api/schools/:id', async (req, res) => {
  try {
    const schoolResult = await pool.query('SELECT * FROM schools WHERE id = $1', [req.params.id]);
    if (schoolResult.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    const batchResult = await pool.query(
      'SELECT * FROM batches WHERE school_id = $1 ORDER BY start_time',
      [req.params.id]
    );

    const row = schoolResult.rows[0];
    const school = {
      id: row.id,
      name: row.name,
      date: row.date,
      principal: row.principal,
      email: row.email,
      presentCount: row.present_count,
      absentCount: row.absent_count,
      consentForm: row.consent_form,
      consentFormName: row.consent_form_name,
      attendanceSheet: row.attendance_sheet,
      attendanceSheetName: row.attendance_sheet_name,
      createdAt: row.created_at,
      batches: batchResult.rows.map(b => ({
        id: b.id,
        name: b.name,
        startTime: b.start_time,
        endTime: b.end_time,
      })),
    };

    res.json(school);
  } catch (err) {
    console.error('GET /api/schools/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch school' });
  }
});

// ── POST /api/schools — Create school + batches (inline) ──
app.post('/api/schools', async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, date, principal, email, batches } = req.body;

    if (!name || !date) {
      return res.status(400).json({ error: 'School name and date are required' });
    }

    await client.query('BEGIN');

    // Insert school
    const schoolResult = await client.query(
      'INSERT INTO schools (name, date, principal, email) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, date, principal || null, email || null]
    );
    const school = schoolResult.rows[0];

    // Insert batches
    const insertedBatches = [];
    if (batches && Array.isArray(batches)) {
      for (const batch of batches) {
        if (batch.name && batch.startTime && batch.endTime) {
          const batchResult = await client.query(
            'INSERT INTO batches (school_id, name, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING *',
            [school.id, batch.name, batch.startTime, batch.endTime]
          );
          insertedBatches.push(batchResult.rows[0]);
        }
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      id: school.id,
      name: school.name,
      date: school.date,
      principal: school.principal,
      email: school.email,
      presentCount: school.present_count,
      absentCount: school.absent_count,
      batchCount: insertedBatches.length,
      batches: insertedBatches.map(b => ({
        id: b.id,
        name: b.name,
        startTime: b.start_time,
        endTime: b.end_time,
      })),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/schools error:', err.message);
    res.status(500).json({ error: 'Failed to create school' });
  } finally {
    client.release();
  }
});

// ── DELETE /api/schools/:id — Delete school and all its batches ──
app.delete('/api/schools/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM schools WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }
    res.json({ message: 'School deleted', id: parseInt(req.params.id) });
  } catch (err) {
    console.error('DELETE /api/schools/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete school' });
  }
});

// ── PUT /api/schools/:id/counts — Update present/absent counts ──
app.put('/api/schools/:id/counts', async (req, res) => {
  try {
    const { presentCount, absentCount } = req.body;
    const result = await pool.query(
      'UPDATE schools SET present_count = $1, absent_count = $2 WHERE id = $3 RETURNING *',
      [parseInt(presentCount) || 0, parseInt(absentCount) || 0, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json({ message: 'Counts updated', presentCount: result.rows[0].present_count, absentCount: result.rows[0].absent_count });
  } catch (err) {
    console.error('PUT /api/schools/:id/counts error:', err.message);
    res.status(500).json({ error: 'Failed to update counts' });
  }
});

// ── PUT /api/schools/:id/consent — Upload consent form ──
app.put('/api/schools/:id/consent', async (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: 'File data is required' });
    }

    const result = await pool.query(
      'UPDATE schools SET consent_form = $1, consent_form_name = $2 WHERE id = $3 RETURNING id',
      [fileData, fileName, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json({ message: 'Consent form uploaded', fileName });
  } catch (err) {
    console.error('PUT /api/schools/:id/consent error:', err.message);
    res.status(500).json({ error: 'Failed to upload consent form' });
  }
});

// ── DELETE /api/schools/:id/consent — Remove consent form ──
app.delete('/api/schools/:id/consent', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE schools SET consent_form = NULL, consent_form_name = NULL WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json({ message: 'Consent form removed' });
  } catch (err) {
    console.error('DELETE /api/schools/:id/consent error:', err.message);
    res.status(500).json({ error: 'Failed to remove consent form' });
  }
});

// ── PUT /api/schools/:id/attendance — Upload attendance sheet ──
app.put('/api/schools/:id/attendance', async (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: 'File data is required' });
    }

    const result = await pool.query(
      'UPDATE schools SET attendance_sheet = $1, attendance_sheet_name = $2 WHERE id = $3 RETURNING id',
      [fileData, fileName, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json({ message: 'Attendance sheet uploaded', fileName });
  } catch (err) {
    console.error('PUT /api/schools/:id/attendance error:', err.message);
    res.status(500).json({ error: 'Failed to upload attendance sheet' });
  }
});

// ── DELETE /api/schools/:id/attendance — Remove attendance sheet ──
app.delete('/api/schools/:id/attendance', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE schools SET attendance_sheet = NULL, attendance_sheet_name = NULL WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json({ message: 'Attendance sheet removed' });
  } catch (err) {
    console.error('DELETE /api/schools/:id/attendance error:', err.message);
    res.status(500).json({ error: 'Failed to remove attendance sheet' });
  }
});

// ── POST /api/schools/:id/batches — Add a batch to school ──
app.post('/api/schools/:id/batches', async (req, res) => {
  try {
    const { name, startTime, endTime } = req.body;
    if (!name || !startTime || !endTime) {
      return res.status(400).json({ error: 'Batch name, start time and end time are required' });
    }

    // Verify school exists
    const schoolCheck = await pool.query('SELECT id FROM schools WHERE id = $1', [req.params.id]);
    if (schoolCheck.rows.length === 0) {
      return res.status(404).json({ error: 'School not found' });
    }

    const result = await pool.query(
      'INSERT INTO batches (school_id, name, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, name, startTime, endTime]
    );

    const batch = result.rows[0];
    res.status(201).json({
      id: batch.id,
      name: batch.name,
      startTime: batch.start_time,
      endTime: batch.end_time,
    });
  } catch (err) {
    console.error('POST /api/schools/:id/batches error:', err.message);
    res.status(500).json({ error: 'Failed to add batch' });
  }
});

// ── DELETE /api/batches/:id — Delete a batch ──
app.delete('/api/batches/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM batches WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.json({ message: 'Batch deleted', id: parseInt(req.params.id) });
  } catch (err) {
    console.error('DELETE /api/batches/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete batch' });
  }
});

// ── Fallback: serve index.html for SPA ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
//  START SERVER OR EXPORT FOR VERCEL
// ============================================================
if (process.env.VERCEL) {
  // On Vercel (serverless environment), initialize database asynchronously on start
  initDb().catch(err => console.error('Database connection failed on serverless startup:', err.message));
} else {
  // Running locally, start listen server
  async function startServer() {
    try {
      await initDb();
      app.listen(PORT, () => {
        console.log(`\n🚀 BASF Kids' Lab Dashboard running at http://localhost:${PORT}`);
        console.log(`📊 API available at http://localhost:${PORT}/api`);
        console.log('🗄️  Connected to Neon Postgres\n');
      });
    } catch (err) {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    }
  }
  startServer();
}

module.exports = app;
