/**
 * Gemeinsame Autorisierungs-Helfer fuer Kampagnen-Mitgliedschaft/Charakter-
 * Besitz, bisher lokal in routes/campaigns.js dupliziert und in routes/files.js
 * ueberhaupt nicht geprueft (siehe CHANGELOG: Kampagnen-Autorisierungsluecke).
 * db bleibt bewusst als Parameter statt require('./db') hier drin, um einen
 * Zirkelbezug zu vermeiden und die Funktionen leicht testbar zu halten.
 */
function ownsCharacter(db, userId, charId) {
  // userId == null abfangen: ein besitzerloser Charakter (owner_id NULL, siehe
  // db.deleteUser - Charaktere bleiben bewusst erhalten) wuerde sonst bei einem
  // ebenfalls null/undefined userId ueber null === null faelschlich als
  // "besessen" gelten. In der Praxis kommt userId immer aus der Session, aber
  // eine Zugriffskontroll-Funktion soll sich nicht auf diese Annahme verlassen.
  if (userId == null) return false;
  const char = db.getCharacter(charId);
  return !!char && char.ownerId === userId;
}

function isCampaignMember(db, campaign, userId) {
  if (!campaign) return false;
  if (campaign.ownerId === userId) return true;
  return (campaign.members || []).some(m => ownsCharacter(db, userId, m.charId));
}

module.exports = { ownsCharacter, isCampaignMember };
