/**
 * Kampagnen-Endpunkte – 1:1-Nachbau der bisherigen Cloudflare-Worker-Routen,
 * damit frontend/js/campaign.js unverändert bleibt.
 *
 * Mutationen laufen über db.updateCampaign(id, mutateFn) und damit innerhalb
 * einer SQLite-Transaktion (Read-Modify-Write) – das behebt die Race-Lücke,
 * die KVs nicht-transaktionales get/put beim gleichzeitigen Beitreten zweier
 * Spieler hatte.
 *
 * Phase 3: ownerId/requesterId kommen nicht mehr aus dem Client-Body (dort
 * beliebig faelschbar), sondern aus req.user.id (checkAuth). Zusaetzlich wird
 * geprueft, dass ein per charId beigetretener/entfernter Charakter tatsaechlich
 * dem aufrufenden Nutzer gehoert.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { ownsCharacter, isCampaignMember } = require('../authz');

const router = express.Router();

function isValidCampaignId(id) {
  return /^[a-z0-9_-]{2,32}$/.test(id);
}

function isGm(user) { return user.roles.includes('gm'); }

// Beitritts-Code: bisher konnte JEDER authentifizierte Nutzer JEDER Kampagne
// beitreten (geprueft wurde nur, dass ihm der angegebene Charakter gehoert) und
// danach deren Notizen, Schiffe und Dateien schreiben. Die
// Mitgliedschaftspruefungen aus 3.4.1 liefen damit faktisch ins Leere, weil man
// sich die Mitgliedschaft selbst geben konnte. Der Code lebt im Kampagnen-Blob
// und ist nur fuer Mitglieder lesbar (GET /campaign/:id ist mitgliedsgeschuetzt).
function generateJoinCode() {
  return crypto.randomBytes(6).toString('base64url');
}

// Zeitkonstanter Vergleich, damit der Code nicht zeichenweise erraten werden
// kann. Bei Laengenunterschied wirft timingSafeEqual, deshalb vorher pruefen -
// die Laenge ist ohnehin bekannt (immer generateJoinCode()-Format).
function joinCodeMatches(expected, provided) {
  const a = Buffer.from(String(expected ?? ''), 'utf8');
  const b = Buffer.from(String(provided ?? ''), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// GET /campaigns – Liste bleibt bewusst offen (nur id/name/memberCount, keine
// Inhalte) - noetig damit man einer Kampagne per ID/Name beitreten kann.
router.get('/campaigns', (req, res) => {
  res.json(db.listCampaigns());
});

// GET /campaign/:id – nur Mitglieder (oder gm-Flag)
router.get('/campaign/:id', (req, res) => {
  if (!isValidCampaignId(req.params.id)) return res.status(400).send('Invalid campaign ID');
  const campaign = db.getCampaign(req.params.id);
  if (!campaign) return res.status(404).send('Not Found');
  if (!isCampaignMember(db, campaign, req.user.id) && !isGm(req.user)) return res.status(403).send('Forbidden');
  res.json(campaign);
});

// POST /campaign/:id – erstellen (409 wenn bereits vorhanden). ownerId kommt
// aus der Session, nicht mehr aus dem Body. charId (der beitretende eigene
// Charakter) muss dem Aufrufer gehoeren. Der Beitritts-Code wird serverseitig
// erzeugt und dem Ersteller zurueckgegeben - er gibt ihn an seine Mitspieler weiter.
router.post('/campaign/:id', (req, res) => {
  const { id } = req.params;
  if (!isValidCampaignId(id)) return res.status(400).send('Invalid campaign ID');
  if (db.campaignExists(id)) return res.status(409).send('Campaign ID already taken');

  const { name, charId } = req.body || {};
  if (!charId) return res.status(400).send('Missing charId');
  if (!ownsCharacter(db, req.user.id, charId)) return res.status(403).send('Forbidden');

  const campaign = {
    id,
    name: name || id,
    ownerId: req.user.id,
    joinCode: generateJoinCode(),
    createdAt: new Date().toISOString(),
    members: [{ charId, joinedAt: new Date().toISOString() }],
    notes: { sessions: [], persons: [], locations: [], quests: [] },
    ships: [],
  };
  db.insertCampaign(campaign);
  res.json(campaign);
});

// GET /campaign/:id/ships – dieselbe Mitgliedschaftspruefung wie GET /campaign/:id
router.get('/campaign/:id/ships', (req, res) => {
  const campaign = db.getCampaign(req.params.id);
  if (!campaign) return res.status(404).send('Not Found');
  if (!isCampaignMember(db, campaign, req.user.id) && !isGm(req.user)) return res.status(403).send('Forbidden');
  res.json(campaign.ships || []);
});

// PUT /campaign/:id/ships – atomarer Merge statt last-write-wins, siehe
// db.updateCampaignShips (Bilder werden dort weiterhin defensiv gestrippt).
// Zwei getrennte Pruefungen: ownsCharacter (der angegebene charId gehoert
// wirklich dem Aufrufer - wichtig fuer die crewRoles-Zuordnung in db.js) UND
// isCampaignMember (der Aufrufer darf ueberhaupt in DIESE Kampagne schreiben -
// fehlte bisher komplett, siehe CHANGELOG "Kampagnen-Autorisierungsluecke").
router.put('/campaign/:id/ships', (req, res) => {
  const { charId, ships } = req.body || {};
  if (!charId || !Array.isArray(ships)) return res.status(400).send('Invalid JSON');
  if (!ownsCharacter(db, req.user.id, charId)) return res.status(403).send('Forbidden');
  const existing = db.getCampaign(req.params.id);
  if (!existing) return res.status(404).send('Not Found');
  if (!isCampaignMember(db, existing, req.user.id)) return res.status(403).send('Forbidden');
  const campaign = db.updateCampaignShips(req.params.id, charId, ships);
  res.json(campaign.ships);
});

// PUT /campaign/:id/notes – atomarer Merge statt last-write-wins, siehe
// db.updateCampaignNotes. Membership-Pruefung analog zu /ships oben - vorher
// konnte JEDER authentifizierte Nutzer in JEDE Kampagne schreiben, nicht nur
// Mitglieder (siehe CHANGELOG "Kampagnen-Autorisierungsluecke").
router.put('/campaign/:id/notes', (req, res) => {
  const { entries } = req.body || {};
  if (!entries || typeof entries !== 'object') return res.status(400).send('Invalid JSON');
  const existing = db.getCampaign(req.params.id);
  if (!existing) return res.status(404).send('Not Found');
  if (!isCampaignMember(db, existing, req.user.id)) return res.status(403).send('Forbidden');
  const campaign = db.updateCampaignNotes(req.params.id, entries);
  res.json(campaign.notes);
});

// PUT /campaign/:id/join – nur mit eigenem Charakter UND gueltigem
// Beitritts-Code. Wer bereits Mitglied ist (z.B. weitere Charaktere derselben
// Person) oder die Kampagne besitzt, braucht den Code nicht erneut.
router.put('/campaign/:id/join', (req, res) => {
  const { charId, joinCode } = req.body || {};
  if (!charId) return res.status(400).send('Missing charId');
  if (!ownsCharacter(db, req.user.id, charId)) return res.status(403).send('Forbidden');

  const existing = db.getCampaign(req.params.id);
  if (!existing) return res.status(404).send('Not Found');

  const alreadyIn = isCampaignMember(db, existing, req.user.id);
  if (!alreadyIn && !joinCodeMatches(existing.joinCode, joinCode)) {
    return res.status(403).send('Falscher oder fehlender Beitritts-Code');
  }

  const campaign = db.updateCampaign(req.params.id, c => {
    if (!c.members.find(m => m.charId === charId)) {
      c.members.push({ charId, joinedAt: new Date().toISOString() });
    }
  });
  if (!campaign) return res.status(404).send('Not Found');
  res.status(200).send('OK');
});

// PUT /campaign/:id/leave – nur mit eigenem Charakter
router.put('/campaign/:id/leave', (req, res) => {
  const { charId } = req.body || {};
  if (!charId) return res.status(400).send('Missing charId');
  if (!ownsCharacter(db, req.user.id, charId)) return res.status(403).send('Forbidden');
  const campaign = db.updateCampaign(req.params.id, c => {
    c.members = c.members.filter(m => m.charId !== charId);
  });
  if (!campaign) return res.status(404).send('Not Found');
  res.status(200).send('OK');
});

// DELETE /campaign/:id/member/:charId – nur Owner
router.delete('/campaign/:id/member/:charId', (req, res) => {
  const current = db.getCampaign(req.params.id);
  if (!current) return res.status(404).send('Not Found');
  if (req.user.id !== current.ownerId) return res.status(403).send('Forbidden');
  db.updateCampaign(req.params.id, c => {
    c.members = c.members.filter(m => m.charId !== req.params.charId);
  });
  res.status(200).send('OK');
});

// DELETE /campaign/:id – nur Owner
router.delete('/campaign/:id', (req, res) => {
  const current = db.getCampaign(req.params.id);
  if (!current) return res.status(404).send('Not Found');
  if (req.user.id !== current.ownerId) return res.status(403).send('Forbidden');
  db.deleteCampaign(req.params.id);
  res.status(200).send('OK');
});

module.exports = router;
// Fuer Tests (backend/test/): reine Helfer ohne Express-Kontext.
module.exports.joinCodeMatches = joinCodeMatches;
module.exports.generateJoinCode = generateJoinCode;
