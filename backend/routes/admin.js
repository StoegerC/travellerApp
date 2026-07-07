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
const { execFileSync } = require('child_process');
const db = require('../db');
const orphanScan = require('../orphan-scan');
const { CLONE_DIR, GIT_ENV } = require('../git-backup-config');

const router = express.Router();

function git(args) {
  return execFileSync('git', args, { cwd: CLONE_DIR, env: GIT_ENV, encoding: 'utf8' });
}

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

// GET /admin/overview – pro Nutzer: eigene Charaktere/Kampagnen (Name +
// Groesse) und Speicherverbrauch aufgeschluesselt in Charakter-JSON vs.
// Medien (Datei-Uploads). "orphaned" fasst Inhalte zusammen, deren Owner
// keinem aktuellen Nutzer mehr entspricht (z.B. nach admin/users/:id DELETE,
// das bewusst keine Charaktere/Kampagnen mitloescht, siehe db.deleteUser).
router.get('/admin/overview', (req, res) => {
  res.json(db.getAdminOverview());
});

// ── Verwaiste Mediendateien (siehe ../orphan-scan.js) ───────────────────────

// GET /admin/orphaned-files – live-Scan, keine Zwischenspeicherung.
router.get('/admin/orphaned-files', (req, res) => {
  res.json(orphanScan.findOrphanedFiles(db));
});

// POST /admin/orphaned-files/cleanup – scannt erneut (statt einer evtl.
// veralteten, clientseitig anzeigten Liste zu vertrauen) und loescht alle
// aktuell gefundenen Kandidaten unwiderruflich.
router.post('/admin/orphaned-files/cleanup', (req, res) => {
  res.json({ deleted: orphanScan.cleanupOrphanedFiles(db) });
});

// POST /admin/orphaned-files/:id/restore – haengt die Datei ueber die
// gespeicherten owner/field/ref-Metadaten zurueck in die Charakterdaten.
router.post('/admin/orphaned-files/:id/restore', (req, res) => {
  const result = orphanScan.restoreFile(db, req.params.id);
  if (!result.ok) return res.status(400).send(result.error);
  res.status(200).send('OK');
});

// ── Gezielter Rollback auf einen Git-Backup-Snapshot ────────────────────────

function backupRepoReady() {
  return fs.existsSync(`${CLONE_DIR}/.git`);
}

// GET /admin/backup-snapshots?type=character|campaign&id=<id> – Commits, bei
// denen sich GENAU diese eine Datei im Backup-Repo geaendert hat (kein
// globaler Commit-Browser noetig, siehe backup-to-git.js fuer das Schema
// characters/<id>.json bzw. campaigns/<id>.json).
router.get('/admin/backup-snapshots', (req, res) => {
  const { type, id } = req.query;
  if (!['character', 'campaign'].includes(type) || !id) return res.status(400).send('Invalid type/id');
  if (!backupRepoReady()) return res.json([]);
  const relPath = `${type === 'character' ? 'characters' : 'campaigns'}/${id}.json`;
  try { git(['pull', '--ff-only']); } catch { /* best effort - Liste zeigt dann evtl. nicht den allerneuesten Stand */ }
  let log;
  try {
    log = git(['log', '--format=%H|%aI|%s', '--', relPath]);
  } catch (e) {
    return res.status(500).send('Backup-Repo nicht lesbar: ' + e.message);
  }
  const snapshots = log.trim().split('\n').filter(Boolean).map(line => {
    const [commit, date, ...msgParts] = line.split('|');
    return { commit, date, message: msgParts.join('|') };
  });
  res.json(snapshots);
});

// POST /admin/backup-snapshots/restore { type, id, commit } – ueberschreibt
// den AKTUELLEN Charakter/die Kampagne mit dem Stand aus dem gewaehlten
// Snapshot. db.putCharacter()/db.upsertCampaign() ohne expectedUpdatedAt =
// erzwungenes Schreiben mit frischem Zeitstempel (kein Optimistic-Lock-Check,
// bewusst - das ist eine Admin-Aktion). Bekannte Einschraenkung: ein Geraet
// mit noch nicht synchronisierten lokalen Aenderungen kann den Rollback beim
// naechsten eigenen Speichern teilweise rueckgaengig machen (Sync-Modell ist
// "lokal gewinnt bei Push-Konflikt", siehe frontend/js/sync-merge.js) -
// Admin-UI weist deshalb darauf hin, dass Geraete vorher neu laden sollten.
router.post('/admin/backup-snapshots/restore', (req, res) => {
  const { type, id, commit } = req.body || {};
  if (!['character', 'campaign'].includes(type) || !id || !commit) return res.status(400).send('Invalid body');
  if (!backupRepoReady()) return res.status(404).send('Backup-Repo nicht verfügbar');
  const relPath = `${type === 'character' ? 'characters' : 'campaigns'}/${id}.json`;
  let content;
  try {
    content = git(['show', `${commit}:${relPath}`]);
  } catch (e) {
    return res.status(404).send('Snapshot nicht gefunden: ' + e.message);
  }
  if (type === 'character') {
    if (!db.getCharacter(id)) return res.status(404).send('Charakter existiert nicht mehr');
    db.putCharacter(id, content);
  } else {
    if (!db.campaignExists(id)) return res.status(404).send('Kampagne existiert nicht mehr');
    db.upsertCampaign(JSON.parse(content));
  }
  res.status(200).send('OK');
});

module.exports = router;
