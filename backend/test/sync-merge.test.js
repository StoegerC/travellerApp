/**
 * Tests fuer frontend/js/sync-merge.js - das Item-Level-Merging des
 * Charakter-/Kampagnen-Syncs. In diesem Modul (und rundherum) lagen die
 * letzten ernsten Sync-Bugs: verlorene Mitspieler-Aenderungen, nicht
 * propagierende Loeschungen, Tombstone-Behandlung. Die Datei ist bewusst
 * plain-JS mit module.exports-Guard gehalten und wird auch vom Backend per
 * require() genutzt (backend/db.js) - hier direkt einbindbar.
 *
 *   node --test backend/test/sync-merge.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const SyncMerge = require('../../frontend/js/sync-merge.js');

// Zeitstempel nahe "jetzt", nicht absolut ab Epoch: purgeTombstones vergleicht
// deletedAt gegen (jetzt - 90 Tage) - ein iso(2000) waere 1970 und wuerde jeden
// Tombstone sofort als "uralt" wegraeumen. Groesserer Offset = spaeter/neuer
// (wie in den Vergleichs-Assertions unten).
const BASE = Date.now() - 3600 * 1000; // eine Stunde zurueck als Nullpunkt
const iso = offset => new Date(BASE + offset * 1000).toISOString();
const item = (id, offset, extra = {}) => ({ id, updatedAt: iso(offset), _deleted: false, deletedAt: null, ...extra });

// ── mergeArray: neuere Version gewinnt, Vereinigung der IDs ───────────────────

test('mergeArray: nur-lokale und nur-remote Items bleiben beide erhalten', () => {
  const local  = [item('a', 1000)];
  const remote = [item('b', 1000)];
  const merged = SyncMerge.mergeArray(local, remote);
  assert.deepStrictEqual(merged.map(i => i.id).sort(), ['a', 'b']);
});

test('mergeArray: bei gleicher id gewinnt die spaetere updatedAt-Version', () => {
  const local  = [item('a', 2000, { v: 'lokal-neu' })];
  const remote = [item('a', 1000, { v: 'remote-alt' })];
  assert.strictEqual(SyncMerge.mergeArray(local, remote)[0].v, 'lokal-neu');
  // Und andersherum, remote neuer:
  const local2  = [item('a', 1000, { v: 'lokal-alt' })];
  const remote2 = [item('a', 2000, { v: 'remote-neu' })];
  assert.strictEqual(SyncMerge.mergeArray(local2, remote2)[0].v, 'remote-neu');
});

test('mergeArray: Gleichstand -> lokale Version gewinnt (>=)', () => {
  const local  = [item('a', 1000, { v: 'lokal' })];
  const remote = [item('a', 1000, { v: 'remote' })];
  assert.strictEqual(SyncMerge.mergeArray(local, remote)[0].v, 'lokal');
});

test('mergeArray: Tombstone (Loeschung) propagiert, weil Loeschen updatedAt bumpt', () => {
  // Geraet A loescht (spaeterer Zeitstempel), Geraet B hat noch die alte Version.
  const deleted = item('a', 3000, { _deleted: true, deletedAt: iso(3000) });
  const stillThere = item('a', 2000, { v: 'da' });
  const merged = SyncMerge.mergeArray([stillThere], [deleted]);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0]._deleted, true);
});

test('mergeArray: nicht-Array-Eingaben werden als leer behandelt', () => {
  assert.deepStrictEqual(SyncMerge.mergeArray(null, undefined), []);
  assert.deepStrictEqual(SyncMerge.mergeArray([item('a', 1)], null).map(i => i.id), ['a']);
});

// ── purgeTombstones ──────────────────────────────────────────────────────────

test('purgeTombstones: alte Tombstones fallen weg, frische bleiben', () => {
  const daysAgo = d => new Date(Date.now() - d * 86400000).toISOString();
  const oldDel = { id: 'old', _deleted: true, deletedAt: daysAgo(91) };
  const newDel = { id: 'new', _deleted: true, deletedAt: daysAgo(1) };
  const alive  = { id: 'live', _deleted: false };
  const kept = SyncMerge.purgeTombstones([oldDel, newDel, alive]);
  assert.deepStrictEqual(kept.map(i => i.id).sort(), ['live', 'new']);
});

test('purgeTombstones: lebende Items werden nie entfernt, egal wie alt', () => {
  const ancient = { id: 'x', _deleted: false, updatedAt: new Date(0).toISOString() };
  assert.deepStrictEqual(SyncMerge.purgeTombstones([ancient]), [ancient]);
});

// ── _mergeShip: Feld-Level-Merge, aber ganzes Schiff bei Loeschung ────────────

test('_mergeShip: Skalarfelder lokal-gewinnt, weapons feldweise gemerged', () => {
  const local = {
    id: 's1', name: 'Lokalname', updatedAt: iso(2000),
    weapons: [item('w1', 2000, { name: 'Laser lokal' })],
    finances: { transactions: [item('t1', 2000)] },
  };
  const remote = {
    id: 's1', name: 'Remotename', updatedAt: iso(1000),
    weapons: [item('w2', 1000, { name: 'Sandcaster remote' })],
    finances: { transactions: [item('t2', 1000)] },
  };
  const merged = SyncMerge._mergeShip(local, remote);
  assert.strictEqual(merged.name, 'Lokalname', 'Skalarfeld: lokal gewinnt');
  assert.deepStrictEqual(merged.weapons.map(w => w.id).sort(), ['w1', 'w2'], 'beide Waffen erhalten');
  assert.deepStrictEqual(merged.finances.transactions.map(t => t.id).sort(), ['t1', 't2']);
});

test('_mergeShip: geloeschtes Schiff -> ganzes (neueres) Objekt, keine Feld-Rekursion', () => {
  const localDeleted = { id: 's1', _deleted: true, updatedAt: iso(5000) };
  const remoteAlive  = { id: 's1', name: 'Noch da', updatedAt: iso(4000), weapons: [item('w', 4000)] };
  const merged = SyncMerge._mergeShip(localDeleted, remoteAlive);
  assert.strictEqual(merged._deleted, true);
  assert.strictEqual(merged.weapons, undefined, 'kein Feld-Merge bei Loeschung');
});

// ── mergeCharacter: End-to-End ueber alle Array-Felder ────────────────────────
//
// mergeSpec kommt seit Multi-System Phase 2f als Parameter rein (statt hier
// selbst z.B. per SystemRegistry nachzuschlagen) - sync-merge.js bleibt
// dadurch reines Plain-JS ohne Browser-Globals, siehe Datei-Kopfkommentar
// und den Vertrag in systems/mgt2/manifest.js. Die Tests bilden hier ein
// MGT2-aehnliches mergeSpec direkt nach.
const MGT2_SPEC = {
  arrays: { skills: 'name', training: true, 'career.terms': true, 'career.keyEvents': true },
  ships: true,
};

test('mergeCharacter: Skalarfelder aus local, Skills per name gemerged', () => {
  const local  = { id: 'c', metadata: { name: 'LokalName' }, skills: [{ name: 'Pilot', level: 2, updatedAt: iso(2000) }] };
  const remote = { id: 'c', metadata: { name: 'RemoteName' }, skills: [{ name: 'Gun', level: 1, updatedAt: iso(1000) }] };
  const merged = SyncMerge.mergeCharacter(local, remote, MGT2_SPEC);
  assert.strictEqual(merged.metadata.name, 'LokalName');
  assert.deepStrictEqual(merged.skills.map(s => s.name).sort(), ['Gun', 'Pilot']);
});

test('mergeCharacter: ohne mergeSpec bleiben System-Arrays unangetastet (lokal gewinnt komplett, kein Array-Merge)', () => {
  // Der generische Kern kennt keine MGT2-Feldnamen mehr - ohne mergeSpec
  // verhaelt sich "skills" wie jedes andere unbekannte Top-Level-Feld: die
  // lokale Version gewinnt komplett (ueber den Skalarfeld-Spread), remote
  // wird NICHT hineingemergt. Kein Crash, kein Datenverlust auf der
  // lokalen Seite, aber auch keine Vereinigung.
  const local  = { id: 'c', metadata: { name: 'X' }, skills: [{ name: 'Pilot', level: 2 }] };
  const remote = { id: 'c', metadata: { name: 'Y' }, skills: [{ name: 'Gun', level: 1 }] };
  const merged = SyncMerge.mergeCharacter(local, remote);
  assert.deepStrictEqual(merged.skills, local.skills, 'skills = lokaler Rohzustand, kein Merge');
  assert.strictEqual('ships' in merged, false, 'ships taucht gar nicht erst auf, wenn keine Seite es hat');
});

test('mergeCharacter: mergeSpec.arrays mit gemeinsamem Praefix (career.terms + career.keyEvents) - keiner ueberschreibt den anderen', () => {
  // Regressionstest fuer die Materialisierungs-Falle: wuerde das
  // Zwischenobjekt "career" pro Pfad neu aus {...remote.career,
  // ...local.career} aufgebaut statt nur einmal pro Merge-Lauf, wuerde der
  // zweite Pfad (keyEvents) das bereits gemergte Ergebnis des ersten
  // (terms) mit dem unangetasteten lokalen Rohzustand ueberschreiben.
  const local = {
    id: 'c',
    career: {
      background: { appearance: 'Lokal' },
      terms:     [{ id: 't-local', updatedAt: iso(2000) }],
      keyEvents: [{ id: 'e-local', updatedAt: iso(2000) }],
    },
  };
  const remote = {
    id: 'c',
    career: {
      background: { appearance: 'Remote' },
      terms:     [{ id: 't-remote', updatedAt: iso(1000) }],
      keyEvents: [{ id: 'e-remote', updatedAt: iso(1000) }],
    },
  };
  const merged = SyncMerge.mergeCharacter(local, remote, MGT2_SPEC);
  assert.deepStrictEqual(merged.career.terms.map(t => t.id).sort(),     ['t-local', 't-remote']);
  assert.deepStrictEqual(merged.career.keyEvents.map(e => e.id).sort(), ['e-local', 'e-remote']);
  assert.strictEqual(merged.career.background.appearance, 'Lokal', 'Skalarfeld unter career bleibt local-gewinnt');
});

test('mergeCharacter: mergeSpec.arrays mit keyField true mergt nach "id" (training)', () => {
  const local  = { id: 'c', training: [{ id: 'tr1', skillName: 'Pilot', updatedAt: iso(2000) }] };
  const remote = { id: 'c', training: [{ id: 'tr2', skillName: 'Gunnery', updatedAt: iso(1000) }] };
  const merged = SyncMerge.mergeCharacter(local, remote, MGT2_SPEC);
  assert.deepStrictEqual(merged.training.map(t => t.id).sort(), ['tr1', 'tr2']);
});

// Multi-System Phase 4: erster echter Verwendungsfall fuer dotted paths
// UNTERHALB von systemData (Challenge-Fund T2) - das Universal-Template
// deklariert seine beiden Werte-Listen genau so.
const UNIVERSAL_SPEC = {
  arrays: { 'systemData.attributes': true, 'systemData.skills': true },
};

test('mergeCharacter: mergeSpec.arrays unterhalb von systemData (Universal-Template) mergt granular', () => {
  const local = {
    id: 'c', system: 'universal',
    systemData: {
      attributes: [{ id: 'a-local', name: 'Stärke', value: '12', updatedAt: iso(2000) }],
      skills:     [{ id: 's-local', name: 'Schwertkampf', value: '3', updatedAt: iso(2000) }],
    },
  };
  const remote = {
    id: 'c', system: 'universal',
    systemData: {
      attributes: [{ id: 'a-remote', name: 'Geschick', value: '10', updatedAt: iso(1000) }],
      skills:     [{ id: 's-local', name: 'Schwertkampf', value: '1', updatedAt: iso(1000) }],
    },
  };
  const merged = SyncMerge.mergeCharacter(local, remote, UNIVERSAL_SPEC);
  assert.deepStrictEqual(merged.systemData.attributes.map(a => a.id).sort(), ['a-local', 'a-remote'],
    'unterschiedliche Attribute beider Geraete bleiben beide erhalten');
  assert.strictEqual(merged.systemData.skills.length, 1);
  assert.strictEqual(merged.systemData.skills[0].value, '3',
    'gleiche Fertigkeit auf beiden Seiten -> zeitlich spaetere (lokale) Version gewinnt');
});

test('mergeCharacter: Notizen jeder Kategorie werden vereinigt', () => {
  const local = { id: 'c', notes: {
    sessions:  [item('s1', 2000)], persons: [item('p1', 2000)],
    locations: [], quests: [],
  }};
  const remote = { id: 'c', notes: {
    sessions:  [item('s2', 1000)], persons: [],
    locations: [item('l1', 1000)], quests: [item('q1', 1000)],
  }};
  const merged = SyncMerge.mergeCharacter(local, remote);
  assert.deepStrictEqual(merged.notes.sessions.map(i => i.id).sort(), ['s1', 's2']);
  assert.deepStrictEqual(merged.notes.persons.map(i => i.id), ['p1']);
  assert.deepStrictEqual(merged.notes.locations.map(i => i.id), ['l1']);
  assert.deepStrictEqual(merged.notes.quests.map(i => i.id), ['q1']);
});

test('mergeCharacter: ein von einem Mitspieler geloeschter Eintrag bleibt geloescht', () => {
  // Regressionstest fuer den Kern der Sync-Bugs: fremde Loeschung darf durch
  // den eigenen Merge nicht wiederbelebt werden.
  const local  = { id: 'c', notes: { sessions: [item('s1', 1000, { title: 'alt' })], persons: [], locations: [], quests: [] } };
  const remote = { id: 'c', notes: { sessions: [item('s1', 2000, { _deleted: true, deletedAt: iso(2000) })], persons: [], locations: [], quests: [] } };
  const merged = SyncMerge.mergeCharacter(local, remote);
  assert.strictEqual(merged.notes.sessions[0]._deleted, true);
});

test('mergeCharacter: fehlende Teil-Objekte (leerer Remote-Stand) werfen nicht', () => {
  const local = { id: 'c', metadata: { name: 'X' }, ships: [{ id: 's', updatedAt: iso(1) }] };
  const merged = SyncMerge.mergeCharacter(local, {}, MGT2_SPEC);
  assert.strictEqual(merged.metadata.name, 'X');
  assert.deepStrictEqual(merged.ships.map(s => s.id), ['s']);
  assert.ok(Array.isArray(merged.notes.sessions));
});
