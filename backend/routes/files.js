/**
 * Datei-Uploads (Phase 2) – ersetzt eingebettete Base64-Bilder im Charakter-/
 * Kampagnen-JSON durch echte Dateien, nur per ID referenziert.
 *
 * Exportiert zwei Router statt einem (Bruch mit dem sonstigen Ein-Router-pro-
 * Datei-Muster, hier aber notwendig): <img src="..."> kann keinen Authorization-
 * Header mitschicken, deshalb ist GET /files/:id oeffentlich (aber die ID ist
 * eine lange Zufallszeichenkette, nicht erratbar) und wird in server.js VOR
 * checkAuth registriert wie die statischen Frontend-Dateien. POST/DELETE bleiben
 * wie alle anderen mutierenden Endpunkte durch den Bearer-Token geschuetzt und
 * werden NACH checkAuth registriert.
 */
const express = require('express');
const multer  = require('multer');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');

const upload = multer({
  storage: multer.diskStorage({
    destination: db.UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const publicRouter = express.Router();

// GET /files/:id
publicRouter.get('/files/:id', (req, res) => {
  const file = db.getFile(req.params.id);
  if (!file) return res.status(404).send('Not Found');
  res.set('Content-Type', file.mimetype);
  res.sendFile(path.join(db.UPLOAD_DIR, file.id), err => {
    if (err && !res.headersSent) res.status(404).send('Not Found');
  });
});

const protectedRouter = express.Router();

// POST /files – multipart/form-data, Feld "file" + ownerType/ownerId/field/refId
protectedRouter.post('/files', (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).send(err.message);
    if (!req.file) return res.status(400).send('No file');
    const { ownerType, ownerId, field, refId } = req.body || {};
    if (!ownerType || !ownerId) return res.status(400).send('Missing ownerType/ownerId');
    if (!['character', 'campaign'].includes(ownerType)) return res.status(400).send('Invalid ownerType');
    const record = db.insertFile({
      id:       req.file.filename,
      ownerType, ownerId, field, refId,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size:     req.file.size,
    });
    res.json({ id: record.id, url: `/files/${record.id}` });
  });
});

// DELETE /files/:id
protectedRouter.delete('/files/:id', (req, res) => {
  const file = db.getFile(req.params.id);
  if (!file) return res.status(404).send('Not Found');
  fs.unlink(path.join(db.UPLOAD_DIR, file.id), () => {});
  db.deleteFile(req.params.id);
  res.status(200).send('OK');
});

module.exports = { publicRouter, protectedRouter };
