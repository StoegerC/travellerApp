/**
 * NotesTravellermap – Imperialkalender-/Travellermap-Helfer, ausgelagert aus
 * frontend/js/pages/notes.js (dort wurde die Datei mit 2.274 Zeilen zu gross).
 *
 * Reine Verlagerung per Object.assign auf DASSELBE NotesPage-Objekt: alle
 * this.*-Referenzen (this._esc, this._d, this._parseTravellermapHit, ...) loesen
 * unveraendert auf, weil es weiterhin ein Objekt ist. Kein Verhaltenswechsel.
 * Muss NACH notes.js geladen werden (NotesPage muss existieren) - siehe
 * Reihenfolge in index.html und sw.js.
 *
 * Enthaelt: Imperialkalender-Formatierung (_formatTravDate/_formatTravDateShort),
 * UWP-Dekodierung (_decodeUWP), Travellermap-Treffernormalisierung
 * (_parseTravellermapHit) und die beiden Orts-Suchfelder
 * (_attachLocAutocomplete/_attachLocTravSearch). Der YYYY-DDD-Datumspicker
 * lebt seit Phase 2 als Kalender-Vertrag in systems/mgt2/calendar.js.
 */
Object.assign(NotesPage, {
  // ─────────────────── IMPERIALKALENDER HELPERS ────────────────────────────
  // Format: "YYYY-DDD" (z.B. "1105-032" = Jahr 1105, Tag 32 = Monat 2, Tag 2)
  // 12 Monate × 30 Tage = 360 Tage + 5 Feiertage am Jahresende (361-365)
  _formatTravDate(str) {
    if (!str) return '';
    const m = str.match(/^(\d+)-(\d{3})$/);
    if (!m) return str;
    const year = parseInt(m[1]);
    const doy  = parseInt(m[2]);
    if (doy > 360) return `Feiertag ${doy - 360}, Jahr ${year}`;
    const month = Math.ceil(doy / 30);
    const day   = doy - (month - 1) * 30;
    return `Tag ${day}, Monat ${month}, Jahr ${year}`;
  },

  _formatTravDateShort(str) {
    if (!str) return '';
    const m = str.match(/^(\d+)-(\d{3})$/);
    if (!m) return str;
    const year = parseInt(m[1]);
    const doy  = parseInt(m[2]);
    if (doy > 360) return `FT${doy - 360}/${year}`;
    const month = Math.ceil(doy / 30);
    const day   = doy - (month - 1) * 30;
    return `${day}/${month}/${year}`;
  },

  _decodeUWP(uwp) {
    if (!uwp || uwp.length < 7) return null;
    const STARPORT = { A: 'Exzellent (A)', B: 'Gut (B)', C: 'Standard (C)', D: 'Gering (D)', E: 'Grenze (E)', X: 'Kein Raumhafen' };
    const ATMO = ['Keine', 'Spur', 'Sehr dünn (verg.)', 'Sehr dünn', 'Dünn (verg.)', 'Dünn', 'Standard', 'Standard (verg.)', 'Dicht', 'Dicht (verg.)', 'Exotisch', 'Korrosiv', 'Tödlich', 'Tödlich', 'Tödlich', 'Sonderform'];
    const GOV = ['Keine Reg.', 'Firmenherrschaft', 'Partizip. Demo.', 'Selbstverwaltung', 'Repräsent. Demo.', 'Feudal-Technokr.', 'Gefangenenwelt', 'Balkanisiert', 'Bürokratie', 'Imperialer Gouv.', 'Charismat. Dikt.', 'Charismat. Olig.', 'Totemist. Dikt.', 'Religiöse Dikt.', 'Religiöse Autokr.', 'Totalitäre Olig.'];
    const POP = ['Unbewohnt', 'Dutzende', 'Hunderte', 'Tausende', 'Zehntausende', 'Hunderttausende', 'Millionen', 'Zehnmillionen', 'Hundertmillionen', 'Milliarden+', 'Zig-Milliarden+'];
    const sp = uwp[0];
    const sz = parseInt(uwp[1], 16);
    const at = parseInt(uwp[2], 16);
    const hy = parseInt(uwp[3], 16);
    const pp = parseInt(uwp[4], 16);
    const gv = parseInt(uwp[5], 16);
    const ll = parseInt(uwp[6], 16);
    const tech = uwp.split('-')[1] || '';
    return {
      starport:    STARPORT[sp] || `Typ ${sp}`,
      size:        (isNaN(sz) || sz === 0) ? 'Asteroid' : `~${(sz * 1600).toLocaleString('de')} km Ø`,
      atmosphere:  ATMO[at] ?? `Code ${uwp[2]}`,
      hydrosphere: hy === 0 ? 'Wüste (0%)' : hy >= 10 ? 'Wasserreich (100%)' : `${hy * 10}% Wasser`,
      population:  POP[pp] || `Code ${uwp[4]}`,
      government:  GOV[gv] || `Code ${uwp[5]}`,
      lawLevel:    `${ll} / 9`,
      techLevel:   `TL-${parseInt(tech, 16) || tech}`,
    };
  },

  // Normalisiert einen Travellermap-API-Treffer (World / Sector / Subsector) in ein einheitliches Objekt
  _parseTravellermapHit(item) {
    if (item.World) {
      const w   = item.World;
      const hex = String(w.HexX).padStart(2,'0') + String(w.HexY).padStart(2,'0');
      return { type: 'world',     icon: '🌐', name: w.Name, sector: w.Sector || '', hex, uwp: w.Uwp || '',
               sublabel: `${w.Sector || ''} · ${hex}${w.Uwp ? ' · ' + w.Uwp : ''}`,
               navScale: 64 };
    }
    if (item.Sector) {
      const s    = item.Sector;
      const name = s.Names?.[0]?.Text || s.Name || '(Unbekannter Sektor)';
      return { type: 'sector',    icon: '🗺️', name, sector: name, hex: null, uwp: null,
               sublabel: 'Sektor', navScale: 8 };
    }
    if (item.Subsector) {
      const ss   = item.Subsector;
      const name = ss.Names?.[0]?.Text || ss.Name || '(Unbekannter Teilsektor)';
      return { type: 'subsector', icon: '📍', name, sector: ss.Sector || '', hex: null, uwp: null,
               sublabel: `Teilsektor · ${ss.Sector || ''}`, navScale: 16 };
    }
    return null;
  },

  _attachLocAutocomplete() {
    const nameInput   = document.getElementById('locName');
    const suggestEl   = document.getElementById('locNameSuggestions');
    const mapXInput   = document.getElementById('locMapX');
    const mapYInput   = document.getElementById('locMapY');
    const mapSecInput = document.getElementById('locMapSector');
    const mapHexInput = document.getElementById('locMapHex');
    const badgeEl     = document.getElementById('locMapBadge');
    if (!nameInput || !suggestEl) return;

    let timer = null;

    const clearLink = () => {
      if (mapXInput)   mapXInput.value   = '';
      if (mapYInput)   mapYInput.value   = '';
      if (mapSecInput) mapSecInput.value = '';
      if (mapHexInput) mapHexInput.value = '';
      if (badgeEl)     badgeEl.remove();
    };

    const closeSuggestions = () => { suggestEl.innerHTML = ''; };

    nameInput.addEventListener('input', () => {
      clearLink();
      closeSuggestions();
      const q = nameInput.value.trim();
      clearTimeout(timer);
      if (q.length < 2) return;

      suggestEl.innerHTML = '<div class="loc-suggest-loading">⏳ Suche in Travellermap …</div>';

      timer = setTimeout(async () => {
        try {
          const res  = await fetch(`https://travellermap.com/api/search?q=${encodeURIComponent(q)}`, { mode: 'cors' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();

          // API gibt Results.Items[].World zurück (alles kapitalisiert)
          const raw  = json.Results?.Items || [];
          const hits = raw.map(i => i.World).filter(Boolean).slice(0, 8);

          if (!hits.length) {
            suggestEl.innerHTML = '<div class="loc-suggest-empty">Kein Treffer im Traveller-Universum</div>';
            return;
          }

          // Hex-String aus HexX + HexY zusammensetzen (z.B. 17,29 → "1729")
          const hexStr = h => String(h.HexX).padStart(2,'0') + String(h.HexY).padStart(2,'0');

          suggestEl.innerHTML = hits.map(h => `
            <div class="loc-suggest-item"
                 data-name="${this._esc(h.Name)}"
                 data-sector="${this._esc(h.Sector || '')}"
                 data-uwp="${this._esc(h.Uwp || '')}"
                 data-hex="${hexStr(h)}"
                 data-sectorx="${h.SectorX ?? ''}"
                 data-sectory="${h.SectorY ?? ''}">
              <strong>${this._esc(h.Name)}</strong>
              <span>${this._esc(h.Sector || '')} · ${hexStr(h)}${h.Uwp ? ' · ' + this._esc(h.Uwp) : ''}</span>
            </div>`).join('');

          suggestEl.querySelectorAll('.loc-suggest-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
              e.preventDefault();
              nameInput.value = item.dataset.name;
              const sectorEl = document.getElementById('locSector');
              const uwpEl    = document.getElementById('locUwp');
              if (sectorEl) sectorEl.value = item.dataset.sector;
              if (uwpEl)    uwpEl.value    = item.dataset.uwp;
              if (mapXInput)   mapXInput.value   = item.dataset.sectorx;
              if (mapYInput)   mapYInput.value   = item.dataset.sectory;
              if (mapSecInput) mapSecInput.value = item.dataset.sector;
              if (mapHexInput) mapHexInput.value = item.dataset.hex;
              closeSuggestions();

              const existing = document.getElementById('locMapBadge');
              if (existing) existing.remove();
              const badge = document.createElement('div');
              badge.id        = 'locMapBadge';
              badge.className = 'loc-map-badge';
              badge.innerHTML = `🗺 Verknüpft: ${this._esc(item.dataset.sector)} ${this._esc(item.dataset.hex)}
                <button class="loc-map-unlink" id="locMapUnlink">× Entfernen</button>`;
              nameInput.closest('.form-group').appendChild(badge);
              document.getElementById('locMapUnlink')?.addEventListener('click', clearLink);
            });
          });
        } catch (e) {
          suggestEl.innerHTML = `<div class="loc-suggest-empty">⚠️ Travellermap nicht erreichbar – bitte Internetverbindung prüfen</div>`;
        }
      }, 350);
    });

    nameInput.addEventListener('blur', () => setTimeout(closeSuggestions, 200));

    document.getElementById('locMapUnlink')?.addEventListener('click', clearLink);
  },

  _attachLocTravSearch() {
    const input     = document.getElementById('locTravSearch');
    const suggestEl = document.getElementById('locTravSuggestions');
    if (!input || !suggestEl) return;

    const savedSet = new Set(JSON.parse(suggestEl.dataset.saved || '[]'));
    let timer = null;

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(timer);
      suggestEl.innerHTML = '';
      if (q.length < 2) return;
      suggestEl.innerHTML = '<div class="loc-suggest-loading">⏳ Suche in Travellermap …</div>';
      timer = setTimeout(async () => {
        try {
          const res  = await fetch(`https://travellermap.com/api/search?q=${encodeURIComponent(q)}`, { mode: 'cors' });
          if (!res.ok) throw new Error();
          const json = await res.json();
          const raw  = json.Results?.Items || [];
          const hits = raw.map(i => this._parseTravellermapHit(i)).filter(Boolean).slice(0, 8);
          if (!hits.length) {
            suggestEl.innerHTML = '<div class="loc-suggest-empty">Kein Treffer</div>';
            return;
          }
          suggestEl.innerHTML = hits.map((h, i) => {
            const key      = `${h.sector}|${h.hex}`;
            const isSaved  = h.type === 'world' && savedSet.has(key);
            const actionHtml = App.editMode
              ? `<button class="loc-trav-action ${isSaved ? 'saved' : 'add'}" data-idx="${i}">
                   ${isSaved ? '→ Anzeigen' : '+ Hinzufügen'}
                 </button>`
              : (isSaved ? `<span class="loc-trav-saved-badge">✓ Gespeichert</span>` : '');
            return `<div class="loc-suggest-item loc-trav-item" data-idx="${i}">
              <div class="loc-trav-item-info">
                <strong>${h.icon} ${this._esc(h.name)}</strong>
                <span>${this._esc(h.sublabel)}</span>
              </div>
              ${actionHtml}
            </div>`;
          }).join('');
          suggestEl._hits = hits;

          // Action buttons
          suggestEl.querySelectorAll('.loc-trav-action').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const hit  = suggestEl._hits?.[parseInt(btn.dataset.idx)];
              if (!hit) return;
              suggestEl.innerHTML = '';
              input.value = '';

              if (btn.classList.contains('saved')) {
                // Navigate to the existing saved location
                const data = this._d(App.currentCharacter);
                const key  = `${hit.sector}|${hit.hex}`;
                const loc  = data.locations.find(l => l.mapSector === hit.sector && l.mapHex === hit.hex);
                if (loc) { this._detailId = loc.id; App.renderCurrentPage(); }
              } else {
                // Pre-fill new location form
                this._prefillLocation = {
                  name: hit.name, sector: hit.sector, uwp: hit.uwp || '',
                  mapSector: hit.sector, mapHex: hit.hex,
                  mapX: null, mapY: null,
                };
                this._detailId = 'new';
                App.renderCurrentPage();
              }
            });
          });
        } catch {
          suggestEl.innerHTML = '<div class="loc-suggest-empty">⚠️ Travellermap nicht erreichbar</div>';
        }
      }, 320);
    });

    input.addEventListener('blur', () => setTimeout(() => { suggestEl.innerHTML = ''; }, 200));
  },
});
