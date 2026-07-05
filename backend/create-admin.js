#!/usr/bin/env node
/**
 * Einmaliges Bootstrap-Script (Phase 3 / Nutzerverwaltung): legt einen
 * Administrator-Account an (Passwort wird beim ersten Login gesetzt, siehe
 * backend/routes/auth.js) und ordnet optional alle aktuell besitzerlosen
 * Bestandscharaktere/-kampagnen diesem Account zu.
 *
 * Löst das Henne-Ei-Problem: ohne mindestens einen Administrator kann sich
 * niemand einloggen, um weitere Nutzer anzulegen.
 *
 * Aufruf:
 *   node backend/create-admin.js <email>
 *   node backend/create-admin.js <email> --claim-existing
 */
require('dotenv').config();
const db = require('./db');

function parseArgs() {
  const args = process.argv.slice(2);
  const email = args.find(a => !a.startsWith('--'));
  return { email, claimExisting: args.includes('--claim-existing') };
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function main() {
  const { email, claimExisting } = parseArgs();
  if (!isValidEmail(email)) {
    console.error('Aufruf: node backend/create-admin.js <email> [--claim-existing]');
    process.exit(1);
  }

  let user = db.getUserByEmail(email);
  if (user) {
    console.log(`Nutzer ${email} existiert bereits (id=${user.id}), Rollen: ${user.roles.join(', ') || '(keine)'}`);
  } else {
    user = db.insertUser({ id: `user-${Date.now()}`, email, roles: ['admin'] });
    console.log(`Administrator angelegt: ${email} (id=${user.id})`);
    console.log('Passwort wird beim ersten Login in der App gesetzt.');
  }

  if (!claimExisting) return;

  let claimedChars = 0;
  for (const { id, ownerId } of db.listCharacters()) {
    if (ownerId) continue; // schon zugeordnet, nicht anfassen
    if (db.claimUnownedCharacter(id, user.id)) claimedChars++;
  }
  console.log(`${claimedChars} bisher besitzerlose(r) Charakter(e) zugeordnet.`);

  let claimedCampaigns = 0;
  for (const { id } of db.listCampaigns()) {
    const campaign = db.getCampaign(id);
    if (!campaign || campaign.ownerId === user.id) continue;
    // Vor Phase 3 stand hier eine Charakter-ID statt einer Nutzer-ID -
    // einmalige Korrektur des Feldinhalts, kein Ownership-Wechsel im
    // eigentlichen Sinn.
    db.updateCampaign(id, c => { c.ownerId = user.id; });
    claimedCampaigns++;
  }
  console.log(`${claimedCampaigns} Kampagne(n) auf den neuen Account umgestellt.`);

  if (!user.roles.includes('gm')) {
    console.log(`Hinweis: ${email} hat kein "gm"-Flag - falls du deine eigene Kampagne leiten willst, weise es dir zusätzlich zu (Admin-Oberfläche).`);
  }
}

main();
