#!/usr/bin/env node
/**
 * Einmalige Datenübernahme aus dem alten Cloudflare Worker/KV in die neue
 * SQLite-DB. Rein lesend gegen den Worker (keine Löschungen), wiederholbar
 * (Upsert pro Datensatz) — sicher mehrfach laufen zu lassen.
 *
 * Aufruf:
 *   node migrate-from-kv.js --kv-url https://traveller-sync.<name>.workers.dev --kv-key <API_KEY>
 * oder über Umgebungsvariablen KV_URL / KV_KEY.
 */
require('dotenv').config();
const db = require('./db');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--kv-url') out.kvUrl = args[++i];
    if (args[i] === '--kv-key') out.kvKey = args[++i];
  }
  return {
    kvUrl: (out.kvUrl || process.env.KV_URL || '').replace(/\/$/, ''),
    kvKey: out.kvKey || process.env.KV_KEY || '',
  };
}

async function kvFetch(kvUrl, kvKey, path) {
  const res = await fetch(`${kvUrl}${path}`, {
    headers: { Authorization: `Bearer ${kvKey}` },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const { kvUrl, kvKey } = parseArgs();
  if (!kvUrl || !kvKey) {
    console.error('Fehlt: --kv-url und --kv-key (oder KV_URL/KV_KEY in .env)');
    process.exit(1);
  }

  console.log(`Migriere von ${kvUrl} …`);

  let charCount = 0, charFail = 0;
  const chars = await kvFetch(kvUrl, kvKey, '/chars');
  for (const { id } of chars) {
    try {
      const raw = await fetch(`${kvUrl}/char/${id}`, { headers: { Authorization: `Bearer ${kvKey}` } });
      if (!raw.ok) throw new Error(`HTTP ${raw.status}`);
      const text = await raw.text();
      db.putCharacter(id, text);
      charCount++;
    } catch (e) {
      console.error(`  ✗ Charakter ${id}: ${e.message}`);
      charFail++;
    }
  }

  let campCount = 0, campFail = 0;
  const campaigns = await kvFetch(kvUrl, kvKey, '/campaigns');
  for (const { id } of campaigns) {
    try {
      const campaign = await kvFetch(kvUrl, kvKey, `/campaign/${id}`);
      db.upsertCampaign(campaign);
      campCount++;
    } catch (e) {
      console.error(`  ✗ Kampagne ${id}: ${e.message}`);
      campFail++;
    }
  }

  console.log(`\nFertig: ${charCount} Charaktere migriert (${charFail} Fehler), ${campCount} Kampagnen migriert (${campFail} Fehler).`);
  console.log('Base64-Bilder wurden 1:1 mitkopiert (unverändert) — keine Konvertierung zu Datei-Uploads in diesem Schritt.');
}

main().catch(e => {
  console.error('Migration fehlgeschlagen:', e);
  process.exit(1);
});
