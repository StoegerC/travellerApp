/**
 * Einmaliges Wartungsscript (Folgearbeit zu Phase 2 / Datei-Uploads):
 * wandelt bereits eingebettete Base64-Bilder in bestehenden Charakteren und
 * Kampagnen in echte hochgeladene Dateien um. War laut Plan kein Zwang
 * ("additiv, alte Base64-Strings bleiben für immer lesbar"), aber sinnvoll um
 * die real existierenden Charaktere ebenfalls von der Größenreduktion
 * profitieren zu lassen.
 *
 * Idempotent: Einträge, die kein data:-URI mehr enthalten (schon konvertiert
 * oder nie eines hatten), bleiben unangetastet.
 *
 * Aufruf:
 *   node backend/convert-embedded-images.js --dry-run   (nur Vorschau, keine Schreibvorgänge)
 *   node backend/convert-embedded-images.js             (führt die Konvertierung durch)
 */
require('dotenv').config();
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const db     = require('./db');

const DRY_RUN = process.argv.includes('--dry-run');
let uploadCount = 0;

function decodeDataUri(uri) {
  if (typeof uri !== 'string') return null;
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(uri);
  if (!m) return null;
  return { mimetype: m[1], buffer: Buffer.from(m[2], 'base64') };
}

function extFor(mimetype) {
  return (mimetype.split('/')[1] || 'bin').replace('jpeg', 'jpg');
}

function convertOne(uri, meta) {
  const decoded = decodeDataUri(uri);
  if (!decoded) return null;
  const id = crypto.randomBytes(16).toString('hex');
  uploadCount++;
  if (DRY_RUN) return id;
  fs.writeFileSync(path.join(db.UPLOAD_DIR, id), decoded.buffer);
  db.insertFile({
    id, ownerType: meta.ownerType, ownerId: meta.ownerId,
    field: meta.field, refId: meta.refId || null,
    filename: `${meta.field}.${extFor(decoded.mimetype)}`,
    mimetype: decoded.mimetype, size: decoded.buffer.length,
  });
  return id;
}

function convertCharacter(charId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = db.getCharacter(charId);
    if (!row) return;
    const char = JSON.parse(row.data);
    let changed = false;

    for (const ship of char.ships || []) {
      if (ship.image) {
        const id = convertOne(ship.image, { ownerType: 'character', ownerId: charId, field: 'shipImage', refId: ship.id });
        if (id) { ship.imageFileId = id; ship.image = null; changed = true; }
      }
    }
    for (const item of char.equipment || []) {
      if (item.details?.image) {
        const id = convertOne(item.details.image, { ownerType: 'character', ownerId: charId, field: 'equipmentImage', refId: item.id });
        if (id) { item.details.imageFileId = id; item.details.image = null; changed = true; }
      }
    }
    const portraits = char.metadata?.portraits || [];
    for (let i = 0; i < portraits.length; i++) {
      if (typeof portraits[i] === 'string' && portraits[i].startsWith('data:')) {
        const id = convertOne(portraits[i], { ownerType: 'character', ownerId: charId, field: 'portrait' });
        if (id) { portraits[i] = id; changed = true; }
      }
    }
    for (const person of char.notes?.persons || []) {
      if (person.image) {
        const id = convertOne(person.image, { ownerType: 'character', ownerId: charId, field: 'personImage', refId: person.id });
        if (id) { person.imageFileId = id; person.image = null; changed = true; }
      }
    }

    if (!changed) return;
    if (DRY_RUN) { console.log(`  [dry-run] ${charId}: würde konvertiert`); return; }

    const result = db.putCharacter(charId, JSON.stringify(char), row.updatedAt);
    if (result.ok) { console.log(`  ${charId}: konvertiert`); return; }
    console.log(`  ${charId}: Konflikt (Versuch ${attempt + 1}/3), erneut lesen ...`);
  }
  console.error(`  ${charId}: nach 3 Versuchen weiter im Konflikt, übersprungen (Charakter wurde parallel bearbeitet)`);
}

function characterHasEmbeddedImages(char) {
  if ((char.ships || []).some(s => s.image)) return true;
  if ((char.equipment || []).some(e => e.details?.image)) return true;
  if ((char.metadata?.portraits || []).some(p => typeof p === 'string' && p.startsWith('data:'))) return true;
  if ((char.notes?.persons || []).some(p => p.image)) return true;
  return false;
}

function convertCampaign(campaignId) {
  const campaign = db.getCampaign(campaignId);
  if (!campaign) return;

  const hasImages =
    ['sessions', 'persons', 'locations', 'quests'].some(tab => (campaign.notes?.[tab] || []).some(e => e.image)) ||
    (campaign.ships || []).some(s => s.image);
  if (!hasImages) return;

  const mutate = c => {
    for (const tab of ['sessions', 'persons', 'locations', 'quests']) {
      for (const entry of c.notes?.[tab] || []) {
        if (entry.image) {
          const id = convertOne(entry.image, { ownerType: 'campaign', ownerId: campaignId, field: `${tab}Image`, refId: entry.id });
          if (id) { entry.imageFileId = id; entry.image = null; }
        }
      }
    }
    for (const ship of c.ships || []) {
      if (ship.image) {
        const id = convertOne(ship.image, { ownerType: 'campaign', ownerId: campaignId, field: 'shipImage', refId: ship.id });
        if (id) { ship.imageFileId = id; ship.image = null; }
      }
    }
  };

  if (DRY_RUN) {
    mutate(campaign); // campaign ist ein frisches, wegwerfbares Objekt von db.getCampaign() - Mutation hier hat keine Nebenwirkung
    console.log(`  [dry-run] ${campaignId}: würde konvertiert`);
    return;
  }

  db.updateCampaign(campaignId, mutate);
  console.log(`  ${campaignId}: konvertiert`);
}

console.log(DRY_RUN ? 'DRY RUN — es werden keine Änderungen geschrieben.\n' : 'Konvertiere eingebettete Bilder ...\n');

console.log('Charaktere:');
for (const { id } of db.listCharacters()) {
  const row = db.getCharacter(id);
  const char = JSON.parse(row.data);
  if (characterHasEmbeddedImages(char)) convertCharacter(id);
}

console.log('\nKampagnen:');
for (const { id } of db.listCampaigns()) {
  convertCampaign(id);
}

console.log(`\nFertig. ${uploadCount} Bild(er) ${DRY_RUN ? 'würden' : 'wurden'} konvertiert.`);
