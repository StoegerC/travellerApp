/**
 * Authentifizierung (Phase 3): Session-Tokens statt eines einzelnen geteilten
 * API-Keys. Passwort-Hashing mit Node's eingebautem crypto.scrypt statt einer
 * externen Bibliothek (bcrypt/argon2) - keine neue Abhängigkeit, gleiche
 * Denkweise wie die node:sqlite-Entscheidung in db.js.
 *
 * Sessions sind opake Zufalls-Tokens in der sessions-Tabelle (db.js), kein
 * JWT - dadurch jederzeit serverseitig widerrufbar (z.B. bei Passwort-Reset),
 * ohne Blocklist-Konstruktion.
 */
const crypto = require('crypto');
const db = require('./db');

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// Haengt req.user = { id, email, roles } an, sonst 401. Ersetzt den frueheren
// Vergleich gegen den einzelnen geteilten API_KEY vollstaendig (sauberer
// Cutover, kein Parallelbetrieb beider Mechanismen).
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

module.exports = { checkAuth, requireRole, hashPassword, verifyPassword };
