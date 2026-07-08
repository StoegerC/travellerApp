/**
 * Tests fuer die Sicherheitshelfer der Backend-Haertung. Laufen ohne neue
 * Abhaengigkeit ueber Nodes eingebautes node:test.
 *
 *   node --test backend/test/
 *
 * db.js wird von auth.js/quota.js geladen und legt beim require() eine
 * SQLite-Datei an - deshalb DB_PATH/UPLOAD_DIR auf einen Wegwerf-Ordner
 * zeigen lassen, damit die echte Produktions-DB nie angefasst wird. Muss VOR
 * dem ersten require der zu testenden Module gesetzt sein.
 */
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'traveller-sec-test-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');

const auth = require('../auth');

test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

// ── Passwort-Hashing ─────────────────────────────────────────────────────────

test('hashPassword/verifyPassword: korrekt vs. falsch', async () => {
  const stored = await auth.hashPassword('supersecret');
  assert.match(stored, /^[0-9a-f]+:[0-9a-f]+$/, 'Format salt:hash');
  assert.strictEqual(await auth.verifyPassword('supersecret', stored), true);
  assert.strictEqual(await auth.verifyPassword('wrong', stored), false);
});

test('verifyPassword: leerer/kaputter gespeicherter Wert wirft nicht, ist false', async () => {
  assert.strictEqual(await auth.verifyPassword('x', null), false);
  assert.strictEqual(await auth.verifyPassword('x', ''), false);
  assert.strictEqual(await auth.verifyPassword('x', 'nosalt'), false);
});

test('hashPassword: zwei Hashes desselben Passworts unterscheiden sich (Salt)', async () => {
  const a = await auth.hashPassword('same');
  const b = await auth.hashPassword('same');
  assert.notStrictEqual(a, b);
});

// ── Login-Rate-Limit ─────────────────────────────────────────────────────────

test('Rate-Limit: sperrt nach MAX_FAILURES, danach 429', () => {
  auth._resetRateLimit();
  const email = 'a@b.de', ip = '1.2.3.4';
  for (let i = 0; i < auth.MAX_FAILURES - 1; i++) {
    auth.recordLoginFailure(email, ip);
    assert.strictEqual(auth.checkLoginAllowed(email, ip).allowed, true, `nach ${i + 1} Fehlern noch erlaubt`);
  }
  auth.recordLoginFailure(email, ip); // der MAX_FAILURES-te
  const gate = auth.checkLoginAllowed(email, ip);
  assert.strictEqual(gate.allowed, false);
  assert.ok(gate.retryAfterSeconds > 0);
});

test('Rate-Limit: erfolgreicher Login raeumt den Zaehler weg', () => {
  auth._resetRateLimit();
  const email = 'c@d.de', ip = '9.9.9.9';
  for (let i = 0; i < auth.MAX_FAILURES; i++) auth.recordLoginFailure(email, ip);
  assert.strictEqual(auth.checkLoginAllowed(email, ip).allowed, false);
  auth.recordLoginSuccess(email, ip);
  assert.strictEqual(auth.checkLoginAllowed(email, ip).allowed, true);
});

test('Rate-Limit: andere IP ist unabhaengig gesperrt', () => {
  auth._resetRateLimit();
  const email = 'e@f.de';
  for (let i = 0; i < auth.MAX_FAILURES; i++) auth.recordLoginFailure(email, '10.0.0.1');
  assert.strictEqual(auth.checkLoginAllowed(email, '10.0.0.1').allowed, false);
  assert.strictEqual(auth.checkLoginAllowed(email, '10.0.0.2').allowed, true);
});

test('Rate-Limit: Sperre laeuft nach LOCKOUT_MS ab', () => {
  auth._resetRateLimit();
  const email = 'g@h.de', ip = '5.5.5.5';
  const t0 = 1_000_000;
  for (let i = 0; i < auth.MAX_FAILURES; i++) auth.recordLoginFailure(email, ip, t0);
  assert.strictEqual(auth.checkLoginAllowed(email, ip, t0).allowed, false);
  assert.strictEqual(auth.checkLoginAllowed(email, ip, t0 + auth.LOCKOUT_MS + 1).allowed, true);
});

// ── requirePasswordSet ───────────────────────────────────────────────────────

function runMiddleware(mw, req) {
  return new Promise(resolve => {
    let statusCode = 200, body = null, nexted = false;
    const res = {
      status(c) { statusCode = c; return this; },
      json(b) { body = b; resolve({ statusCode, body, nexted }); return this; },
      send(b) { body = b; resolve({ statusCode, body, nexted }); return this; },
    };
    mw(req, res, () => { nexted = true; resolve({ statusCode, body, nexted }); });
  });
}

test('requirePasswordSet: laesst normalen Nutzer durch', async () => {
  const r = await runMiddleware(auth.requirePasswordSet, { user: { mustChangePassword: false }, path: '/char/1' });
  assert.strictEqual(r.nexted, true);
});

test('requirePasswordSet: blockt Setup-Token-Session an fremden Routen', async () => {
  const r = await runMiddleware(auth.requirePasswordSet, { user: { mustChangePassword: true }, path: '/char/1' });
  assert.strictEqual(r.nexted, false);
  assert.strictEqual(r.statusCode, 403);
  assert.strictEqual(r.body.mustChangePassword, true);
});

test('requirePasswordSet: erlaubt /auth/password trotz Setup-Token', async () => {
  const r = await runMiddleware(auth.requirePasswordSet, { user: { mustChangePassword: true }, path: '/auth/password' });
  assert.strictEqual(r.nexted, true);
});
