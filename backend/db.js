/**
 * SQLite-Anbindung – ersetzt Cloudflare KV.
 * Charakter-/Kampagnen-Daten bleiben opake JSON-Blobs (wie bisher in KV),
 * damit das Backend die Struktur des Frontends nicht kennen muss.
 *
 * Nutzt das eingebaute node:sqlite (Node 22.5+/24+, hier ab Node 26 stabil)
 * statt better-sqlite3 – kein natives Compile nötig (better-sqlite3s
 * Bundled-Addon baute auf dieser Node-Version nicht, siehe Build-Fehler
 * gegen die V8-API). Das ist auch für den späteren Raspberry-Pi-Einsatz
 * ein Vorteil: keine node-gyp/build-essential-Abhängigkeit dort nötig.
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'traveller.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  -- owner_id: vorbereitet für Phase 3 (Nutzerverwaltung/Login), aktuell noch
  -- ungenutzt und nullable. Erst wenn echte User-Accounts existieren, füllen
  -- Routen dieses Feld und Leseabfragen filtern danach.
  CREATE TABLE IF NOT EXISTS characters (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    owner_id   TEXT,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    owner_id     TEXT NOT NULL,
    data         TEXT NOT NULL,
    member_count INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  -- Datei-Uploads (Phase 2) – Tabelle existiert bereits ab Phase 1, damit später
  -- keine Schema-Migration auf einer laufenden Installation nötig ist.
  CREATE TABLE IF NOT EXISTS files (
    id          TEXT PRIMARY KEY,
    owner_type  TEXT NOT NULL CHECK (owner_type IN ('character','campaign')),
    owner_id    TEXT NOT NULL,
    field       TEXT,
    ref_id      TEXT,
    filename    TEXT NOT NULL,
    mimetype    TEXT NOT NULL,
    size        INTEGER NOT NULL,
    uploader    TEXT,
    uploaded_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_files_owner ON files (owner_type, owner_id);
`);

// Nachrüst-Migration: falls eine ältere DB-Datei ohne owner_id existiert
// (CREATE TABLE IF NOT EXISTS legt die Spalte dann nicht nachträglich an).
const hasOwnerId = db.prepare("SELECT 1 FROM pragma_table_info('characters') WHERE name = 'owner_id'").get();
if (!hasOwnerId) {
  db.exec('ALTER TABLE characters ADD COLUMN owner_id TEXT');
}

// node:sqlite kennt kein db.transaction(fn) wie better-sqlite3 – manuell mit
// BEGIN/COMMIT/ROLLBACK nachgebaut.
function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ── Charaktere ────────────────────────────────────────────────────────────

const stmtGetChar    = db.prepare('SELECT data, updated_at FROM characters WHERE id = ?');
const stmtListChars  = db.prepare('SELECT id, name FROM characters ORDER BY name');
const stmtUpsertChar = db.prepare(`
  INSERT INTO characters (id, name, data, updated_at) VALUES (@id, @name, @data, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET name = @name, data = @data, updated_at = @updatedAt
`);
const stmtDeleteChar = db.prepare('DELETE FROM characters WHERE id = ?');
const stmtDeleteCharFiles = db.prepare("DELETE FROM files WHERE owner_type = 'character' AND owner_id = ?");

// Rückgabe { data, updatedAt } statt nur des Blobs, damit die Route den
// X-Updated-At-Header setzen kann (Basis der optimistischen Sperre beim Push).
function getCharacter(id) {
  const row = stmtGetChar.get(id);
  return row ? { data: row.data, updatedAt: row.updated_at } : null;
}

function listCharacters() {
  return stmtListChars.all();
}

// expectedUpdatedAt: opaker String, wie ihn der Client zuletzt vom Server
// gesehen hat (siehe Character._syncMeta.updatedAt im Frontend). Weicht er
// vom aktuell gespeicherten Stand ab, wird NICHT geschrieben, sondern der
// aktuelle Serverstand zum Mergen zurückgegeben — reiner String-Vergleich,
// kein Datums-Parsing, der Server bleibt strukturunwissend.
function putCharacter(id, jsonBody, expectedUpdatedAt = null) {
  return transaction(() => {
    const row = stmtGetChar.get(id);
    if (row && expectedUpdatedAt != null && row.updated_at !== expectedUpdatedAt) {
      return { ok: false, conflict: true, data: row.data, updatedAt: row.updated_at };
    }
    let name = '';
    try { name = JSON.parse(jsonBody)?.metadata?.name || ''; } catch { /* keep empty */ }
    const updatedAt = new Date().toISOString();
    stmtUpsertChar.run({ id, name, data: jsonBody, updatedAt });
    return { ok: true, updatedAt };
  });
}

function deleteCharacter(id) {
  transaction(() => {
    stmtDeleteChar.run(id);
    stmtDeleteCharFiles.run(id);
  });
}

// ── Kampagnen ─────────────────────────────────────────────────────────────

const stmtGetCampaign    = db.prepare('SELECT data FROM campaigns WHERE id = ?');
const stmtListCampaigns  = db.prepare('SELECT id, name, member_count AS memberCount FROM campaigns ORDER BY name');
const stmtInsertCampaign = db.prepare(`
  INSERT INTO campaigns (id, name, owner_id, data, member_count, created_at, updated_at)
  VALUES (@id, @name, @ownerId, @data, @memberCount, @createdAt, @updatedAt)
`);
const stmtUpdateCampaign = db.prepare(`
  UPDATE campaigns SET name = @name, data = @data, member_count = @memberCount, updated_at = @updatedAt
  WHERE id = @id
`);
const stmtDeleteCampaign = db.prepare('DELETE FROM campaigns WHERE id = ?');
const stmtDeleteCampaignFiles = db.prepare("DELETE FROM files WHERE owner_type = 'campaign' AND owner_id = ?");

const stmtUpsertCampaign = db.prepare(`
  INSERT INTO campaigns (id, name, owner_id, data, member_count, created_at, updated_at)
  VALUES (@id, @name, @ownerId, @data, @memberCount, @createdAt, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    name = @name, owner_id = @ownerId, data = @data,
    member_count = @memberCount, updated_at = @updatedAt
`);

function getCampaign(id) {
  const row = stmtGetCampaign.get(id);
  return row ? JSON.parse(row.data) : null;
}

function listCampaigns() {
  return stmtListCampaigns.all();
}

// Für die einmalige KV-Migration: schreibt ein komplettes, bereits fertiges
// Kampagnen-Objekt (wie es aus dem alten Worker kommt) idempotent rein.
function upsertCampaign(campaign) {
  const now = new Date().toISOString();
  stmtUpsertCampaign.run({
    id: campaign.id,
    name: campaign.name,
    ownerId: campaign.ownerId,
    data: JSON.stringify(campaign),
    memberCount: (campaign.members || []).length,
    createdAt: campaign.createdAt || now,
    updatedAt: now,
  });
}

function campaignExists(id) {
  return !!stmtGetCampaign.get(id);
}

function insertCampaign(campaign) {
  const now = new Date().toISOString();
  stmtInsertCampaign.run({
    id: campaign.id,
    name: campaign.name,
    ownerId: campaign.ownerId,
    data: JSON.stringify(campaign),
    memberCount: campaign.members.length,
    createdAt: now,
    updatedAt: now,
  });
}

// Read-modify-write innerhalb einer Transaktion, um Races (z.B. gleichzeitiges
// Beitreten zweier Spieler) auszuschließen. mutateFn bekommt das aktuelle
// Kampagnen-Objekt und mutiert es in-place; Rückgabewert wird gespeichert.
function updateCampaign(id, mutateFn) {
  return transaction(() => {
    const row = stmtGetCampaign.get(id);
    if (!row) return null;
    const campaign = JSON.parse(row.data);
    mutateFn(campaign);
    stmtUpdateCampaign.run({
      id,
      name: campaign.name,
      data: JSON.stringify(campaign),
      memberCount: (campaign.members || []).length,
      updatedAt: new Date().toISOString(),
    });
    return campaign;
  });
}

function deleteCampaign(id) {
  transaction(() => {
    stmtDeleteCampaign.run(id);
    stmtDeleteCampaignFiles.run(id);
  });
}

module.exports = {
  db,
  getCharacter, listCharacters, putCharacter, deleteCharacter,
  getCampaign, listCampaigns, campaignExists, insertCampaign, updateCampaign, deleteCampaign,
  upsertCampaign,
};
