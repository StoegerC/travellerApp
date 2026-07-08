/**
 * Einmalige Aufräum-/Migrationsschritte beim Serverstart. Bewusst hier statt in
 * db.js: db.js soll beim require() nur das Schema anlegen, keine Seiteneffekte
 * mit Ausgaben produzieren (die Wartungsscripts und Tests laden es ebenfalls).
 *
 * Alle Schritte sind idempotent - ein Neustart darf sie gefahrlos wiederholen.
 */
const crypto = require('crypto');
const db = require('./db');
const { hashPassword } = require('./auth');

// Bestandskampagnen aus der Zeit vor dem Beitritts-Code bekommen einen.
// Ohne diesen Schritt koennte NIEMAND mehr beitreten (joinCodeMatches lehnt
// einen leeren erwarteten Code grundsaetzlich ab) - bestehende Mitglieder
// bleiben davon unberuehrt.
function ensureCampaignJoinCodes() {
  const created = [];
  for (const { id } of db.listCampaigns()) {
    const campaign = db.getCampaign(id);
    if (!campaign || campaign.joinCode) continue;
    const joinCode = crypto.randomBytes(6).toString('base64url');
    db.updateCampaign(id, c => { c.joinCode = joinCode; });
    created.push({ id, name: campaign.name, joinCode });
  }
  return created;
}

// Bestandsnutzer aus der Zeit von "der erste Login setzt das Passwort"
// (password_hash IS NULL) haetten die Konto-Uebernahme-Luecke behalten. Sie
// bekommen einen einmaligen Setup-Token, der genau einmal hier im Log steht -
// der Administrator gibt ihn weiter, danach ist er nur noch als Hash gespeichert.
async function ensureSetupTokens() {
  const issued = [];
  for (const user of db.listUsersWithoutPassword()) {
    const setupToken = crypto.randomBytes(24).toString('base64url');
    db.setPasswordHash(user.id, await hashPassword(setupToken), true);
    issued.push({ email: user.email, setupToken });
  }
  return issued;
}

async function run({ log = console.log } = {}) {
  const expiredSessions = db.deleteExpiredSessions();
  if (expiredSessions > 0) log(`Sitzungen abgelaufen und entfernt: ${expiredSessions}`);

  for (const c of ensureCampaignJoinCodes()) {
    log(`Kampagne „${c.name}" (${c.id}) hat jetzt den Beitritts-Code: ${c.joinCode}`);
  }

  for (const u of await ensureSetupTokens()) {
    log(`Setup-Token für ${u.email} (nur jetzt sichtbar, danach nur noch als Hash): ${u.setupToken}`);
  }
}

module.exports = { run, ensureCampaignJoinCodes, ensureSetupTokens };
