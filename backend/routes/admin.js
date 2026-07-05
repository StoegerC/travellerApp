/**
 * Administrator-Endpunkte (Phase 3): Nutzerverwaltung + Server-Statistiken.
 * Alle Routen hier zusätzlich zu checkAuth durch requireRole('admin')
 * geschützt (in server.js verdrahtet) - striktes "nur Benutzerverwaltung +
 * Statistiken", kein automatischer Lesezugriff auf Charakterinhalte (siehe
 * Plan: admin bekommt gm nicht automatisch dazu).
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const db = require('../db');

const router = express.Router();

const VALID_ROLES = ['gm', 'admin'];

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return [...new Set(roles.filter(r => VALID_ROLES.includes(r)))];
}

function publicUser(u) {
  return { id: u.id, email: u.email, roles: u.roles, createdAt: u.createdAt, hasPassword: u.hasPassword };
}

// GET /admin/users
router.get('/admin/users', (req, res) => {
  res.json(db.listUsers().map(publicUser));
});

// POST /admin/users – legt einen Nutzer ohne Passwort an (setzt es selbst
// beim ersten Login, siehe backend/routes/auth.js).
router.post('/admin/users', (req, res) => {
  const { email, roles } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).send('Ungültige E-Mail');
  if (db.getUserByEmail(email)) return res.status(409).send('E-Mail bereits vergeben');
  const user = db.insertUser({ id: crypto.randomBytes(12).toString('hex'), email, roles: sanitizeRoles(roles) });
  res.status(201).json(publicUser(user));
});

// PUT /admin/users/:id/roles
router.put('/admin/users/:id/roles', (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) return res.status(404).send('Not Found');
  db.setUserRoles(user.id, sanitizeRoles((req.body || {}).roles));
  res.json(publicUser(db.getUserById(user.id)));
});

// PUT /admin/users/:id/reset-password – zwingt neues Passwort beim naechsten
// Login, invalidiert alle bestehenden Sessions (erzwungener Re-Login).
router.put('/admin/users/:id/reset-password', (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) return res.status(404).send('Not Found');
  db.setPasswordHash(user.id, null);
  db.invalidateUserSessions(user.id);
  res.status(200).send('OK');
});

// DELETE /admin/users/:id – Charaktere/Kampagnen bleiben erhalten (nur
// herrenlos), siehe db.deleteUser-Kommentar.
router.delete('/admin/users/:id', (req, res) => {
  db.deleteUser(req.params.id);
  res.status(200).send('OK');
});

// GET /admin/stats
router.get('/admin/stats', (req, res) => {
  const fileStats = db.getFileStats();
  let disk = null;
  try {
    const s = fs.statfsSync(db.UPLOAD_DIR);
    disk = { freeBytes: s.bfree * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch { /* statfs auf dieser Plattform evtl. nicht verfuegbar */ }

  res.json({
    characterCount: db.listCharacters().length,
    campaignCount:  db.listCampaigns().length,
    userCount:      db.listUsers().length,
    files:          fileStats,
    disk,
    uptimeSeconds:  process.uptime(),
  });
});

module.exports = router;
