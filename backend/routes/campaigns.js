/**
 * Kampagnen-Endpunkte – 1:1-Nachbau der bisherigen Cloudflare-Worker-Routen,
 * damit frontend/js/campaign.js unverändert bleibt.
 *
 * Mutationen laufen über db.updateCampaign(id, mutateFn) und damit innerhalb
 * einer SQLite-Transaktion (Read-Modify-Write) – das behebt die Race-Lücke,
 * die KVs nicht-transaktionales get/put beim gleichzeitigen Beitreten zweier
 * Spieler hatte.
 */
const express = require('express');
const db = require('../db');

const router = express.Router();

function isValidCampaignId(id) {
  return /^[a-z0-9_-]{2,32}$/.test(id);
}

// GET /campaigns
router.get('/campaigns', (req, res) => {
  res.json(db.listCampaigns());
});

// GET /campaign/:id
router.get('/campaign/:id', (req, res) => {
  if (!isValidCampaignId(req.params.id)) return res.status(400).send('Invalid campaign ID');
  const campaign = db.getCampaign(req.params.id);
  if (!campaign) return res.status(404).send('Not Found');
  res.json(campaign);
});

// POST /campaign/:id – erstellen (409 wenn bereits vorhanden)
router.post('/campaign/:id', (req, res) => {
  const { id } = req.params;
  if (!isValidCampaignId(id)) return res.status(400).send('Invalid campaign ID');
  if (db.campaignExists(id)) return res.status(409).send('Campaign ID already taken');

  const { name, ownerId } = req.body || {};
  if (!ownerId) return res.status(400).send('Missing ownerId');

  const campaign = {
    id,
    name: name || id,
    ownerId,
    createdAt: new Date().toISOString(),
    members: [{ charId: ownerId, joinedAt: new Date().toISOString() }],
    notes: { sessions: [], persons: [], locations: [], quests: [] },
    ships: [],
  };
  db.insertCampaign(campaign);
  res.json(campaign);
});

// GET /campaign/:id/ships
router.get('/campaign/:id/ships', (req, res) => {
  const campaign = db.getCampaign(req.params.id);
  if (!campaign) return res.status(404).send('Not Found');
  res.json(campaign.ships || []);
});

// PUT /campaign/:id/ships – atomarer Merge statt last-write-wins, siehe
// db.updateCampaignShips (Bilder werden dort weiterhin defensiv gestrippt).
router.put('/campaign/:id/ships', (req, res) => {
  const { charId, ships } = req.body || {};
  if (!charId || !Array.isArray(ships)) return res.status(400).send('Invalid JSON');
  const campaign = db.updateCampaignShips(req.params.id, charId, ships);
  if (!campaign) return res.status(404).send('Not Found');
  res.json(campaign.ships);
});

// PUT /campaign/:id/notes – atomarer Merge statt last-write-wins, siehe
// db.updateCampaignNotes.
router.put('/campaign/:id/notes', (req, res) => {
  const { entries } = req.body || {};
  if (!entries || typeof entries !== 'object') return res.status(400).send('Invalid JSON');
  const campaign = db.updateCampaignNotes(req.params.id, entries);
  if (!campaign) return res.status(404).send('Not Found');
  res.json(campaign.notes);
});

// PUT /campaign/:id/join
router.put('/campaign/:id/join', (req, res) => {
  const { charId } = req.body || {};
  if (!charId) return res.status(400).send('Missing charId');
  const campaign = db.updateCampaign(req.params.id, c => {
    if (!c.members.find(m => m.charId === charId)) {
      c.members.push({ charId, joinedAt: new Date().toISOString() });
    }
  });
  if (!campaign) return res.status(404).send('Not Found');
  res.status(200).send('OK');
});

// PUT /campaign/:id/leave
router.put('/campaign/:id/leave', (req, res) => {
  const { charId } = req.body || {};
  if (!charId) return res.status(400).send('Missing charId');
  const campaign = db.updateCampaign(req.params.id, c => {
    c.members = c.members.filter(m => m.charId !== charId);
  });
  if (!campaign) return res.status(404).send('Not Found');
  res.status(200).send('OK');
});

// DELETE /campaign/:id/member/:charId – nur Owner
router.delete('/campaign/:id/member/:charId', (req, res) => {
  const { requesterId } = req.body || {};
  const current = db.getCampaign(req.params.id);
  if (!current) return res.status(404).send('Not Found');
  if (requesterId !== current.ownerId) return res.status(403).send('Forbidden');
  db.updateCampaign(req.params.id, c => {
    c.members = c.members.filter(m => m.charId !== req.params.charId);
  });
  res.status(200).send('OK');
});

// DELETE /campaign/:id – nur Owner
router.delete('/campaign/:id', (req, res) => {
  const current = db.getCampaign(req.params.id);
  if (!current) return res.status(404).send('Not Found');
  const { requesterId } = req.body || {};
  if (requesterId !== current.ownerId) return res.status(403).send('Forbidden');
  db.deleteCampaign(req.params.id);
  res.status(200).send('OK');
});

module.exports = router;
