/**
 * Speicher-Quota pro Nutzer. Bisher konnte jeder eingeloggte Nutzer unbegrenzt
 * viele 100-MB-PDFs und 20-MB-Charakter-JSONs hochladen - auf einem selbst
 * gehosteten Server (Raspberry Pi, Laptop) laeuft damit irgendwann die Platte
 * voll und reisst alle anderen mit.
 *
 * Grosszuegig bemessen: die Grenze soll ein Versehen oder einen boesartigen
 * Fremdnutzer abfangen, nicht die normale Nutzung am Spieltisch stoeren.
 * Ueber USER_QUOTA_BYTES abschaltbar (0 = unbegrenzt, wie vorher).
 */
const db = require('./db');

const DEFAULT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

function quotaBytes() {
  const raw = process.env.USER_QUOTA_BYTES;
  if (raw == null || raw === '') return DEFAULT_QUOTA_BYTES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_QUOTA_BYTES;
}

function formatBytes(n) {
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

// Wuerde das Hinzufuegen von additionalBytes das Limit reissen?
// excludeCharId: der Charakter, der gerade ueberschrieben wird - sein
// aktueller Stand darf nicht doppelt zaehlen (siehe db.getUserUsageBytes).
// Rueckgabe: { ok: true } bzw. { ok: false, error }
function checkQuota(userId, additionalBytes, { excludeCharId = null } = {}) {
  const limit = quotaBytes();
  if (limit === 0) return { ok: true };
  const used = db.getUserUsageBytes(userId, { excludeCharId });
  if (used + additionalBytes <= limit) return { ok: true };
  return {
    ok: false,
    error: `Speicherplatz erschöpft (${formatBytes(used)} von ${formatBytes(limit)} belegt). `
         + 'Alte Bilder/PDFs entfernen oder den Administrator um mehr Platz bitten.',
  };
}

module.exports = { checkQuota, quotaBytes, formatBytes, DEFAULT_QUOTA_BYTES };
