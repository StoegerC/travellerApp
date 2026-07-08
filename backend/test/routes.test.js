/**
 * Tests fuer reine Route-Helfer (Beitritts-Code, Snapshot-Pfad-Validierung,
 * Admin-Lockout) und die Speicher-Quota gegen eine Wegwerf-DB.
 *
 *   node --test backend/test/
 *
 * Wie in security.test.js: DB_PATH/UPLOAD_DIR auf einen Temp-Ordner, BEVOR
 * db.js (transitiv ueber die Route-Module) geladen wird.
 */
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'traveller-routes-test-'));
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');

const campaigns = require('../routes/campaigns');
const admin = require('../routes/admin');
const quota = require('../quota');
const db = require('../db');

test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {} });

// ── Beitritts-Code ───────────────────────────────────────────────────────────

test('joinCodeMatches: exakter Code passt, falscher/leerer nicht', () => {
  const code = campaigns.generateJoinCode();
  assert.strictEqual(campaigns.joinCodeMatches(code, code), true);
  assert.strictEqual(campaigns.joinCodeMatches(code, code + 'x'), false);
  assert.strictEqual(campaigns.joinCodeMatches(code, ''), false);
  assert.strictEqual(campaigns.joinCodeMatches(code, null), false);
});

test('joinCodeMatches: leerer erwarteter Code lehnt immer ab', () => {
  // Bestandskampagne ohne Code (vor der Haertung) - niemand darf ohne
  // startup-tasks.ensureCampaignJoinCodes rein.
  assert.strictEqual(campaigns.joinCodeMatches(null, 'irgendwas'), false);
  assert.strictEqual(campaigns.joinCodeMatches('', ''), false);
});

// ── Snapshot-Pfad-Validierung ────────────────────────────────────────────────

test('resolveSnapshotPath: gueltige Werte -> Pfad', () => {
  assert.deepStrictEqual(admin.resolveSnapshotPath('character', 'char-123'),
    { ok: true, relPath: 'characters/char-123.json' });
  assert.deepStrictEqual(admin.resolveSnapshotPath('campaign', 'spinward26'),
    { ok: true, relPath: 'campaigns/spinward26.json' });
});

test('resolveSnapshotPath: Pfad-Traversal und Optionen werden abgewiesen', () => {
  for (const id of ['../secret', 'a/b', '--upload-pack=x', 'x'.repeat(65), '', '.', 'a b']) {
    assert.strictEqual(admin.resolveSnapshotPath('character', id).ok, false, `id="${id}"`);
  }
  assert.strictEqual(admin.resolveSnapshotPath('user', 'x').ok, false, 'falscher type');
});

// ── Admin-Lockout ────────────────────────────────────────────────────────────

test('wouldRemoveLastAdmin: schuetzt den letzten Admin', () => {
  const before = db.countAdmins();
  const a = db.insertUser({ id: 'adm-1', email: 'admin1@x.de', roles: ['admin'] });
  // Genau ein Admin -> ihm admin entziehen/ihn loeschen ist gesperrt.
  assert.strictEqual(db.countAdmins(), before + 1);
  if (db.countAdmins() === 1) {
    assert.strictEqual(admin.wouldRemoveLastAdmin(a, []), true, 'Rollen leeren');
    assert.strictEqual(admin.wouldRemoveLastAdmin(a, null), true, 'loeschen');
  }
  // Zweiter Admin -> beide duerfen wieder degradiert werden.
  const b = db.insertUser({ id: 'adm-2', email: 'admin2@x.de', roles: ['admin'] });
  assert.strictEqual(admin.wouldRemoveLastAdmin(a, []), false);
  assert.strictEqual(admin.wouldRemoveLastAdmin(b, null), false);
  // Nicht-Admin ist nie betroffen.
  const c = db.insertUser({ id: 'usr-1', email: 'user1@x.de', roles: [] });
  assert.strictEqual(admin.wouldRemoveLastAdmin(c, null), false);
  db.deleteUser('adm-1'); db.deleteUser('adm-2'); db.deleteUser('usr-1');
});

// ── Speicher-Quota ───────────────────────────────────────────────────────────

test('checkQuota: greift ab dem Limit, aktueller Charakterstand zaehlt nicht doppelt', () => {
  const prev = process.env.USER_QUOTA_BYTES;
  const user = db.insertUser({ id: 'q-user', email: 'quota@x.de', roles: [] });
  const big = JSON.stringify({ metadata: { name: 'Q' }, blob: 'x'.repeat(5000) });
  db.putCharacter('q-char', big, null, user.id);

  process.env.USER_QUOTA_BYTES = '100000';
  assert.strictEqual(quota.checkQuota(user.id, 1000).ok, true, 'unter Limit');

  process.env.USER_QUOTA_BYTES = '4000'; // kleiner als der bestehende Charakter
  assert.strictEqual(quota.checkQuota(user.id, 1000).ok, false, 'ueber Limit');
  // Ueberschreiben desselben Charakters: sein alter Stand wird abgezogen.
  assert.strictEqual(quota.checkQuota(user.id, 1000, { excludeCharId: 'q-char' }).ok, true,
    'eigener Stand nicht doppelt gezaehlt');

  process.env.USER_QUOTA_BYTES = '0'; // 0 = unbegrenzt
  assert.strictEqual(quota.checkQuota(user.id, 999999999).ok, true, 'unbegrenzt');

  if (prev === undefined) delete process.env.USER_QUOTA_BYTES; else process.env.USER_QUOTA_BYTES = prev;
  db.deleteCharacter('q-char'); db.deleteUser('q-user');
});
