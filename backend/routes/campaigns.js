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

// PUT /campaign/:id/ships – last-write-wins auf dem ganzen Array
router.put('/campaign/:id/ships', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).send('Invalid JSON');
  const campaign = db.updateCampaign(req.params.id, c => {
    // Bilder werden hier defensiv weiter gestrippt (wie im alten Worker) –
    // sobald Schiffsbilder in Phase 2 auf echte Datei-Uploads umgestellt
    // sind, sollte das Feld ohnehin nicht mehr im Payload auftauchen.
    c.ships = req.body.map(({ image, ...rest }) => rest);
  });
  if (!campaign) return res.status(404).send('Not Found');
  res.status(200).send('OK');
});

// PUT /campaign/:id/notes
router.put('/campaign/:id/notes', (req, res) => {
  if (!req.body || typeof req.body !== 'object') return res.status(400).send('Invalid JSON');
  const campaign = db.updateCampaign(req.params.id, c => { c.notes = req.body; });
  if (!campaign) return res.status(404).send('Not Found');
  res.status(200).send('OK');
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
