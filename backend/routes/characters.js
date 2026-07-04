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
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).send('Not Found');
  res.set('X-Updated-At', char.updatedAt).type('application/json').send(char.data);
});

// PUT /char/:id
router.put('/char/:id', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || !Object.keys(req.body).length) {
    return res.status(400).send('Empty body');
  }
  const expected = req.headers['if-unmodified-since-version'] || null;
  const result = db.putCharacter(req.params.id, JSON.stringify(req.body), expected);
  if (!result.ok) {
    return res.status(409).json({ data: JSON.parse(result.data), updatedAt: result.updatedAt });
  }
  res.set('X-Updated-At', result.updatedAt).status(200).send('OK');
});

// DELETE /char/:id
router.delete('/char/:id', (req, res) => {
  db.deleteCharacter(req.params.id);
  res.status(200).send('OK');
});

module.exports = router;
