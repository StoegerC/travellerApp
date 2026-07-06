/**
 * Login/Logout (Phase 3). POST /auth/login ist bewusst öffentlich (wird in
 * server.js vor checkAuth registriert, wie die statischen Frontend-Dateien) -
 * ohne gültige Session kann man sich sonst gar nicht erst einloggen.
 */
const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../auth');

const publicRouter = express.Router();

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /auth/login – deckt sowohl normalen Login als auch Erst-Login/
// Passwort-Reset mit demselben Endpunkt ab: hat der Nutzer noch keinen
// password_hash (NULL), wird das übermittelte Passwort als neues Passwort
// übernommen statt geprüft.
publicRouter.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || !password || password.length < 8) {
    return res.status(400).send('E-Mail und Passwort (min. 8 Zeichen) erforderlich');
  }
  const user = db.getUserByEmail(email);
  // Generische Fehlermeldung - nicht verraten, ob die E-Mail existiert.
  if (!user) return res.status(401).send('Ungültige Anmeldedaten');

  if (!user.hasPassword) {
    db.setPasswordHash(user.id, hashPassword(password));
  } else if (!verifyPassword(password, user.passwordHash)) {
    return res.status(401).send('Ungültige Anmeldedaten');
  }

  const token = db.createSession(user.id);
  res.json({ token, email: user.email, roles: user.roles });
});

const protectedRouter = express.Router();

// GET /auth/me – wer bin ich? Dient dem Cloud-Einstellungen-Dialog als
// kombinierter Verbindungs-/Session-Test: ein 200 bestätigt gleichzeitig
// Erreichbarkeit UND einen noch gültigen Token, ein 401 (durch checkAuth,
// bevor diese Route ueberhaupt erreicht wird) zeigt eine abgelaufene/
// widerrufene Session an.
protectedRouter.get('/auth/me', (req, res) => {
  res.json({ email: req.user.email, roles: req.user.roles });
});

// POST /auth/logout – löscht nur die aktuelle Session (andere Geräte bleiben
// eingeloggt), Token kommt bereits authentifiziert über checkAuth an.
protectedRouter.post('/auth/logout', (req, res) => {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) db.deleteSession(token);
  res.status(200).send('OK');
});

module.exports = { publicRouter, protectedRouter };
