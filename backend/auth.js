/**
 * Authentifizierung (Phase 3): Session-Tokens statt eines einzelnen geteilten
 * API-Keys. Passwort-Hashing mit Node's eingebautem crypto.scrypt statt einer
 * externen Bibliothek (bcrypt/argon2) - keine neue Abhängigkeit, gleiche
 * Denkweise wie die node:sqlite-Entscheidung in db.js.
 *
 * Sessions sind opake Zufalls-Tokens in der sessions-Tabelle (db.js), kein
 * JWT - dadurch jederzeit serverseitig widerrufbar (z.B. bei Passwort-Reset),
 * ohne Blocklist-Konstruktion.
 *
 * hashPassword/verifyPassword sind async: scryptSync blockierte bei jedem
 * Login-Versuch den kompletten Event-Loop, ein paar parallele Requests legten
 * den Server damit spuerbar lahm. Zusammen mit dem fehlenden Rate-Limit war
 * /auth/login der billigste DoS-Hebel, den der Server hatte.
 */
const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./db');

const scrypt = promisify(crypto.scrypt);
const SCRYPT_KEYLEN = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, SCRYPT_KEYLEN)).toString('hex');
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = await scrypt(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// ── Login-Rate-Limit ────────────────────────────────────────────────────────
// /auth/login ist der einzige oeffentliche, rechenintensive Endpunkt. Ohne
// Bremse ist er sowohl Brute-Force-Ziel (Passwoerter ab 8 Zeichen) als auch
// der billigste Weg, den Server mit scrypt-Arbeit zu ueberlasten.
//
// Bewusst in-memory (Map) statt einer Tabelle: bei einem Neustart darf die
// Sperre ruhig verfallen, und eine Handvoll Spieler erzeugt keine Menge an
// Eintraegen, die den Speicher belastet. Geschluesselt nach E-Mail UND IP,
// damit weder ein Angreifer ueber viele IPs ein Konto durchprobiert noch eine
// IP viele Konten.
const MAX_FAILURES = 5;
const LOCKOUT_MS   = 15 * 60 * 1000;
const _failures    = new Map(); // key -> { count, firstAt, lockedUntil }

function _key(email, ip) {
  return `${String(email || '').toLowerCase()}|${ip || '?'}`;
}

function _prune(now) {
  for (const [k, e] of _failures) {
    if ((e.lockedUntil || 0) < now && now - e.firstAt > LOCKOUT_MS) _failures.delete(k);
  }
}

// Rueckgabe: { allowed } bzw. { allowed: false, retryAfterSeconds }
function checkLoginAllowed(email, ip, now = Date.now()) {
  const entry = _failures.get(_key(email, ip));
  if (!entry?.lockedUntil || entry.lockedUntil <= now) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
}

function recordLoginFailure(email, ip, now = Date.now()) {
  _prune(now);
  const key = _key(email, ip);
  const entry = _failures.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  // Zaehlfenster hat dieselbe Dauer wie die Sperre: wer 15 Minuten lang nichts
  // falsch macht, faengt wieder bei null an.
  if (now - entry.firstAt > LOCKOUT_MS) { entry.count = 0; entry.firstAt = now; }
  entry.count++;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = now + LOCKOUT_MS;
  _failures.set(key, entry);
  return entry;
}

function recordLoginSuccess(email, ip) {
  _failures.delete(_key(email, ip));
}

// Nur fuer Tests.
function _resetRateLimit() { _failures.clear(); }

// ── Middleware ──────────────────────────────────────────────────────────────

// Haengt req.user = { id, email, roles, mustChangePassword } an, sonst 401.
function checkAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).send('Unauthorized');
  const user = db.getSessionUser(token);
  if (!user) return res.status(401).send('Unauthorized');
  req.user = user;
  next();
}

// Middleware-Fabrik für Routen, die zusätzlich ein bestimmtes Rollen-Flag
// voraussetzen (z.B. requireRole('admin')). checkAuth muss vorher gelaufen sein.
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user?.roles?.includes(role)) return res.status(403).send('Forbidden');
    next();
  };
}

// Solange ein Nutzer noch mit seinem einmaligen Setup-Token angemeldet ist,
// darf die Session nichts, ausser sich zu identifizieren, das Passwort zu
// setzen und sich abzumelden. Sonst waere der Setup-Token faktisch ein
// vollwertiges Dauerpasswort - genau das soll er nicht sein.
const PASSWORD_CHANGE_ALLOWLIST = ['/auth/me', '/auth/password', '/auth/logout'];

function requirePasswordSet(req, res, next) {
  if (!req.user?.mustChangePassword) return next();
  if (PASSWORD_CHANGE_ALLOWLIST.includes(req.path)) return next();
  return res.status(403).json({ error: 'Passwort muss zuerst gesetzt werden', mustChangePassword: true });
}

module.exports = {
  checkAuth, requireRole, requirePasswordSet,
  hashPassword, verifyPassword,
  checkLoginAllowed, recordLoginFailure, recordLoginSuccess, _resetRateLimit,
  MAX_FAILURES, LOCKOUT_MS,
};
