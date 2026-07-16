/**
 * Charakter-Endpunkte – 1:1-Nachbau der bisherigen Cloudflare-Worker-Routen,
 * damit frontend/js/cloudsync.js unverändert bleibt.
 *
 * Phase 3: echte Zugriffskontrolle statt "wer den API-Key hat, darf alles".
 * req.user kommt von checkAuth (siehe backend/auth.js), läuft für alle Routen
 * hier bereits davor.
 */
const express = require('express');
const db = require('../db');
const { checkQuota } = require('../quota');

const router = express.Router();

function isGm(user) { return user.roles.includes('gm'); }

// GET /chars – nur eigene, ausser gm-Flag (dann alle, fuer Meister-Uebersicht).
// "mine" verraet dem Frontend, ob es sich lokal wie ein voll editierbarer
// eigener Charakter verhalten darf oder read-only (fremd, nur ueber gm-Flag
// sichtbar) behandeln muss.
router.get('/chars', (req, res) => {
  const all = db.listCharacters();
  const visible = isGm(req.user) ? all : all.filter(c => c.ownerId === req.user.id);
  res.json(visible.map(({ id, name, ownerId }) => ({ id, name, mine: ownerId === req.user.id })));
});

// GET /char/:id – eigene oder gm-Flag (read-only fuer gm, siehe PUT unten).
// ETag = updated_at (opaker Versionsstring, kein Hash noetig): der Sync-Poll
// des Frontends schickt den zuletzt gesehenen Stand als If-None-Match mit und
// bekommt 304 ohne Body, solange sich nichts geaendert hat — sonst ginge alle
// 15 s das komplette Charakter-JSON ueber die Leitung.
router.get('/char/:id', (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).send('Not Found');
  if (char.ownerId !== req.user.id && !isGm(req.user)) return res.status(403).send('Forbidden');
  const etag = `"${char.updatedAt}"`;
  if (req.headers['if-none-match'] === etag) {
    return res.set({ 'ETag': etag, 'X-Updated-At': char.updatedAt }).status(304).end();
  }
  res.set({ 'ETag': etag, 'X-Updated-At': char.updatedAt }).type('application/json').send(char.data);
});

// PUT /char/:id – Neuanlage: owner_id wird serverseitig auf req.user.id
// gesetzt (nicht vom Client uebernommen). Existiert der Charakter schon, nur
// der Owner darf schreiben - auch gm nicht (Leserecht ist ausdruecklich
// read-only).
router.put('/char/:id', (req, res) => {
  if (!req.body || typeof req.body !== 'object' || !Object.keys(req.body).length) {
    return res.status(400).send('Empty body');
  }
  const existing = db.getCharacter(req.params.id);
  if (existing && existing.ownerId !== req.user.id) return res.status(403).send('Forbidden');

  const body = JSON.stringify(req.body);
  // Der bisherige Stand dieses Charakters zaehlt nicht mit - sonst schluege ein
  // reines Speichern ohne Groessenzuwachs am Limit fehl.
  const quota = checkQuota(req.user.id, Buffer.byteLength(body, 'utf8'), { excludeCharId: req.params.id });
  if (!quota.ok) return res.status(413).send(quota.error);

  const expected = req.headers['if-unmodified-since-version'] || null;
  const result = db.putCharacter(req.params.id, body, expected, req.user.id);
  if (!result.ok) {
    return res.status(409).json({ data: JSON.parse(result.data), updatedAt: result.updatedAt });
  }
  res.set('X-Updated-At', result.updatedAt).status(200).send('OK');
});

// DELETE /char/:id – nur Owner
router.delete('/char/:id', (req, res) => {
  const char = db.getCharacter(req.params.id);
  if (!char) return res.status(404).send('Not Found');
  if (char.ownerId !== req.user.id) return res.status(403).send('Forbidden');
  db.deleteCharacter(req.params.id);
  res.status(200).send('OK');
});

module.exports = router;
