/**
 * Tests fuer backend/authz.js - die Zugriffskontroll-Helfer, in denen die
 * Kampagnen-Autorisierungsluecke aus 3.4.1 lag. Reine Funktionen, db wird als
 * Parameter uebergeben (siehe Datei-Kommentar dort), deshalb hier mit einem
 * Fake-db ohne echte SQLite-Anbindung testbar.
 *
 *   node --test backend/test/authz.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const { ownsCharacter, isCampaignMember } = require('../authz');

// Minimaler Fake statt der echten db: nur getCharacter wird von authz genutzt.
function fakeDb(charsById) {
  return { getCharacter: id => charsById[id] || null };
}

// ── ownsCharacter ────────────────────────────────────────────────────────────

test('ownsCharacter: eigener Charakter', () => {
  const db = fakeDb({ c1: { ownerId: 'u1' } });
  assert.strictEqual(ownsCharacter(db, 'u1', 'c1'), true);
});

test('ownsCharacter: fremder Charakter', () => {
  const db = fakeDb({ c1: { ownerId: 'u2' } });
  assert.strictEqual(ownsCharacter(db, 'u1', 'c1'), false);
});

test('ownsCharacter: nicht existierender Charakter ist nicht besessen', () => {
  const db = fakeDb({});
  assert.strictEqual(ownsCharacter(db, 'u1', 'ghost'), false);
});

test('ownsCharacter: besitzerloser Charakter (owner_id NULL) gehoert niemandem', () => {
  const db = fakeDb({ c1: { ownerId: null } });
  assert.strictEqual(ownsCharacter(db, 'u1', 'c1'), false);
  // Auch nicht, wenn userId ebenfalls "leer" ist - kein NULL==NULL-Durchrutschen.
  assert.strictEqual(ownsCharacter(db, null, 'c1'), false);
});

// ── isCampaignMember ─────────────────────────────────────────────────────────

test('isCampaignMember: Owner ist immer Mitglied', () => {
  const db = fakeDb({});
  const campaign = { ownerId: 'u1', members: [] };
  assert.strictEqual(isCampaignMember(db, campaign, 'u1'), true);
});

test('isCampaignMember: ueber einen eigenen Mitglieds-Charakter', () => {
  const db = fakeDb({ c1: { ownerId: 'u2' } });
  const campaign = { ownerId: 'owner', members: [{ charId: 'c1' }] };
  assert.strictEqual(isCampaignMember(db, campaign, 'u2'), true);
});

test('isCampaignMember: Fremder ohne eigenen Mitglieds-Charakter ist draussen', () => {
  // Der Charakter c1 ist Mitglied, gehoert aber u2 - u3 ist nicht Mitglied,
  // obwohl er die Kampagnen-ID kennt (genau die Luecke aus 3.4.1).
  const db = fakeDb({ c1: { ownerId: 'u2' } });
  const campaign = { ownerId: 'owner', members: [{ charId: 'c1' }] };
  assert.strictEqual(isCampaignMember(db, campaign, 'u3'), false);
});

test('isCampaignMember: null-Kampagne ist nie zugaenglich', () => {
  const db = fakeDb({});
  assert.strictEqual(isCampaignMember(db, null, 'u1'), false);
});

test('isCampaignMember: Mitglieds-Charakter existiert nicht mehr', () => {
  // Der als Mitglied gefuehrte Charakter wurde geloescht - der fruehere
  // Besitzer verliert dadurch die Mitgliedschaft ueber diesen Charakter.
  const db = fakeDb({});
  const campaign = { ownerId: 'owner', members: [{ charId: 'geloescht' }] };
  assert.strictEqual(isCampaignMember(db, campaign, 'u2'), false);
});

test('isCampaignMember: fehlendes members-Feld wirft nicht', () => {
  const db = fakeDb({});
  const campaign = { ownerId: 'owner' };
  assert.strictEqual(isCampaignMember(db, campaign, 'fremd'), false);
});
