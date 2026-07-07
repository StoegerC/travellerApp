/**
 * Taegliches Backup: dumpt alle Charaktere/Kampagnen als JSON in ein separates,
 * privates Git-Repo und pusht es. Ersetzt die bisher fehlende Versionierung
 * der Server-Inhalte (Medien-Dateien werden bewusst NICHT mitversioniert,
 * siehe Plan "Server-Daten-Backup" - Binaerdateien diffen/committen schlecht,
 * dafuer gibt es das separate "still ersetzen + Admin-Cleanup"-Konzept).
 *
 * Das Backup-Repo darf NIEMALS im App-Repo selbst landen (das ist oeffentlich!)
 * - der Klon liegt deshalb unter backend/data/git-backup/, was im App-.gitignore
 * bereits pauschal ausgeschlossen ist (backend/data/).
 *
 * Aufruf: node backend/backup-to-git.js
 */
const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const db   = require('./db');
const { REPO_URL, GIT_ENV, CLONE_DIR } = require('./git-backup-config');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' });
}

function ensureClone() {
  if (fs.existsSync(path.join(CLONE_DIR, '.git'))) {
    git(['pull', '--ff-only'], CLONE_DIR);
    return;
  }
  fs.mkdirSync(path.dirname(CLONE_DIR), { recursive: true });
  git(['clone', REPO_URL, CLONE_DIR]);
}

// Verzeichnis komplett neu befuellen statt zu diffen - einfacher als Abgleich,
// und stellt sicher, dass zwischenzeitlich geloeschte Charaktere/Kampagnen
// auch aus dem Snapshot verschwinden.
function writeSnapshot(subdir, ids, loadFn) {
  const dir = path.join(CLONE_DIR, subdir);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const id of ids) {
    const raw = loadFn(id);
    if (!raw) continue;
    const pretty = JSON.stringify(JSON.parse(raw), null, 2);
    fs.writeFileSync(path.join(dir, `${id}.json`), pretty + '\n');
  }
}

function main() {
  ensureClone();

  const characterIds = db.listCharacters().map(c => c.id);
  const campaignIds  = db.listCampaigns().map(c => c.id);

  writeSnapshot('characters', characterIds, id => db.getCharacter(id)?.data);
  writeSnapshot('campaigns',  campaignIds,  id => {
    const c = db.getCampaign(id);
    return c ? JSON.stringify(c) : null;
  });

  git(['add', '-A'], CLONE_DIR);

  try {
    git(['diff', '--cached', '--quiet'], CLONE_DIR);
    console.log('Keine Änderungen seit dem letzten Snapshot - nichts zu committen.');
    return;
  } catch {
    // exit code != 0 heisst: es gibt staged Aenderungen - weitermachen.
  }

  const timestamp = new Date().toISOString();
  git(['commit', '-m', `Snapshot ${timestamp}`], CLONE_DIR);
  console.log(`Commit erstellt: Snapshot ${timestamp}`);

  try {
    git(['push'], CLONE_DIR);
    console.log('Push erfolgreich.');
  } catch (e) {
    console.error('Push fehlgeschlagen (Commit bleibt lokal erhalten, naechster Lauf holt ihn nach):', e.message);
  }
}

main();
