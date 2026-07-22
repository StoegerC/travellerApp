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
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
// Wiederverwendung des clientseitigen Merge-Moduls (mergeArray/_mergeShips/
// purgeTombstones) fuer den Kampagnen-Merge weiter unten - die Datei ist
// bewusst plain-JS ohne Browser-Globals gehalten, siehe deren eigener
// module.exports-Guard.
const SyncMerge = require('../frontend/js/sync-merge.js');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'traveller.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Phase 2: hochgeladene Bilder liegen hier unter ihrer files.id als Dateiname
// (keine Extension noetig, mimetype kommt beim Ausliefern aus der DB-Zeile).
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  -- owner_id: vorbereitet für Phase 3 (Nutzerverwaltung/Login), aktuell noch
  -- ungenutzt und nullable. Erst wenn echte User-Accounts existieren, füllen
  -- Routen dieses Feld und Leseabfragen filtern danach.
  -- system: wie name aus dem JSON-Blob extrahiert (Multi-System Phase 3) –
  -- reiner String-Kopiervorgang, der Server bleibt regelwerk-agnostisch,
  -- er versteht die Kennung nicht, liefert sie nur fuer die Cloud-Charakter-
  -- liste des Frontends mit.
  CREATE TABLE IF NOT EXISTS characters (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL DEFAULT '',
    system     TEXT NOT NULL DEFAULT '',
    owner_id   TEXT,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- system: einmalig beim Erstellen vom Gruendungscharakter uebernommen
  -- (Multi-System Phase 5) und danach unveraenderlich - eine Kampagne lebt
  -- immer in genau einem Regelsystem, Beitritt nur mit passendem Charakter
  -- (siehe PUT /campaign/:id/join). Leerer String bei Bestandskampagnen vor
  -- dieser Phase (Unbekannt-Wert, kein Migrationszwang).
  CREATE TABLE IF NOT EXISTS campaigns (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    owner_id     TEXT NOT NULL,
    system       TEXT NOT NULL DEFAULT '',
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

  -- Nutzerverwaltung (Phase 3). roles: JSON-Array additiver Zusatzrechte
  -- ("gm", "admin") auf einer gemeinsamen Basis - jeder eingeloggte Nutzer
  -- darf eigene Charaktere/Kampagnen anlegen, unabhaengig von roles.
  -- password_hash haelt seit der Sicherheitshaertung immer einen Hash: bei
  -- Neuanlage/Reset den des einmaligen Setup-Tokens (must_change_password=1),
  -- danach den des selbst gesetzten Passworts. Vorher war das Feld NULL und
  -- der erste Login setzte das Passwort einfach - wer die E-Mail kannte und
  -- schneller war als der eigentliche Nutzer, uebernahm das Konto.
  CREATE TABLE IF NOT EXISTS users (
    id                   TEXT PRIMARY KEY,
    email                TEXT UNIQUE NOT NULL,
    password_hash        TEXT,
    roles                TEXT NOT NULL DEFAULT '[]',
    created_at           TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0
  );

  -- Mehrere gleichzeitige Sessions pro Nutzer (mehrere Geraete), im Gegensatz
  -- zu JWT jederzeit serverseitig widerrufbar (z.B. bei Passwort-Reset).
  CREATE TABLE IF NOT EXISTS sessions (
    token        TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
`);

// Nachrüst-Migrationen: CREATE TABLE IF NOT EXISTS legt fehlende Spalten auf
// einer bereits existierenden DB-Datei nicht nachträglich an.
function _addColumnIfMissing(table, column, definition) {
  const exists = db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
_addColumnIfMissing('characters', 'owner_id', 'TEXT');
_addColumnIfMissing('characters', 'system', "TEXT NOT NULL DEFAULT ''");
_addColumnIfMissing('campaigns', 'system', "TEXT NOT NULL DEFAULT ''");
// Bestandsnutzer, die zum Zeitpunkt der Haertung noch gar kein Passwort haben
// (password_hash IS NULL), bekommen weiter unten in ensurePasswordSetForAll()
// einen Setup-Token - sie duerfen nicht einfach als "fertig eingerichtet"
// durchrutschen, sonst bliebe genau das Uebernahme-Fenster offen.
_addColumnIfMissing('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');

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

const stmtGetChar    = db.prepare('SELECT data, updated_at, owner_id FROM characters WHERE id = ?');
const stmtGetCharName = db.prepare('SELECT name FROM characters WHERE id = ?');
const stmtListChars  = db.prepare('SELECT id, name, system, owner_id FROM characters ORDER BY name');
const stmtUpsertChar = db.prepare(`
  INSERT INTO characters (id, name, system, data, updated_at, owner_id) VALUES (@id, @name, @system, @data, @updatedAt, @ownerId)
  ON CONFLICT(id) DO UPDATE SET name = @name, system = @system, data = @data, updated_at = @updatedAt
`);
const stmtDeleteChar = db.prepare('DELETE FROM characters WHERE id = ?');
const stmtDeleteCharFiles = db.prepare("DELETE FROM files WHERE owner_type = 'character' AND owner_id = ?");

// Rückgabe { data, updatedAt, ownerId } statt nur des Blobs, damit die Route
// den X-Updated-At-Header setzen und Owner-Pruefungen (Phase 3) durchfuehren
// kann (Basis auch der optimistischen Sperre beim Push).
function getCharacter(id) {
  const row = stmtGetChar.get(id);
  return row ? { data: row.data, updatedAt: row.updated_at, ownerId: row.owner_id } : null;
}

// Leichtgewichtiger Name-Lookup (nur die name-Spalte, nicht der data-Blob) –
// fuer die Anreicherung der Kampagnen-Mitgliederliste in routes/campaigns.js.
function getCharacterName(id) {
  return stmtGetCharName.get(id)?.name || '';
}

// Analog zu getCharacterName: Multi-System Phase 5, damit routes/campaigns.js
// beim Erstellen/Beitreten pruefen kann, ob ein Charakter zum System der
// Kampagne passt, ohne den kompletten data-Blob zu parsen.
const stmtGetCharSystem = db.prepare('SELECT system FROM characters WHERE id = ?');
function getCharacterSystem(id) {
  return stmtGetCharSystem.get(id)?.system || '';
}

// Phase 3: ownerId wird von der Route mitgegeben (aus req.user.roles-Pruefung
// heraus), nicht vom Client. listCharacters() liefert bewusst alle inkl.
// ownerId zurueck - Filterung nach "eigene" vs. "alle" (gm-Flag) passiert in
// der Route, db.js bleibt hier neutral.
function listCharacters() {
  return stmtListChars.all().map(r => ({ id: r.id, name: r.name, system: r.system, ownerId: r.owner_id }));
}

// expectedUpdatedAt: opaker String, wie ihn der Client zuletzt vom Server
// gesehen hat (siehe Character._syncMeta.updatedAt im Frontend). Weicht er
// vom aktuell gespeicherten Stand ab, wird NICHT geschrieben, sondern der
// aktuelle Serverstand zum Mergen zurückgegeben — reiner String-Vergleich,
// kein Datums-Parsing, der Server bleibt strukturunwissend.
// ownerId: nur bei Neuanlage relevant (Charakter existiert noch nicht) - bei
// bereits vorhandenen Charakteren bleibt der urspruengliche Owner unveraendert,
// diese Funktion setzt ihn nie nachtraeglich um (das ist eine Route-Aufgabe,
// falls jemals gebraucht, hier bewusst nicht vorgesehen).
function putCharacter(id, jsonBody, expectedUpdatedAt = null, ownerId = null) {
  return transaction(() => {
    const row = stmtGetChar.get(id);
    if (row && expectedUpdatedAt != null && row.updated_at !== expectedUpdatedAt) {
      return { ok: false, conflict: true, data: row.data, updatedAt: row.updated_at };
    }
    let name = '', system = '';
    try {
      const parsed = JSON.parse(jsonBody);
      name   = parsed?.metadata?.name || '';
      system = parsed?.system || '';
    } catch { /* keep empty */ }
    const updatedAt = new Date().toISOString();
    const finalOwnerId = row ? row.owner_id : ownerId;
    stmtUpsertChar.run({ id, name, system, data: jsonBody, updatedAt, ownerId: finalOwnerId });
    return { ok: true, updatedAt, ownerId: finalOwnerId };
  });
}

// Nur für die einmalige Phase-3-Migration (backend/create-admin.js
// --claim-existing): weist einem noch besitzerlosen Bestandscharakter einen
// Owner zu. Schreibt bewusst NICHT, falls schon ein Owner gesetzt ist (kein
// versehentliches Umbiegen bestehender Zuordnungen).
const stmtClaimUnownedCharacter = db.prepare('UPDATE characters SET owner_id = ? WHERE id = ? AND owner_id IS NULL');
function claimUnownedCharacter(id, ownerId) {
  return stmtClaimUnownedCharacter.run(ownerId, id).changes > 0;
}

function deleteCharacter(id) {
  _unlinkFilesForOwner('character', id);
  transaction(() => {
    stmtDeleteChar.run(id);
    stmtDeleteCharFiles.run(id);
  });
}

// ── Kampagnen ─────────────────────────────────────────────────────────────

const stmtGetCampaign    = db.prepare('SELECT data FROM campaigns WHERE id = ?');
// system mit in der offenen Liste (Multi-System Phase 5): der Client filtert/
// grault damit im Beitritts-Dialog Kampagnen eines anderen Systems, ohne dafuer
// die (mitgliedsgeschuetzten) Einzel-Kampagnen erst laden zu muessen.
const stmtListCampaigns  = db.prepare('SELECT id, name, system, member_count AS memberCount FROM campaigns ORDER BY name');
const stmtInsertCampaign = db.prepare(`
  INSERT INTO campaigns (id, name, owner_id, system, data, member_count, created_at, updated_at)
  VALUES (@id, @name, @ownerId, @system, @data, @memberCount, @createdAt, @updatedAt)
`);
const stmtUpdateCampaign = db.prepare(`
  UPDATE campaigns SET name = @name, owner_id = @ownerId, data = @data, member_count = @memberCount, updated_at = @updatedAt
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

// Fuer den 304-Poll-Token in routes/campaigns.js: nur die updated_at-Spalte,
// ohne den (potenziell grossen) data-Blob zu parsen.
const stmtGetCampaignUpdatedAt = db.prepare('SELECT updated_at FROM campaigns WHERE id = ?');
function getCampaignUpdatedAt(id) {
  return stmtGetCampaignUpdatedAt.get(id)?.updated_at || null;
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
    system: campaign.system || '',
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
      // owner_id-Spalte wurde bisher hier nie mitgeschrieben - nur die
      // eigentliche Zugriffskontrolle in routes/campaigns.js las/schrieb
      // campaign.ownerId im JSON-Blob. Dadurch driftete die SQL-Spalte
      // (nur bei INSERT/upsertCampaign gesetzt) von der tatsaechlichen
      // Owner-Zuordnung ab, sobald z.B. create-admin.js --claim-existing
      // sie per updateCampaign() umgestellt hat - sichtbar u.a. in der
      // Admin-Speicherübersicht (getAdminOverview liest die SQL-Spalte).
      ownerId: campaign.ownerId,
      data: JSON.stringify(campaign),
      memberCount: (campaign.members || []).length,
      updatedAt: new Date().toISOString(),
    });
    return campaign;
  });
}

function deleteCampaign(id) {
  _unlinkFilesForOwner('campaign', id);
  transaction(() => {
    stmtDeleteCampaign.run(id);
    stmtDeleteCampaignFiles.run(id);
  });
}

// Atomarer Merge statt last-write-wins: laeuft in derselben Transaktion wie
// updateCampaign() selbst, dadurch gibt es kein Lesen-dann-Schreiben-Race
// zwischen zwei Spielern mehr (siehe Plan "Kampagnen-Sync: Server-seitiger
// atomarer Merge"). entries = { sessions, persons, locations, quests }, je
// nur die eigenen (isCampaign-geflaggten) Eintraege des pushenden Charakters.
function updateCampaignNotes(id, entries) {
  return updateCampaign(id, campaign => {
    campaign.notes = campaign.notes || { sessions: [], persons: [], locations: [], quests: [] };
    for (const tab of ['sessions', 'persons', 'locations', 'quests']) {
      campaign.notes[tab] = SyncMerge._mergeArrayField(entries[tab] || [], campaign.notes[tab] || []);
    }
  });
}

// ships = die eigenen (isCampaign-geflaggten) Schiffe des pushenden Charakters.
// crewRoles-Sonderbehandlung zuerst (fremde Eintraege behalten, nur den
// eigenen ueberschreiben), weil SyncMerge._mergeShip crewRoles sonst wie ein
// gewoehnliches Skalarfeld behandelt und komplett durch die lokale Version
// ersetzen wuerde - identisch zur bisherigen Frontend-Logik, nur jetzt
// innerhalb der Transaktion statt in einem separaten Push-Schritt.
function updateCampaignShips(id, charId, ships) {
  return updateCampaign(id, campaign => {
    campaign.ships = campaign.ships || [];
    const myShips = ships.map(({ image, ...rest }) => rest).map(s => {
      const remote = campaign.ships.find(r => r.id === s.id);
      if (!remote?.crewRoles) return s;
      return { ...s, crewRoles: { ...remote.crewRoles, ...(s.crewRoles?.[charId] ? { [charId]: s.crewRoles[charId] } : {}) } };
    });
    campaign.ships = SyncMerge._mergeShips(myShips, campaign.ships);
  });
}

// Generisches Kampagnen-Erweiterungs-API (Multi-System Phase 5,
// Challenge-Fund T3): derselbe Array-Merge wie updateCampaignNotes, aber
// unter einem vom Regelsystem frei waehlbaren Schluessel statt einer
// eigenen Route + Merge-Logik pro System-Erweiterung. Ein neues System mit
// geteilten Kampagnen-Inhalten (z.B. gemeinsame Beweisstuecke) braucht
// dafuer keine Backend-Aenderung mehr. MGT2s Schiffe bleiben aus
// Bestandsschutz-Gruenden auf ihrer eigenen Route (updateCampaignShips
// oben) mit ihrer crewRoles-Sonderbehandlung. entries = die eigenen
// Eintraege des pushenden Geraets, mergefaehig wie ueberall sonst
// (id/updatedAt, Loeschung per Tombstone statt splice).
function updateCampaignExt(id, key, entries) {
  return updateCampaign(id, campaign => {
    campaign.ext = campaign.ext || {};
    campaign.ext[key] = SyncMerge._mergeArrayField(entries || [], campaign.ext[key] || []);
  });
}

// ── Dateien (Phase 2) ───────────────────────────────────────────────────────

const stmtInsertFile = db.prepare(`
  INSERT INTO files (id, owner_type, owner_id, field, ref_id, filename, mimetype, size, uploader, uploaded_at)
  VALUES (@id, @ownerType, @ownerId, @field, @refId, @filename, @mimetype, @size, @uploader, @uploadedAt)
`);
const stmtGetFile          = db.prepare('SELECT * FROM files WHERE id = ?');
const stmtDeleteFile       = db.prepare('DELETE FROM files WHERE id = ?');
const stmtListFilesByOwner = db.prepare('SELECT * FROM files WHERE owner_type = ? AND owner_id = ?');
const stmtListAllFiles     = db.prepare('SELECT * FROM files');

function insertFile({ id, ownerType, ownerId, field, refId, filename, mimetype, size, uploader }) {
  const uploadedAt = new Date().toISOString();
  stmtInsertFile.run({
    id, ownerType, ownerId,
    field: field || null, refId: refId || null,
    filename, mimetype, size,
    uploader: uploader || null,
    uploadedAt,
  });
  return { id, ownerType, ownerId, field, refId, filename, mimetype, size, uploadedAt };
}

function getFile(id) {
  const row = stmtGetFile.get(id);
  if (!row) return null;
  return { id: row.id, ownerType: row.owner_type, ownerId: row.owner_id, field: row.field,
           refId: row.ref_id, filename: row.filename, mimetype: row.mimetype, size: row.size,
           uploadedAt: row.uploaded_at };
}

function deleteFile(id) {
  stmtDeleteFile.run(id);
}

function listFilesByOwner(ownerType, ownerId) {
  return stmtListFilesByOwner.all(ownerType, ownerId).map(row => ({ id: row.id }));
}

// Fuer den Admin-Scan nach verwaisten Mediendateien (siehe orphan-scan.js) -
// im Unterschied zu listFilesByOwner() ohne Owner-Filter, mit allen Feldern.
function listAllFiles() {
  return stmtListAllFiles.all().map(row => ({
    id: row.id, ownerType: row.owner_type, ownerId: row.owner_id, field: row.field,
    refId: row.ref_id, filename: row.filename, mimetype: row.mimetype, size: row.size,
    uploadedAt: row.uploaded_at,
  }));
}

const stmtFileStats = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS totalSize FROM files');
function getFileStats() {
  const row = stmtFileStats.get();
  return { count: row.count, totalSize: row.totalSize };
}

// Admin-Übersicht: wer besitzt welche Charaktere/Kampagnen und wie viel
// Speicher (Charakter-JSON vs. Medien) belegt das. LENGTH(CAST(x AS BLOB))
// statt LENGTH(x), weil SQLite bei TEXT sonst Zeichen statt Bytes zählt -
// bei Umlauten/ß in Notizen wäre die Byte-Größe sonst zu niedrig.
const stmtCharsForAdmin = db.prepare(
  'SELECT id, name, owner_id AS ownerId, LENGTH(CAST(data AS BLOB)) AS bytes FROM characters'
);
const stmtCampaignsForAdmin = db.prepare(
  'SELECT id, name, owner_id AS ownerId, LENGTH(CAST(data AS BLOB)) AS bytes FROM campaigns'
);
const stmtFileBytesByOwner = db.prepare(
  'SELECT owner_type AS ownerType, owner_id AS ownerId, COALESCE(SUM(size), 0) AS bytes FROM files GROUP BY owner_type, owner_id'
);

function getAdminOverview() {
  const users      = listUsers();
  const characters = stmtCharsForAdmin.all();
  const campaigns  = stmtCampaignsForAdmin.all();

  const knownUserIds = new Set(users.map(u => u.id));

  // Dateien hängen an Charakter/Kampagne, nicht direkt am Nutzer - hier über
  // die jeweilige owner_id auf den Nutzer aufgelöst. Zeigt owner_id auf
  // keinen (mehr) existierenden Nutzer (z.B. nach admin/users/:id DELETE),
  // zaehlt das als verwaist statt an eine tote Nutzer-ID verloren zu gehen.
  const charOwnerById = new Map(characters.map(c => [c.id, c.ownerId]));
  const campOwnerById = new Map(campaigns.map(c => [c.id, c.ownerId]));
  const mediaBytesByUser = new Map();
  let orphanedMediaBytes = 0;
  for (const g of stmtFileBytesByOwner.all()) {
    const userId = g.ownerType === 'character' ? charOwnerById.get(g.ownerId) : campOwnerById.get(g.ownerId);
    if (userId && knownUserIds.has(userId)) mediaBytesByUser.set(userId, (mediaBytesByUser.get(userId) || 0) + g.bytes);
    else orphanedMediaBytes += g.bytes;
  }
  const summarize = (chars, camps, mediaBytes) => ({
    characters: chars.map(c => ({ id: c.id, name: c.name, bytes: c.bytes })),
    campaigns:  camps.map(c => ({ id: c.id, name: c.name, bytes: c.bytes })),
    storage: {
      characterBytes: chars.reduce((s, c) => s + c.bytes, 0),
      mediaBytes,
    },
  });

  const userOverviews = users.map(u => summarize(
    characters.filter(c => c.ownerId === u.id),
    campaigns.filter(c => c.ownerId === u.id),
    mediaBytesByUser.get(u.id) || 0
  ));

  // Nutzer geloescht (siehe deleteUser) oder Charakter/Kampagne nie einem
  // Owner zugeordnet - trotzdem sichtbar machen statt stillschweigend zu
  // verstecken, sonst "verschwindet" belegter Speicherplatz aus der Ansicht.
  const orphanedOverview = summarize(
    characters.filter(c => !c.ownerId || !knownUserIds.has(c.ownerId)),
    campaigns.filter(c => !knownUserIds.has(c.ownerId)),
    orphanedMediaBytes
  );

  return {
    users: users.map((u, i) => ({ id: u.id, email: u.email, roles: u.roles, ...userOverviews[i] })),
    orphaned: orphanedOverview,
  };
}

// Loescht die tatsaechlichen Dateien von der Platte fuer alle files-Zeilen eines
// Owners - die DB-Zeilen selbst werden weiterhin per stmtDeleteCharFiles/
// stmtDeleteCampaignFiles in der aufrufenden delete*()-Funktion entfernt. Ohne
// diesen Schritt blieben die Dateien seit Anlage der files-Tabelle in Phase 1
// verwaist auf der Platte liegen (nur die DB-Zeile wurde geloescht).
function _unlinkFilesForOwner(ownerType, ownerId) {
  for (const f of listFilesByOwner(ownerType, ownerId)) {
    fs.unlink(path.join(UPLOAD_DIR, f.id), () => {}); // best effort, Datei evtl. schon weg
  }
}

// ── Nutzer & Sessions (Phase 3) ─────────────────────────────────────────────

const stmtInsertUser      = db.prepare(`
  INSERT INTO users (id, email, password_hash, roles, created_at, must_change_password)
  VALUES (@id, @email, @passwordHash, @roles, @createdAt, @mustChangePassword)
`);
const stmtGetUserByEmail  = db.prepare('SELECT * FROM users WHERE email = ?');
const stmtGetUserById     = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtListUsers       = db.prepare('SELECT * FROM users ORDER BY email');
const stmtSetPasswordHash = db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?');
const stmtSetUserRoles    = db.prepare('UPDATE users SET roles = ? WHERE id = ?');
const stmtDeleteUser      = db.prepare('DELETE FROM users WHERE id = ?');
const stmtCountAdmins     = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE EXISTS (
  SELECT 1 FROM json_each(users.roles) WHERE json_each.value = 'admin')`);

function _rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id, email: row.email, passwordHash: row.password_hash,
    roles: JSON.parse(row.roles), createdAt: row.created_at,
    hasPassword: row.password_hash != null,
    // true = das gespeicherte Passwort ist ein einmaliger Setup-Token, der
    // beim naechsten Login gegen ein selbst gewaehltes ersetzt werden muss.
    mustChangePassword: row.must_change_password === 1,
  };
}

// passwordHash ist der Hash des einmaligen Setup-Tokens (siehe routes/admin.js);
// mustChangePassword=true zwingt den Nutzer beim ersten Login zu einem eigenen.
function insertUser({ id, email, roles = [], passwordHash = null, mustChangePassword = true }) {
  const createdAt = new Date().toISOString();
  stmtInsertUser.run({
    id, email, passwordHash, roles: JSON.stringify(roles), createdAt,
    mustChangePassword: mustChangePassword ? 1 : 0,
  });
  return _rowToUser(stmtGetUserById.get(id));
}

function getUserByEmail(email) { return _rowToUser(stmtGetUserByEmail.get(email)); }
function getUserById(id)       { return _rowToUser(stmtGetUserById.get(id)); }
function listUsers()           { return stmtListUsers.all().map(_rowToUser); }

// Wieviele Nutzer haben das admin-Flag? Basis der Lockout-Sperre in
// routes/admin.js (letzten Administrator weder loeschen noch degradieren -
// sonst kaeme man nur noch per direktem DB-Zugriff wieder rein).
function countAdmins() { return stmtCountAdmins.get().n; }

function setPasswordHash(userId, hash, mustChangePassword = false) {
  stmtSetPasswordHash.run(hash, mustChangePassword ? 1 : 0, userId);
}
function setUserRoles(userId, roles)   { stmtSetUserRoles.run(JSON.stringify(roles), userId); }

// Bestandsnutzer ohne Passwort (Alt-Zustand "wird beim ersten Login gesetzt")
// haetten die Uebernahme-Luecke behalten. Der Aufrufer (server.js) vergibt
// ihnen einen Setup-Token und gibt ihn einmalig im Log aus.
const stmtUsersWithoutPassword = db.prepare('SELECT * FROM users WHERE password_hash IS NULL');
function listUsersWithoutPassword() { return stmtUsersWithoutPassword.all().map(_rowToUser); }

// Loescht den Nutzer + alle seine Sessions (erzwingt Logout auf allen
// Geraeten). Charaktere/Kampagnen mit diesem owner_id bleiben bestehen
// (bewusst kein Kaskaden-Loeschen, um keine Spieldaten versehentlich zu
// verlieren) - werden dadurch "herrenlos", genau wie es owner_id=NULL
// urspruenglich schon konnte.
function deleteUser(id) {
  transaction(() => {
    stmtDeleteUser.run(id);
    stmtDeleteSessionsForUser.run(id);
  });
}

// ── Sessions ─────────────────────────────────────────────────────────────

const stmtInsertSession         = db.prepare(`
  INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (@token, @userId, @createdAt, @createdAt)
`);
const stmtGetSession            = db.prepare('SELECT * FROM sessions WHERE token = ?');
const stmtTouchSession          = db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?');
const stmtDeleteSession         = db.prepare('DELETE FROM sessions WHERE token = ?');
const stmtDeleteSessionsForUser = db.prepare('DELETE FROM sessions WHERE user_id = ?');
const stmtDeleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE last_seen_at < ?');

// last_seen_at wurde bisher zwar gepflegt, aber nie ausgewertet - ein einmal
// abgegriffener oder auf einem alten Geraet vergessener Token blieb fuer immer
// gueltig. Idle-Ablauf ueber SESSION_IDLE_DAYS (Default 90).
const SESSION_IDLE_DAYS = Number(process.env.SESSION_IDLE_DAYS) || 90;
const SESSION_IDLE_MS   = SESSION_IDLE_DAYS * 24 * 60 * 60 * 1000;

function _idleCutoffIso(now = Date.now()) {
  return new Date(now - SESSION_IDLE_MS).toISOString();
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  stmtInsertSession.run({ token, userId, createdAt });
  return token;
}

// Liefert den zur Session gehoerenden Nutzer (oder null bei ungueltigem/
// abgelaufenem Token) und aktualisiert last_seen_at nebenbei. Eine seit
// SESSION_IDLE_DAYS unbenutzte Session wird dabei geloescht statt nur
// abgelehnt - sonst sammeln sich tote Zeilen unbegrenzt an.
function getSessionUser(token) {
  const row = stmtGetSession.get(token);
  if (!row) return null;
  if (row.last_seen_at < _idleCutoffIso()) {
    stmtDeleteSession.run(token);
    return null;
  }
  stmtTouchSession.run(new Date().toISOString(), token);
  return getUserById(row.user_id);
}

// Beim Serverstart aufgerufen (server.js): raeumt Sessions weg, die waehrend
// einer Ausfallzeit abgelaufen sind. Rueckgabe = Anzahl geloeschter Zeilen.
function deleteExpiredSessions() {
  return stmtDeleteExpiredSessions.run(_idleCutoffIso()).changes;
}

function deleteSession(token)            { stmtDeleteSession.run(token); }
function invalidateUserSessions(userId)  { stmtDeleteSessionsForUser.run(userId); }

// ── Speicher-Quota (pro Nutzer) ─────────────────────────────────────────────

// Summe aus Charakter-JSON + Kampagnen-JSON + hochgeladenen Medien eines
// Nutzers. Dieselbe Auflösungs-Logik wie getAdminOverview() (Dateien haengen
// an Charakter/Kampagne, nicht direkt am Nutzer), nur auf einen Nutzer
// beschraenkt und ohne die Namens-/Detailauflistung.
const stmtUserCharBytes = db.prepare(
  'SELECT COALESCE(SUM(LENGTH(CAST(data AS BLOB))), 0) AS bytes FROM characters WHERE owner_id = ?'
);
const stmtUserCampBytes = db.prepare(
  'SELECT COALESCE(SUM(LENGTH(CAST(data AS BLOB))), 0) AS bytes FROM campaigns WHERE owner_id = ?'
);
const stmtUserMediaBytes = db.prepare(`
  SELECT COALESCE(SUM(f.size), 0) AS bytes FROM files f
  WHERE (f.owner_type = 'character' AND f.owner_id IN (SELECT id FROM characters WHERE owner_id = @userId))
     OR (f.owner_type = 'campaign'  AND f.owner_id IN (SELECT id FROM campaigns  WHERE owner_id = @userId))
`);

// excludeCharId: beim Ueberschreiben eines bestehenden Charakters zaehlt
// dessen aktueller Stand nicht mit, sonst wuerde ein reines Speichern ohne
// Groessenzuwachs faelschlich am Limit scheitern.
function getUserUsageBytes(userId, { excludeCharId = null } = {}) {
  let charBytes = stmtUserCharBytes.get(userId).bytes;
  if (excludeCharId) {
    const row = stmtGetChar.get(excludeCharId);
    if (row && row.owner_id === userId) charBytes -= Buffer.byteLength(row.data, 'utf8');
  }
  return charBytes + stmtUserCampBytes.get(userId).bytes + stmtUserMediaBytes.get({ userId }).bytes;
}

module.exports = {
  db,
  UPLOAD_DIR,
  getCharacter, getCharacterName, getCharacterSystem, listCharacters, putCharacter, deleteCharacter, claimUnownedCharacter,
  getCampaign, getCampaignUpdatedAt, listCampaigns, campaignExists, insertCampaign, updateCampaign, deleteCampaign,
  updateCampaignNotes, updateCampaignShips, updateCampaignExt,
  upsertCampaign,
  insertFile, getFile, deleteFile, listFilesByOwner, listAllFiles, getFileStats, getAdminOverview,
  insertUser, getUserByEmail, getUserById, listUsers, setPasswordHash, setUserRoles, deleteUser,
  countAdmins, listUsersWithoutPassword,
  createSession, getSessionUser, deleteSession, invalidateUserSessions, deleteExpiredSessions,
  getUserUsageBytes,
};
