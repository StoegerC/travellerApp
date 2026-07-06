#!/usr/bin/env node
/**
 * Einmalige Kommando-Ausführung statt Handarbeit an vier Stellen: bumpt die
 * Versionsnummer überall dort, wo sie im Projekt vorkommt, und schneidet aus
 * den gesammelten CHANGELOG.md-Einträgen unter "[Unreleased]" einen neuen
 * Versions-Block.
 *
 * Aufruf: node scripts/bump-version.js <X.Y.Z>
 *
 * Betroffene Stellen:
 *   - VERSION                          (Quelle der Wahrheit)
 *   - frontend/index.html              (?v=... Cache-Busting + Header-Anzeige)
 *   - frontend/sw.js                   (Service-Worker CACHE-Name)
 *   - frontend/manifest.json           ("version"-Feld)
 *   - CHANGELOG.md                     ([Unreleased] -> [X.Y.Z] - Datum)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VERSION_RE = /^\d+\.\d+\.\d+$/;

function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function writeFile(rel, content) { fs.writeFileSync(path.join(ROOT, rel), content); }

function isNewer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return false;
}

function main() {
  const newVersion = process.argv[2];
  if (!newVersion || !VERSION_RE.test(newVersion)) {
    console.error('Aufruf: node scripts/bump-version.js <X.Y.Z>');
    process.exit(1);
  }

  const oldVersion = readFile('VERSION').trim();
  if (!VERSION_RE.test(oldVersion)) {
    console.error(`VERSION-Datei enthält keine gültige Version: "${oldVersion}"`);
    process.exit(1);
  }
  if (!isNewer(newVersion, oldVersion)) {
    console.error(`${newVersion} ist nicht größer als die aktuelle Version ${oldVersion}.`);
    process.exit(1);
  }

  // ── frontend/index.html: Cache-Busting-Query + Header-Anzeige ──────────
  // Der ?v=-Wert wird aus der Datei selbst gelesen statt aus VERSION
  // angenommen: historisch lief er unter einer eigenen Zählweise
  // (?v=1.12.9), unabhängig von der sichtbaren App-Version - der erste Lauf
  // dieses Scripts führt beide erst zusammen.
  let html = readFile('frontend/index.html');
  const currentQueryMatch = html.match(/\?v=(\d+\.\d+\.\d+)/);
  if (!currentQueryMatch) {
    console.error('Kein "?v=X.Y.Z" Cache-Busting-Muster in frontend/index.html gefunden');
    process.exit(1);
  }
  const vQueryRe = new RegExp(`\\?v=${currentQueryMatch[1].replace(/\./g, '\\.')}`, 'g');
  const { count: queryCount, result: htmlAfterQuery } = countingReplace(html, vQueryRe, `?v=${newVersion}`);
  const headerRe = /(<small class="app-version">v)[\d.]+(<\/small>)/;
  if (!headerRe.test(htmlAfterQuery)) {
    console.error('Header-Version (<small class="app-version">) nicht gefunden in frontend/index.html');
    process.exit(1);
  }
  const htmlFinal = htmlAfterQuery.replace(headerRe, `$1${newVersion}$2`);
  writeFile('frontend/index.html', htmlFinal);

  // ── frontend/sw.js: Service-Worker Cache-Name ───────────────────────────
  let sw = readFile('frontend/sw.js');
  const cacheRe = /(const CACHE = 'traveller-v)[^']+(')/;
  if (!cacheRe.test(sw)) {
    console.error("CACHE-Konstante nicht gefunden in frontend/sw.js");
    process.exit(1);
  }
  sw = sw.replace(cacheRe, `$1${newVersion}$2`);
  writeFile('frontend/sw.js', sw);

  // ── frontend/manifest.json: "version"-Feld ──────────────────────────────
  let manifest = readFile('frontend/manifest.json');
  const manifestRe = /("version":\s*")[^"]*(")/;
  if (!manifestRe.test(manifest)) {
    console.error('"version"-Feld nicht gefunden in frontend/manifest.json');
    process.exit(1);
  }
  manifest = manifest.replace(manifestRe, `$1${newVersion}$2`);
  writeFile('frontend/manifest.json', manifest);

  // ── CHANGELOG.md: [Unreleased] -> [X.Y.Z] - Datum, neue leere Sektion ──
  let changelog = readFile('CHANGELOG.md');
  const unreleasedIdx = changelog.indexOf('## [Unreleased]');
  if (unreleasedIdx === -1) {
    console.error('"## [Unreleased]" nicht gefunden in CHANGELOG.md');
    process.exit(1);
  }
  const afterHeading = unreleasedIdx + '## [Unreleased]'.length;
  const nextSeparatorIdx = changelog.indexOf('\n---', afterHeading);
  if (nextSeparatorIdx === -1) {
    console.error('Kein abschließendes "---" nach "[Unreleased]" gefunden in CHANGELOG.md');
    process.exit(1);
  }
  const unreleasedBody = changelog.slice(afterHeading, nextSeparatorIdx).trim();
  if (!unreleasedBody) {
    console.error('"[Unreleased]" ist leer - nichts zu releasen.');
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const replacement =
    `## [Unreleased]\n\n---\n\n## [${newVersion}] – ${today}\n\n${unreleasedBody}\n`;
  changelog = changelog.slice(0, unreleasedIdx) + replacement + changelog.slice(nextSeparatorIdx);
  writeFile('CHANGELOG.md', changelog);

  // ── VERSION-Datei ────────────────────────────────────────────────────────
  writeFile('VERSION', `${newVersion}\n`);

  console.log(`Version ${oldVersion} -> ${newVersion}`);
  console.log(`  frontend/index.html: ${queryCount} Cache-Busting-Query(s) + Header aktualisiert`);
  console.log('  frontend/sw.js: CACHE-Name aktualisiert');
  console.log('  frontend/manifest.json: "version" aktualisiert');
  console.log(`  CHANGELOG.md: [Unreleased] -> [${newVersion}] – ${today}, neue leere [Unreleased]-Sektion angelegt`);
}

function countingReplace(str, regex, replacement) {
  let count = 0;
  const result = str.replace(regex, () => { count++; return replacement; });
  return { count, result };
}

main();
