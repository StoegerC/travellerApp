/**
 * Login/Logout (Phase 3). POST /auth/login ist bewusst öffentlich (wird in
 * server.js vor checkAuth registriert, wie die statischen Frontend-Dateien) -
 * ohne gültige Session kann man sich sonst gar nicht erst einloggen.
 *
 * Sicherheitshaertung: Frueher galt "hat der Nutzer noch keinen password_hash,
 * wird das uebermittelte Passwort einfach uebernommen". Wer die E-Mail kannte
 * und vor dem echten Nutzer da war, uebernahm das Konto - und nach jedem
 * Admin-Passwort-Reset ging dieses Fenster erneut auf. Stattdessen vergibt der
 * Admin jetzt einen einmaligen Setup-Token (siehe routes/admin.js), mit dem
 * sich der Nutzer genau einmal anmeldet und dabei sofort ein eigenes Passwort
 * setzen muss (must_change_password, siehe requirePasswordSet in ../auth.js).
 */
const express = require('express');
const db = require('../db');
const {
  hashPassword, verifyPassword,
  checkLoginAllowed, recordLoginFailure, recordLoginSuccess,
} = require('../auth');

const publicRouter = express.Router();

const MIN_PASSWORD_LENGTH = 8;

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /auth/login – prueft das Passwort (bzw. den noch nicht ersetzten
// Setup-Token) und legt eine Session an. mustChangePassword im Response sagt
// dem Client, dass er sofort POST /auth/password nachschieben muss; bis dahin
// laesst requirePasswordSet die Session an keine andere Route.
publicRouter.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || !password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).send(`E-Mail und Passwort (min. ${MIN_PASSWORD_LENGTH} Zeichen) erforderlich`);
  }

  const gate = checkLoginAllowed(email, req.ip);
  if (!gate.allowed) {
    res.set('Retry-After', String(gate.retryAfterSeconds));
    return res.status(429).send(`Zu viele Fehlversuche. Bitte in ${Math.ceil(gate.retryAfterSeconds / 60)} Minuten erneut versuchen.`);
  }

  const user = db.getUserByEmail(email);
  // Generische Fehlermeldung - nicht verraten, ob die E-Mail existiert. Der
  // Fehlversuch-Zaehler laeuft auch fuer unbekannte E-Mails mit.
  if (!user || !user.hasPassword || !(await verifyPassword(password, user.passwordHash))) {
    recordLoginFailure(email, req.ip);
    return res.status(401).send('Ungültige Anmeldedaten');
  }

  recordLoginSuccess(email, req.ip);
  const token = db.createSession(user.id);
  res.json({
    token, email: user.email, roles: user.roles,
    mustChangePassword: user.mustChangePassword,
  });
});

const protectedRouter = express.Router();

// GET /auth/me – wer bin ich? Dient dem Cloud-Einstellungen-Dialog als
// kombinierter Verbindungs-/Session-Test: ein 200 bestätigt gleichzeitig
// Erreichbarkeit UND einen noch gültigen Token, ein 401 (durch checkAuth,
// bevor diese Route ueberhaupt erreicht wird) zeigt eine abgelaufene/
// widerrufene Sitzung an.
protectedRouter.get('/auth/me', (req, res) => {
  res.json({ email: req.user.email, roles: req.user.roles, mustChangePassword: req.user.mustChangePassword });
});

// POST /auth/password – eigenes Passwort setzen/aendern. Deckt beide Faelle ab:
// den Erst-Login mit Setup-Token (currentPassword = der Token) und den
// spaeteren freiwilligen Wechsel (bisher konnte ein Nutzer sein Passwort
// ueberhaupt nicht selbst aendern, nur der Admin zuruecksetzen).
//
// Alle bestehenden Sessions werden verworfen - wer sein Passwort aendert, will
// typischerweise genau das (z.B. weil ein Geraet abhanden kam). Fuer das
// aufrufende Geraet wird sofort eine frische Session ausgestellt, damit es
// nicht direkt nach dem Setzen wieder auf der Login-Maske landet.
protectedRouter.post('/auth/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).send(`Neues Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben`);
  }
  if (currentPassword === newPassword) {
    return res.status(400).send('Neues Passwort muss sich vom aktuellen unterscheiden');
  }
  const user = db.getUserById(req.user.id);
  if (!user || !(await verifyPassword(currentPassword || '', user.passwordHash))) {
    return res.status(401).send('Aktuelles Passwort ist falsch');
  }

  db.setPasswordHash(user.id, await hashPassword(newPassword), false);
  db.invalidateUserSessions(user.id);
  const token = db.createSession(user.id);
  res.json({ token });
});

// POST /auth/logout – löscht nur die aktuelle Session (andere Geräte bleiben
// eingeloggt), Token kommt bereits authentifiziert über checkAuth an.
protectedRouter.post('/auth/logout', (req, res) => {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) db.deleteSession(token);
  res.status(200).send('OK');
});

module.exports = { publicRouter, protectedRouter, MIN_PASSWORD_LENGTH };
