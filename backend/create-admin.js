#!/usr/bin/env node
/**
 * Einmaliges Bootstrap-Script (Phase 3 / Nutzerverwaltung): legt einen
 * Administrator-Account an und ordnet optional alle aktuell besitzerlosen
 * Bestandscharaktere/-kampagnen diesem Account zu.
 *
 * Löst das Henne-Ei-Problem: ohne mindestens einen Administrator kann sich
 * niemand einloggen, um weitere Nutzer anzulegen.
 *
 * Gibt einen einmaligen Setup-Token aus, mit dem sich der Administrator genau
 * einmal anmeldet und dabei sofort ein eigenes Passwort setzt (siehe
 * backend/routes/auth.js). Früher wurde das Passwort schlicht beim ersten Login
 * gesetzt - wer die E-Mail kannte und schneller war, übernahm das Konto.
 *
 * Aufruf:
 *   node backend/create-admin.js <email>
 *   node backend/create-admin.js <email> --claim-existing
 */
require('dotenv').config();
const crypto = require('crypto');
const db = require('./db');
const { hashPassword } = require('./auth');

function parseArgs() {
  const args = process.argv.slice(2);
  const email = args.find(a => !a.startsWith('--'));
  return { email, claimExisting: args.includes('--claim-existing') };
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const { email, claimExisting } = parseArgs();
  if (!isValidEmail(email)) {
    console.error('Aufruf: node backend/create-admin.js <email> [--claim-existing]');
    process.exit(1);
  }

  let user = db.getUserByEmail(email);
  if (user) {
    console.log(`Nutzer ${email} existiert bereits (id=${user.id}), Rollen: ${user.roles.join(', ') || '(keine)'}`);
  } else {
    const setupToken = crypto.randomBytes(24).toString('base64url');
    user = db.insertUser({
      id: `user-${Date.now()}`,
      email,
      roles: ['admin'],
      passwordHash: await hashPassword(setupToken),
      mustChangePassword: true,
    });
    console.log(`Administrator angelegt: ${email} (id=${user.id})`);
    console.log('');
    console.log(`  Setup-Token: ${setupToken}`);
    console.log('');
    console.log('Damit einmal in der App anmelden (als Passwort eingeben) - die App verlangt');
    console.log('danach sofort ein eigenes Passwort. Der Token steht nur hier und ist danach');
    console.log('nur noch als Hash gespeichert.');
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

main().catch(err => { console.error(err); process.exit(1); });
