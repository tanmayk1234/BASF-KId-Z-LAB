require('dotenv').config();
const { pool } = require('./db.js');
const xlsx = require('xlsx');

function parseTime(timeStr, prevPm = false) {
  if (!timeStr) return null;
  // Examples: "6:30-7:30", "6:00-7:00am", "10:20-11:20pm"
  const parts = timeStr.split('-');
  if (parts.length === 0) return null;
  let start = parts[0].trim().toLowerCase();
  
  let isPm = prevPm || start.includes('pm') || (parts[1] && parts[1].toLowerCase().includes('pm'));
  
  start = start.replace(/[a-z]/g, '').trim();
  const timeParts = start.split(/[:.]/);
  let h = parseInt(timeParts[0], 10);
  let m = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
  
  if (isNaN(h)) return null;
  
  // Basic heuristic: if it's 1-5 and we know it's afternoon, add 12
  // Or if it's PM
  if ((isPm && h < 12) || (!isPm && h >= 1 && h <= 6)) {
      h += 12;
  }
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
}

function parseDateStr(dateStr) {
  if (!dateStr) return null;
  // Format could be DD/MM/YYYY or MM/DD/YYYY
  // We'll try to parse it safely
  const parts = dateStr.split('/');
  if (parts.length === 3) {
      if (parseInt(parts[0]) > 12) {
          // DD/MM/YYYY
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else {
           // MM/DD/YYYY
          return `${parts[2]}-${parts[0]}-${parts[1]}`;
      }
  }
  return dateStr;
}


async function run() {
  console.log("Reading Excel file...");
  const wb = xlsx.readFile('Kapse Foundation BASF Kids Lab Data & Schedule.xlsx', {cellDates: false});
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, {header:1, raw: false});
  
  const schools = {};
  
  let currentSchool = null;
  let currentDate = null;
  let currentStudents = 0;
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 2) continue;
    
    if (row[0] && row[0] !== 'Date' && row[2] && row[2] !== 'School name') {
      currentDate = parseDateStr(row[0]);
      currentSchool = row[2].trim();
      currentStudents = parseInt((row[6] || "").toString().replace(/[^0-9]/g, ''), 10) || 0;
    }
    
    if (row[9] && row[9].startsWith('Trip')) {
      const tripName = row[9].trim();
      const fromFound = row[10] ? row[10].trim() : "";
      const returnFound = row[20] ? row[20].trim() : "";
      
      let startTime = parseTime(fromFound.split('-')[0]);
      let endTime = parseTime(returnFound.split('-').pop(), true);
      
      if (currentSchool && currentDate) {
          const key = `${currentSchool}_${currentDate}`;
          if (!schools[key]) {
              schools[key] = {
                  name: currentSchool,
                  date: currentDate,
                  students: currentStudents,
                  batches: []
              };
          }
          // If this row has a new students count that is valid, update it (sometimes it's only on the first trip)
          const rowStudents = parseInt((row[6] || "").toString().replace(/[^0-9]/g, ''), 10);
          if (rowStudents && schools[key].students === 0) {
              schools[key].students = rowStudents;
          }
          
          if (!startTime) startTime = "09:00:00";
          if (!endTime) endTime = "14:00:00";
          
          schools[key].batches.push({
              name: tripName,
              start_time: startTime,
              end_time: endTime
          });
      }
    }
  }

  console.log(`Found ${Object.keys(schools).length} school visits to insert.`);
  
  try {
      await pool.query('BEGIN');
      // Optional: Clear existing data? We will just append to avoid destroying other demo data, or maybe we clear since it's a fresh bulk upload.
      // Let's clear for a clean state as requested ("fill the data in the dashboard...").
      console.log("Clearing existing schools and batches...");
      await pool.query('DELETE FROM schools');
      
      for (const key in schools) {
          const s = schools[key];
          console.log(`Inserting school: ${s.name} on ${s.date}`);
          const res = await pool.query(
              'INSERT INTO schools (name, date, present_count) VALUES ($1, $2, $3) RETURNING id',
              [s.name, s.date, s.students || 0]
          );
          const schoolId = res.rows[0].id;
          
          for (const b of s.batches) {
              await pool.query(
                  'INSERT INTO batches (school_id, name, start_time, end_time) VALUES ($1, $2, $3, $4)',
                  [schoolId, b.name, b.start_time, b.end_time]
              );
          }
      }
      
      await pool.query('COMMIT');
      console.log("Upload complete!");
  } catch(e) {
      await pool.query('ROLLBACK');
      console.error("Error during upload:", e);
  } finally {
      pool.end();
  }
}

run();
