/**
 * Gemeinsame Autorisierungs-Helfer fuer Kampagnen-Mitgliedschaft/Charakter-
 * Besitz, bisher lokal in routes/campaigns.js dupliziert und in routes/files.js
 * ueberhaupt nicht geprueft (siehe CHANGELOG: Kampagnen-Autorisierungsluecke).
 * db bleibt bewusst als Parameter statt require('./db') hier drin, um einen
 * Zirkelbezug zu vermeiden und die Funktionen leicht testbar zu halten.
 */
function ownsCharacter(db, userId, charId) {
  const char = db.getCharacter(charId);
  return !!char && char.ownerId === userId;
}

function isCampaignMember(db, campaign, userId) {
  if (!campaign) return false;
  if (campaign.ownerId === userId) return true;
  return (campaign.members || []).some(m => ownsCharacter(db, userId, m.charId));
}

module.exports = { ownsCharacter, isCampaignMember };
