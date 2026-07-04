/* ============================================================
   BASF Kids' Lab Dashboard — Express API Server
   Located in api/index.js for Vercel Serverless compatibility
   ============================================================ */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { pool, initDb } = require('../db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── File Array Helpers ──
async function appendFilesToDb(table, column, reqBody, id) {
  const { files, fileData, fileName } = reqBody;
  let incomingFiles = [];
  if (files && Array.isArray(files)) incomingFiles = files;
  else if (fileData) incomingFiles = [{ data: fileData, name: fileName }];
  
  if (incomingFiles.length === 0) return null;
  
  const current = await pool.query(`SELECT ${column} FROM ${table} WHERE id = $1`, [id]);
  if (current.rows.length === 0) return { error: 'Not found' };
  
  let currentFiles = [];
  const existingStr = current.rows[0][column];
  if (existingStr) {
    if (existingStr.startsWith('[')) {
      try { currentFiles = JSON.parse(existingStr); } catch (e) {}
    } else {
      currentFiles = [{ data: existingStr, name: 'uploaded_file' }];
    }
  }
  
  incomingFiles.forEach(f => currentFiles.push({ data: f.data || f.fileData, name: f.name || f.fileName }));
  const newStr = JSON.stringify(currentFiles);
  await pool.query(`UPDATE ${table} SET ${column} = $1, ${column}_name = NULL WHERE id = $2`, [newStr, id]);
  return true;
}

async function removeFileFromDb(table, column, fileIndexStr, id) {
  const current = await pool.query(`SELECT ${column} FROM ${table} WHERE id = $1`, [id]);
  if (current.rows.length === 0) return { error: 'Not found' };
  
  const existingStr = current.rows[0][column];
  if (!existingStr) return true;
  
  let currentFiles = [];
  if (existingStr.startsWith('[')) {
    try { currentFiles = JSON.parse(existingStr); } catch (e) {}
  } else {
    currentFiles = [{ data: existingStr, name: 'uploaded_file' }];
  }
  
  if (fileIndexStr !== undefined && fileIndexStr !== null) {
    const idx = parseInt(fileIndexStr);
    if (idx >= 0 && idx < currentFiles.length) currentFiles.splice(idx, 1);
  } else {
    currentFiles = [];
  }
  
  const newStr = currentFiles.length > 0 ? JSON.stringify(currentFiles) : null;
  await pool.query(`UPDATE ${table} SET ${column} = $1, ${column}_name = NULL WHERE id = $2`, [newStr, id]);
  return true;
}

function parseFileColumn(val) {
  if (!val) return null;
  if (val.startsWith('[')) {
    try { return JSON.parse(val); } catch(e) { return null; }
  }
  return [{ data: val, name: 'uploaded_file' }];
}

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files (local dev only — Vercel serves public/ automatically)
if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '..', 'public')));
}

// ============================================================
//  API ROUTES
// ============================================================

// ── GET /api/stats — Dashboard overview stats ──
app.get('/api/stats', async (req, res) => {
  try {
    const schoolCount = await pool.query('SELECT COUNT(*) FROM schools');
    const batchCount = await pool.query('SELECT COUNT(*) FROM batches');
    const presentSum = await pool.query('SELECT COALESCE(SUM(present_count), 0) as total FROM schools');

    res.json({
      totalSchools: parseInt(schoolCount.rows[0].count),
      totalBatches: parseInt(batchCount.rows[0].count),
      totalPresent: parseInt(presentSum.rows[0].total),
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
      hasGroupPhoto: !!row.group_photo,
      groupPhotoName: row.group_photo_name,
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
      consentForm: parseFileColumn(row.consent_form),
      attendanceSheet: parseFileColumn(row.attendance_sheet),
      groupPhoto: parseFileColumn(row.group_photo),
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

    const schoolResult = await client.query(
      'INSERT INTO schools (name, date, principal, email) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, date, principal || null, email || null]
    );
    const school = schoolResult.rows[0];

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

// ── DELETE /api/schools/:id — Delete school ──
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
    const success = await appendFilesToDb('schools', 'consent_form', req.body, req.params.id);
    if (!success) return res.status(400).json({ error: 'File data is required' });
    if (success.error) return res.status(404).json(success);
    res.json({ message: 'Consent form uploaded' });
  } catch (err) {
    console.error('PUT /api/schools/:id/consent error:', err.message);
    res.status(500).json({ error: 'Failed to upload consent form' });
  }
});

// ── DELETE /api/schools/:id/consent — Remove consent form ──
app.delete('/api/schools/:id/consent', async (req, res) => {
  try {
    const success = await removeFileFromDb('schools', 'consent_form', req.query.index, req.params.id);
    if (success.error) return res.status(404).json(success);
    res.json({ message: 'Consent form removed' });
  } catch (err) {
    console.error('DELETE /api/schools/:id/consent error:', err.message);
    res.status(500).json({ error: 'Failed to remove consent form' });
  }
});

// ── PUT /api/schools/:id/attendance — Upload attendance sheet ──
app.put('/api/schools/:id/attendance', async (req, res) => {
  try {
    const success = await appendFilesToDb('schools', 'attendance_sheet', req.body, req.params.id);
    if (!success) return res.status(400).json({ error: 'File data is required' });
    if (success.error) return res.status(404).json(success);
    res.json({ message: 'Attendance sheet uploaded' });
  } catch (err) {
    console.error('PUT /api/schools/:id/attendance error:', err.message);
    res.status(500).json({ error: 'Failed to upload attendance sheet' });
  }
});

// ── DELETE /api/schools/:id/attendance — Remove attendance sheet ──
app.delete('/api/schools/:id/attendance', async (req, res) => {
  try {
    const success = await removeFileFromDb('schools', 'attendance_sheet', req.query.index, req.params.id);
    if (success.error) return res.status(404).json(success);
    res.json({ message: 'Attendance sheet removed' });
  } catch (err) {
    console.error('DELETE /api/schools/:id/attendance error:', err.message);
    res.status(500).json({ error: 'Failed to remove attendance sheet' });
  }
});

// ── PUT /api/schools/:id/photo — Upload group photo (Cover Photo) ──
app.put('/api/schools/:id/photo', async (req, res) => {
  try {
    const success = await appendFilesToDb('schools', 'group_photo', req.body, req.params.id);
    if (!success) return res.status(400).json({ error: 'File data is required' });
    if (success.error) return res.status(404).json(success);
    res.json({ message: 'Group photo uploaded' });
  } catch (err) {
    console.error('PUT /api/schools/:id/photo error:', err.message);
    res.status(500).json({ error: 'Failed to upload group photo' });
  }
});

// ── DELETE /api/schools/:id/photo — Remove group photo (Cover Photo) ──
app.delete('/api/schools/:id/photo', async (req, res) => {
  try {
    const success = await removeFileFromDb('schools', 'group_photo', req.query.index, req.params.id);
    if (success.error) return res.status(404).json(success);
    res.json({ message: 'Group photo removed' });
  } catch (err) {
    console.error('DELETE /api/schools/:id/photo error:', err.message);
    res.status(500).json({ error: 'Failed to remove group photo' });
  }
});

// ── GET /api/schools/:id/photo-image — Serve group photo for cover ──
app.get('/api/schools/:id/photo-image', async (req, res) => {
  try {
    const result = await pool.query('SELECT group_photo FROM schools WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || !result.rows[0].group_photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    let photos = parseFileColumn(result.rows[0].group_photo);
    if (!photos || photos.length === 0) return res.status(404).json({ error: 'Photo not found' });
    
    let index = parseInt(req.query.index) || 0;
    if (index < 0 || index >= photos.length) index = 0;
    
    const dataUrl = photos[index].data;
    // Format: "data:image/jpeg;base64,/9j/4AAQ..."
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid image format in database' });
    }

    const contentType = matches[1];
    const imageBuffer = Buffer.from(matches[2], 'base64');

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': imageBuffer.length
    });
    res.end(imageBuffer);
  } catch (err) {
    console.error('GET /api/schools/:id/photo-image error:', err.message);
    res.status(500).json({ error: 'Failed to get group photo' });
  }
});

// ── POST /api/schools/:id/batches — Add batch ──
app.post('/api/schools/:id/batches', async (req, res) => {
  try {
    const { name, startTime, endTime } = req.body;
    if (!name || !startTime || !endTime) {
      return res.status(400).json({ error: 'Batch name, start time and end time are required' });
    }

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

// ── DELETE /api/batches/:id ──
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

// ── GET /api/transit/active — Get active transit logs ──
app.get('/api/transit/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, s.name as school_name 
      FROM transit_logs t
      JOIN schools s ON t.school_id = s.id
      ORDER BY t.updated_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/transit/active error:', err.message);
    res.status(500).json({ error: 'Failed to fetch active transit logs' });
  }
});

// Helper for Haversine distance
function calculateDistance(lat1, lon1, lat2 = 20.0422, lon2 = 74.4880) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

// ── POST /api/transit — Start or update transit tracking ──
app.post('/api/transit', async (req, res) => {
  try {
    const { schoolId, tripName, mentorName, status, latitude, longitude } = req.body;
    
    if (!schoolId || !tripName || !mentorName || !status) {
      return res.status(400).json({ error: 'School ID, trip name, mentor name, and status are required' });
    }
    
    const lat = latitude ? parseFloat(latitude) : null;
    const lon = longitude ? parseFloat(longitude) : null;
    let distance = null;
    if (lat !== null && lon !== null) {
      distance = calculateDistance(lat, lon);
    }
    
    // Check if active session already exists for this school and trip
    const existing = await pool.query(
      'SELECT id FROM transit_logs WHERE school_id = $1 AND trip_name = $2',
      [schoolId, tripName]
    );
    
    if (existing.rows.length > 0) {
      // Update
      const updateRes = await pool.query(
        `UPDATE transit_logs 
         SET status = $1, latitude = $2, longitude = $3, distance_km = $4, mentor_name = $5, updated_at = NOW() 
         WHERE school_id = $6 AND trip_name = $7 RETURNING *`,
        [status, lat, lon, distance, mentorName, schoolId, tripName]
      );
      res.json(updateRes.rows[0]);
    } else {
      // Insert
      const insertRes = await pool.query(
        `INSERT INTO transit_logs (school_id, trip_name, mentor_name, status, latitude, longitude, distance_km) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [schoolId, tripName, mentorName, status, lat, lon, distance]
      );
      res.status(201).json(insertRes.rows[0]);
    }
  } catch (err) {
    console.error('POST /api/transit error:', err.message);
    res.status(500).json({ error: 'Failed to update transit log' });
  }
});

// ── DELETE /api/transit/:id — Delete transit tracking record ──
app.delete('/api/transit/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM transit_logs WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transit log not found' });
    }
    res.json({ message: 'Transit tracking ended', id: parseInt(req.params.id) });
  } catch (err) {
    console.error('DELETE /api/transit/:id error:', err.message);
    res.status(500).json({ error: 'Failed to end transit log' });
  }
});

// ── Fallback: serve index.html for SPA (local dev only) ──
if (!process.env.VERCEL) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
}

// ============================================================
//  START SERVER OR EXPORT FOR VERCEL
// ============================================================
if (process.env.VERCEL) {
  initDb().catch(err => console.error('Database connection failed on serverless startup:', err.message));
} else {
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
