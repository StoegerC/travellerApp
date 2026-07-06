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
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype) || file.mimetype === 'application/pdf'),
});

// Der client-seitige mimetype ist nur der von multer ausgewertete
// Formular-Header, also beliebig faelschbar. Fuer Bilder faellt eine falsche
// Behauptung ohnehin auf (kaputtes <img>), bei PDFs pruefen wir deshalb
// zusaetzlich die Magic Bytes, bevor die Datei als "PDF" in Journal-Anhaengen
// verlinkt wird.
function isValidPdf(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(5);
    fs.readSync(fd, buf, 0, 5, 0);
    return buf.toString('ascii') === '%PDF-';
  } finally {
    fs.closeSync(fd);
  }
}

const publicRouter = express.Router();

// GET /files/:id – die id ist ein zufälliger 128-Bit-Dateiname (siehe
// multer-storage oben), der nie wiederverwendet/überschrieben wird: ein
// geändertes Bild bekommt beim erneuten Hochladen immer eine neue id, die
// alte wird separat per DELETE entfernt. Der Inhalt unter einer gegebenen
// id ist damit dauerhaft unveränderlich - langes, "immutable" Caching ist
// hier sicher und hält Charaktere/Kampagnen mit vielen Bildern beim
// erneuten Laden (z.B. nach einem Logout-Cleanup, siehe Storage.
// purgeCloudCharacters) schnell, weil nur das kleine JSON neu geholt werden muss.
publicRouter.get('/files/:id', (req, res) => {
  const file = db.getFile(req.params.id);
  if (!file) return res.status(404).send('Not Found');
  res.set('Content-Type', file.mimetype);
  // Verhindert, dass der Browser den erklaerten Content-Type ignoriert und
  // eine Datei (z.B. eine mit falschem mimetype hochgeladene PDF) anders
  // interpretiert als deklariert - relevant seit hier auch PDFs liegen.
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(db.UPLOAD_DIR, file.id), { maxAge: '1y', immutable: true }, err => {
    if (err && !res.headersSent) res.status(404).send('Not Found');
  });
});

const protectedRouter = express.Router();

// POST /files – multipart/form-data, Feld "file" + ownerType/ownerId/field/refId
protectedRouter.post('/files', (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).send(err.message);
    if (!req.file) return res.status(400).send('No file');
    if (req.file.mimetype === 'application/pdf' && !isValidPdf(req.file.path)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).send('Datei ist keine gültige PDF');
    }
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
