#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
//  SCEI Satisfaction Survey API
//
//  Express server on port 3031 with SQLite database.
//  Managed by PM2 alongside the OAuth proxy on :3030.
//
//  SETUP:
//    cd /var/www/sapphireclinicseast.org/api
//    npm install --production
//    SURVEY_API_KEY=<key> pm2 start survey-api.js --name scei-survey
//    pm2 save
//
//  Nginx forwards /api/survey → http://127.0.0.1:3031
// ══════════════════════════════════════════════════════════════════

'use strict';

const express = require('express');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────
const PORT = process.env.SURVEY_PORT || 3031;
const API_KEY = process.env.SURVEY_API_KEY || 'SCEI_SURVEY_DEV_KEY';
const DB_DIR = process.env.SURVEY_DB_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'surveys.db');
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://sapphireclinicseast.org';

// ── Ensure data directory exists ──────────────────────────────────
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// ── Database setup ────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      role        TEXT NOT NULL,
      branch      TEXT NOT NULL,
      staff_type  TEXT NOT NULL CHECK(staff_type IN ('clinical', 'admin')),
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS survey_types (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT,
      schema_json  TEXT NOT NULL,
      target_group TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assessment_targets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id      INTEGER NOT NULL REFERENCES staff(id),
      year          INTEGER NOT NULL,
      target_count  INTEGER NOT NULL,
      completed     INTEGER DEFAULT 0,
      UNIQUE(staff_id, year)
    );

    CREATE TABLE IF NOT EXISTS survey_assignments (
      id            TEXT PRIMARY KEY,
      staff_id      INTEGER NOT NULL REFERENCES staff(id),
      survey_type   TEXT NOT NULL REFERENCES survey_types(id),
      patient_name  TEXT,
      patient_age   INTEGER,
      branch        TEXT NOT NULL,
      session_type  TEXT,
      assigned_at   TEXT DEFAULT (datetime('now')),
      assigned_by   TEXT,
      status        TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','expired')),
      expires_at    TEXT,
      completed_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS survey_responses (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id   TEXT NOT NULL REFERENCES survey_assignments(id),
      staff_id        INTEGER NOT NULL REFERENCES staff(id),
      survey_type     TEXT NOT NULL,
      branch          TEXT NOT NULL,
      respondent_name  TEXT,
      respondent_email TEXT,
      respondent_phone TEXT,
      responses_json  TEXT NOT NULL,
      submitted_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assessment_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id      INTEGER NOT NULL REFERENCES staff(id),
      survey_type   TEXT NOT NULL,
      year          INTEGER NOT NULL,
      quarter       INTEGER NOT NULL,
      month         INTEGER NOT NULL,
      assignment_id TEXT REFERENCES survey_assignments(id),
      logged_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_assignments_status ON survey_assignments(status);
    CREATE INDEX IF NOT EXISTS idx_assignments_staff ON survey_assignments(staff_id);
    CREATE INDEX IF NOT EXISTS idx_responses_staff ON survey_responses(staff_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_log_staff_year ON assessment_log(staff_id, year);
  `);
}

initDatabase();

// ── Express app ───────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS for dashboard
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// API key auth middleware (skip for public assignment endpoints)
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// ══════════════════════════════════════════════════════════════════
//  DASHBOARD ENDPOINT
// ══════════════════════════════════════════════════════════════════
app.get('/api/survey/dashboard', requireApiKey, (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const totalSurveys = db.prepare(`
    SELECT COUNT(*) as count FROM survey_responses WHERE strftime('%Y', submitted_at) = ?
  `).get(String(year));

  const avgScore = db.prepare(`
    SELECT AVG(avg_score) as avg FROM (
      SELECT assignment_id,
        AVG(json_extract(value, '$.value')) as avg_score
      FROM survey_responses sr,
        json_each(sr.responses_json, '$.ratings')
      WHERE strftime('%Y', sr.submitted_at) = ?
      GROUP BY assignment_id
    )
  `).get(String(year));

  const completionRate = db.prepare(`
    SELECT
      COALESCE(SUM(completed), 0) as completed,
      COALESCE(SUM(target_count), 0) as target
    FROM assessment_targets WHERE year = ?
  `).get(year);

  const pending = db.prepare(`
    SELECT COUNT(*) as count FROM survey_assignments WHERE status = 'pending'
  `).get();

  const byBranch = db.prepare(`
    SELECT branch, COUNT(*) as count,
      AVG(json_extract(value, '$.value')) as avg_score
    FROM survey_responses sr,
      json_each(sr.responses_json, '$.ratings')
    WHERE strftime('%Y', sr.submitted_at) = ?
    GROUP BY branch
  `).all(String(year));

  const byDept = db.prepare(`
    SELECT s.role as department, COUNT(DISTINCT sr.id) as count,
      AVG(json_extract(value, '$.value')) as avg_score
    FROM survey_responses sr
    JOIN staff s ON sr.staff_id = s.id,
      json_each(sr.responses_json, '$.ratings')
    WHERE strftime('%Y', sr.submitted_at) = ?
    GROUP BY s.role
  `).all(String(year));

  const monthlyTrend = db.prepare(`
    SELECT strftime('%m', submitted_at) as month,
      COUNT(DISTINCT sr.id) as count,
      AVG(json_extract(value, '$.value')) as avg_score
    FROM survey_responses sr,
      json_each(sr.responses_json, '$.ratings')
    WHERE strftime('%Y', sr.submitted_at) = ?
    GROUP BY strftime('%m', submitted_at)
    ORDER BY month
  `).all(String(year));

  res.json({
    totalSurveys: totalSurveys.count,
    avgScore: avgScore.avg ? parseFloat(avgScore.avg.toFixed(2)) : null,
    completionRate: completionRate.target > 0
      ? parseFloat((completionRate.completed / completionRate.target * 100).toFixed(1))
      : 0,
    completedCount: completionRate.completed,
    targetCount: completionRate.target,
    pending: pending.count,
    byBranch,
    byDept,
    monthlyTrend
  });
});

// ══════════════════════════════════════════════════════════════════
//  STAFF LIST WITH ASSESSMENT PROGRESS
// ══════════════════════════════════════════════════════════════════
app.get('/api/survey/staff', requireApiKey, (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const branch = req.query.branch || null;

  let query = `
    SELECT s.id, s.name, s.role, s.branch, s.staff_type,
      COALESCE(at2.target_count, CASE WHEN s.staff_type = 'clinical' THEN 4 ELSE 10 END) as target_count,
      COALESCE(at2.completed, 0) as completed,
      (SELECT MAX(logged_at) FROM assessment_log WHERE staff_id = s.id AND year = ?) as last_assessed
    FROM staff s
    LEFT JOIN assessment_targets at2 ON at2.staff_id = s.id AND at2.year = ?
    WHERE s.is_active = 1
  `;
  const params = [year, year];

  if (branch) {
    query += ' AND s.branch = ?';
    params.push(branch);
  }

  query += ' ORDER BY s.staff_type, s.role, s.name';

  const staff = db.prepare(query).all(...params);
  res.json(staff);
});

// ══════════════════════════════════════════════════════════════════
//  CREATE SURVEY ASSIGNMENT
// ══════════════════════════════════════════════════════════════════
app.post('/api/survey/assign', requireApiKey, (req, res) => {
  const { staffId, patientName, patientAge, branch, sessionType, assignedBy } = req.body;

  if (!staffId || !branch) {
    return res.status(400).json({ error: 'staffId and branch are required' });
  }

  // Determine survey type
  let surveyType;
  if (sessionType === 'group') {
    surveyType = 'HR16';
  } else {
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(staffId);
    if (!staff) return res.status(404).json({ error: 'Staff not found' });

    if (staff.staff_type === 'admin') {
      surveyType = 'HR12';
    } else if (patientAge !== undefined && patientAge !== null && patientAge < 18) {
      surveyType = 'HR10';
    } else {
      surveyType = 'HR11';
    }
  }

  const assignmentId = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO survey_assignments (id, staff_id, survey_type, patient_name, patient_age, branch, session_type, assigned_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(assignmentId, staffId, surveyType, patientName || null, patientAge || null, branch, sessionType || 'individual', assignedBy || null, expiresAt);

  const surveyUrl = `${SITE_ORIGIN}/survey.html?id=${assignmentId}`;

  res.json({
    assignmentId,
    surveyType,
    surveyUrl,
    expiresAt
  });
});

// ══════════════════════════════════════════════════════════════════
//  GET ASSIGNMENT (PUBLIC — UUID is auth)
// ══════════════════════════════════════════════════════════════════
app.get('/api/survey/assignment/:id', (req, res) => {
  const assignment = db.prepare(`
    SELECT sa.*, s.name as staff_name, s.role as staff_role, s.branch as staff_branch,
      st.title as survey_title, st.schema_json, st.description as survey_description
    FROM survey_assignments sa
    JOIN staff s ON sa.staff_id = s.id
    JOIN survey_types st ON sa.survey_type = st.id
    WHERE sa.id = ?
  `).get(req.params.id);

  if (!assignment) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  if (assignment.status === 'completed') {
    return res.status(410).json({ error: 'This survey has already been completed' });
  }

  if (assignment.status === 'expired' || (assignment.expires_at && new Date(assignment.expires_at) < new Date())) {
    if (assignment.status !== 'expired') {
      db.prepare('UPDATE survey_assignments SET status = ? WHERE id = ?').run('expired', req.params.id);
    }
    return res.status(410).json({ error: 'This survey has expired' });
  }

  // Mark as in_progress
  if (assignment.status === 'pending') {
    db.prepare('UPDATE survey_assignments SET status = ? WHERE id = ?').run('in_progress', req.params.id);
  }

  res.json({
    id: assignment.id,
    surveyType: assignment.survey_type,
    surveyTitle: assignment.survey_title,
    surveyDescription: assignment.survey_description,
    schema: JSON.parse(assignment.schema_json),
    staffName: assignment.staff_name,
    staffRole: assignment.staff_role,
    branch: assignment.branch,
    patientName: assignment.patient_name,
    patientAge: assignment.patient_age,
    sessionType: assignment.session_type
  });
});

// ══════════════════════════════════════════════════════════════════
//  SUBMIT SURVEY RESPONSE (PUBLIC — UUID is auth)
// ══════════════════════════════════════════════════════════════════
app.post('/api/survey/assignment/:id/submit', (req, res) => {
  const assignment = db.prepare(`
    SELECT * FROM survey_assignments WHERE id = ?
  `).get(req.params.id);

  if (!assignment) {
    return res.status(404).json({ error: 'Assignment not found' });
  }

  if (assignment.status === 'completed') {
    return res.status(410).json({ error: 'This survey has already been submitted' });
  }

  if (assignment.status === 'expired') {
    return res.status(410).json({ error: 'This survey has expired' });
  }

  const { responses, respondentName, respondentEmail, respondentPhone } = req.body;

  if (!responses) {
    return res.status(400).json({ error: 'responses is required' });
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  const year = now.getFullYear();

  const submitTransaction = db.transaction(() => {
    // Insert response
    db.prepare(`
      INSERT INTO survey_responses (assignment_id, staff_id, survey_type, branch, respondent_name, respondent_email, respondent_phone, responses_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id, assignment.staff_id, assignment.survey_type, assignment.branch,
      respondentName || null, respondentEmail || null, respondentPhone || null,
      JSON.stringify(responses)
    );

    // Update assignment status
    db.prepare(`
      UPDATE survey_assignments SET status = 'completed', completed_at = datetime('now') WHERE id = ?
    `).run(req.params.id);

    // Log assessment
    db.prepare(`
      INSERT INTO assessment_log (staff_id, survey_type, year, quarter, month, assignment_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(assignment.staff_id, assignment.survey_type, year, quarter, month, req.params.id);

    // Update assessment target
    db.prepare(`
      INSERT INTO assessment_targets (staff_id, year, target_count, completed)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(staff_id, year) DO UPDATE SET completed = completed + 1
    `).run(
      assignment.staff_id, year,
      assignment.survey_type === 'HR12' ? 10 : 4
    );
  });

  submitTransaction();

  res.json({ success: true, message: 'Survey response submitted successfully' });
});

// ══════════════════════════════════════════════════════════════════
//  SMART SCHEDULING — SHOULD WE PROMPT?
// ══════════════════════════════════════════════════════════════════
app.get('/api/survey/schedule/next', requireApiKey, (req, res) => {
  const branch = req.query.branch;
  if (!branch) {
    return res.status(400).json({ error: 'branch is required' });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthFraction = month / 12;

  // Get all active staff at this branch
  const staffList = db.prepare(`
    SELECT s.id, s.name, s.role, s.staff_type,
      COALESCE(at2.target_count, CASE WHEN s.staff_type = 'clinical' THEN 4 ELSE 10 END) as target_count,
      COALESCE(at2.completed, 0) as completed
    FROM staff s
    LEFT JOIN assessment_targets at2 ON at2.staff_id = s.id AND at2.year = ?
    WHERE s.is_active = 1 AND s.branch = ?
  `).all(year, branch);

  if (staffList.length === 0) {
    return res.json({ shouldPrompt: false, reason: 'No active staff at this branch' });
  }

  // Calculate urgency for each staff member
  const candidates = staffList.map(s => {
    const expectedByNow = s.target_count * monthFraction;
    const urgency = expectedByNow - s.completed;
    return { ...s, urgency, expectedByNow };
  });

  // Sort by urgency (most behind schedule first)
  candidates.sort((a, b) => b.urgency - a.urgency);

  // Check if the top candidate was assessed in the last 7 days
  const topCandidate = candidates[0];
  const recentAssessment = db.prepare(`
    SELECT COUNT(*) as count FROM assessment_log
    WHERE staff_id = ? AND logged_at > datetime('now', '-7 days')
  `).get(topCandidate.id);

  if (recentAssessment.count > 0) {
    // Try next candidate
    const next = candidates.find(c => {
      const recent = db.prepare(`
        SELECT COUNT(*) as count FROM assessment_log
        WHERE staff_id = ? AND logged_at > datetime('now', '-7 days')
      `).get(c.id);
      return recent.count === 0;
    });

    if (!next) {
      return res.json({ shouldPrompt: false, reason: 'All staff assessed recently, waiting for cooldown' });
    }

    Object.assign(topCandidate, next);
  }

  // Apply probability based on urgency
  let probability;
  let reason;
  if (topCandidate.urgency > 2) {
    probability = 1.0;
    reason = `${topCandidate.name} is significantly behind schedule (${topCandidate.completed}/${topCandidate.target_count} assessments)`;
  } else if (topCandidate.urgency > 0) {
    probability = 0.6;
    reason = `${topCandidate.name} is slightly behind schedule (${topCandidate.completed}/${topCandidate.target_count} assessments)`;
  } else if (topCandidate.urgency === 0) {
    probability = 0.2;
    reason = `${topCandidate.name} is on track (${topCandidate.completed}/${topCandidate.target_count} assessments)`;
  } else {
    probability = 0.05;
    reason = `${topCandidate.name} is ahead of schedule (${topCandidate.completed}/${topCandidate.target_count} assessments)`;
  }

  const shouldPrompt = Math.random() < probability;

  // Determine which survey type to suggest
  let suggestedSurveyType;
  if (topCandidate.staff_type === 'admin') {
    suggestedSurveyType = 'HR12';
  } else {
    suggestedSurveyType = 'HR10'; // Default to pedia; front desk will provide age to determine HR10 vs HR11
  }

  res.json({
    shouldPrompt,
    staffId: topCandidate.id,
    staffName: topCandidate.name,
    staffRole: topCandidate.role,
    staffType: topCandidate.staff_type,
    suggestedSurveyType,
    completed: topCandidate.completed,
    target: topCandidate.target_count,
    urgency: parseFloat(topCandidate.urgency.toFixed(2)),
    reason
  });
});

// ══════════════════════════════════════════════════════════════════
//  GET RESPONSES (filtered)
// ══════════════════════════════════════════════════════════════════
app.get('/api/survey/responses', requireApiKey, (req, res) => {
  const { staffId, surveyType, branch, from, to } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  let where = ['1=1'];
  const params = [];

  if (staffId) { where.push('sr.staff_id = ?'); params.push(staffId); }
  if (surveyType) { where.push('sr.survey_type = ?'); params.push(surveyType); }
  if (branch) { where.push('sr.branch = ?'); params.push(branch); }
  if (from) { where.push('sr.submitted_at >= ?'); params.push(from); }
  if (to) { where.push('sr.submitted_at <= ?'); params.push(to); }

  const countResult = db.prepare(`
    SELECT COUNT(*) as total FROM survey_responses sr WHERE ${where.join(' AND ')}
  `).get(...params);

  const responses = db.prepare(`
    SELECT sr.*, s.name as staff_name, s.role as staff_role,
      sa.patient_name, sa.patient_age
    FROM survey_responses sr
    JOIN staff s ON sr.staff_id = s.id
    LEFT JOIN survey_assignments sa ON sr.assignment_id = sa.id
    WHERE ${where.join(' AND ')}
    ORDER BY sr.submitted_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({
    total: countResult.total,
    page,
    limit,
    responses: responses.map(r => ({
      ...r,
      responses_json: JSON.parse(r.responses_json)
    }))
  });
});

// ══════════════════════════════════════════════════════════════════
//  GET SINGLE RESPONSE
// ══════════════════════════════════════════════════════════════════
app.get('/api/survey/responses/:id', requireApiKey, (req, res) => {
  const response = db.prepare(`
    SELECT sr.*, s.name as staff_name, s.role as staff_role, s.branch as staff_branch,
      sa.patient_name, sa.patient_age, sa.session_type
    FROM survey_responses sr
    JOIN staff s ON sr.staff_id = s.id
    LEFT JOIN survey_assignments sa ON sr.assignment_id = sa.id
    WHERE sr.id = ?
  `).get(req.params.id);

  if (!response) {
    return res.status(404).json({ error: 'Response not found' });
  }

  res.json({
    ...response,
    responses_json: JSON.parse(response.responses_json)
  });
});

// ══════════════════════════════════════════════════════════════════
//  ANALYTICS
// ══════════════════════════════════════════════════════════════════
app.get('/api/survey/analytics', requireApiKey, (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const scoresByMonth = db.prepare(`
    SELECT strftime('%m', sr.submitted_at) as month,
      sr.survey_type,
      COUNT(DISTINCT sr.id) as count,
      AVG(json_extract(value, '$.value')) as avg_score
    FROM survey_responses sr,
      json_each(sr.responses_json, '$.ratings')
    WHERE strftime('%Y', sr.submitted_at) = ?
    GROUP BY month, sr.survey_type
    ORDER BY month
  `).all(String(year));

  const scoresByStaff = db.prepare(`
    SELECT s.id, s.name, s.role, s.branch,
      COUNT(DISTINCT sr.id) as count,
      AVG(json_extract(value, '$.value')) as avg_score
    FROM survey_responses sr
    JOIN staff s ON sr.staff_id = s.id,
      json_each(sr.responses_json, '$.ratings')
    WHERE strftime('%Y', sr.submitted_at) = ?
    GROUP BY s.id
    ORDER BY avg_score DESC
  `).all(String(year));

  res.json({ scoresByMonth, scoresByStaff });
});

// ══════════════════════════════════════════════════════════════════
//  EXPIRE OLD ASSIGNMENTS (runs every hour)
// ══════════════════════════════════════════════════════════════════
setInterval(() => {
  const result = db.prepare(`
    UPDATE survey_assignments
    SET status = 'expired'
    WHERE status IN ('pending', 'in_progress')
    AND datetime(expires_at) < datetime('now')
  `).run();
  if (result.changes > 0) {
    console.log(`Expired ${result.changes} survey assignment(s)`);
  }
}, 60 * 60 * 1000);

// ── Start server ──────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('SCEI Survey API listening on 127.0.0.1:' + PORT);
  console.log('Database:', DB_PATH);
  console.log('');
});
