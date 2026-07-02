/**
 * Charakter-Endpunkte – 1:1-Nachbau der bisherigen Cloudflare-Worker-Routen,
 * damit frontend/js/cloudsync.js unverändert bleibt.
 */
const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /chars
router.get('/chars', (req, res) => {
  res.json(db.listCharacters());
});

// GET /char/:id
router.get('/char/:id', (req, res) => {
  const data = db.getCharacter(req.params.id);
  if (!data) return res.status(404).send('Not Found');
  res.type('application/json').send(data);
});

// PUT /char/:id
router.put('/char/:id', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || !Object.keys(req.body).length) {
    return res.status(400).send('Empty body');
  }
  db.putCharacter(req.params.id, JSON.stringify(req.body));
  res.status(200).send('OK');
});

// DELETE /char/:id
router.delete('/char/:id', (req, res) => {
  db.deleteCharacter(req.params.id);
  res.status(200).send('OK');
});

module.exports = router;
