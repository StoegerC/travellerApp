/**
 * Karte – Travellermap-Integration als eigener Tab
 */
const KartePage = {
  _mapFocusId:       null,
  _mapScrollHandler: null,
  _mapResizeHandler: null,

  render(character) {
    const data    = character.notes || { locations: [] };
    const linked  = (data.locations || []).filter(l => l.mapX != null);
    return `<h2>Karte</h2>
    <div class="map-view">
      <div class="map-search-bar">
        <div class="map-search-wrap">
          <span class="map-search-icon">🔍</span>
          <input type="search" id="mapSearch" class="map-search-input"
                 placeholder="Planet oder System suchen …"
                 autocomplete="off" spellcheck="false">
          <div id="mapSearchSuggestions" class="map-suggestions"></div>
        </div>
      </div>
      <div id="mapIframeSlot" class="traveller-map-iframe"></div>
      <div id="mapWorldInfo" class="map-world-info" style="display:none"></div>
      <div class="map-loc-bar">
        ${linked.length
          ? linked.map(l => `
              <button class="map-loc-chip"
                      data-sector="${this._esc(l.mapSector || '')}"
                      data-hex="${this._esc(l.mapHex || '')}"
                      data-name="${this._esc(l.name)}"
                      data-uwp="${this._esc(l.uwp || '')}"
                      title="${this._esc(l.sector || '')}">
                ${this._esc(l.name)}${l.uwp ? ` <code>${this._esc(l.uwp)}</code>` : ''}
              </button>`).join('')
          : `<span class="map-bar-hint">Orte über "📝 Log" → "🌍 Orte" → "Auf Karte verknüpfen" hinzufügen</span>`
        }
      </div>
    </div>`;
  },

  save() {},

  attachListeners() {
    document.querySelectorAll('.map-loc-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const frame = document.getElementById('travellerMapFrame');
        if (frame) frame.src = `https://travellermap.com/?sector=${encodeURIComponent(chip.dataset.sector)}&hex=${chip.dataset.hex}&scale=64&style=poster&options=87046`;
        document.querySelectorAll('.map-loc-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this._showMapWorldInfo({ type: 'world', icon: '🌐', name: chip.dataset.name, sector: chip.dataset.sector, hex: chip.dataset.hex, uwp: chip.dataset.uwp, navScale: 64 });
      });
    });

    this._attachMapSearch();
    this._initMapIframe();
  },

  // ── iframe-Lifecycle ─────────────────────────────────────────────────────

  hideMapIframe() {
    const host = document.getElementById('map-iframe-host');
    if (host) host.style.display = 'none';
    const content = document.querySelector('.content');
    if (this._mapScrollHandler) {
      content?.removeEventListener('scroll', this._mapScrollHandler);
      window.removeEventListener('resize', this._mapResizeHandler);
      this._mapScrollHandler = null;
      this._mapResizeHandler = null;
    }
  },

  _syncMapPos() {
    const slot = document.getElementById('mapIframeSlot');
    const host = document.getElementById('map-iframe-host');
    if (!slot || !host) { this.hideMapIframe(); return; }
    const r = slot.getBoundingClientRect();
    Object.assign(host.style, {
      display: 'block',
      top:    Math.round(r.top)    + 'px',
      left:   '0',
      width:  '100vw',
      height: Math.round(r.height) + 'px',
    });
  },

  _initMapIframe() {
    const iframe = document.getElementById('travellerMapFrame');
    if (!iframe) return;
    const DEFAULT = 'https://travellermap.com/?sector=Spinward+Marches&hex=1910&scale=32&style=poster&options=87046';

    if (this._mapFocusId) {
      const data  = window.currentCharacter?.notes || { locations: [] };
      const focus = (data.locations || []).find(l => l.id === this._mapFocusId);
      this._mapFocusId = null;
      if (focus?.mapSector && focus?.mapHex) {
        iframe.src = `https://travellermap.com/?sector=${encodeURIComponent(focus.mapSector)}&hex=${focus.mapHex}&scale=64&style=poster&options=87046`;
      }
    } else if (!iframe.src || iframe.src === 'about:blank') {
      iframe.src = DEFAULT;
    }

    const content = document.querySelector('.content');
    if (this._mapScrollHandler) {
      content?.removeEventListener('scroll', this._mapScrollHandler);
      window.removeEventListener('resize', this._mapResizeHandler);
    }
    const sync = () => this._syncMapPos();
    this._mapScrollHandler = sync;
    this._mapResizeHandler = sync;
    content?.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    sync();
  },

  // ── Suche & Welteninfo ───────────────────────────────────────────────────

  _attachMapSearch() {
    const input     = document.getElementById('mapSearch');
    const suggestEl = document.getElementById('mapSearchSuggestions');
    if (!input || !suggestEl) return;
    let timer = null;

    const selectResult = (result) => {
      input.value = result.name;
      suggestEl.innerHTML = '';
      const frame = document.getElementById('travellerMapFrame');
      if (frame && result.sector) {
        let url = `https://travellermap.com/?sector=${encodeURIComponent(result.sector)}&scale=${result.navScale}&style=poster&options=87046`;
        if (result.hex) url += `&hex=${result.hex}`;
        frame.src = url;
      }
      this._showMapWorldInfo(result);
      document.querySelectorAll('.map-loc-chip').forEach(c => c.classList.remove('active'));
    };

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(timer);
      suggestEl.innerHTML = '';
      if (q.length < 2) return;
      suggestEl.innerHTML = '<div class="loc-suggest-loading">⏳ Suche in Travellermap …</div>';
      timer = setTimeout(async () => {
        try {
          const res  = await fetch(`https://travellermap.com/api/search?q=${encodeURIComponent(q)}`, { mode: 'cors' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const raw  = json.Results?.Items || [];
          const hits = raw.map(i => this._parseTravellermapHit(i)).filter(Boolean).slice(0, 10);
          if (!hits.length) {
            suggestEl.innerHTML = '<div class="loc-suggest-empty">Kein Treffer</div>';
            return;
          }
          suggestEl.innerHTML = hits.map((h, i) => `
            <div class="loc-suggest-item map-suggest-item" data-idx="${i}">
              <strong>${h.icon} ${this._esc(h.name)}</strong>
              <span>${this._esc(h.sublabel)}</span>
            </div>`).join('');
          suggestEl._hits = hits;
          suggestEl.querySelectorAll('.map-suggest-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
              e.preventDefault();
              const hit = suggestEl._hits?.[parseInt(item.dataset.idx)];
              if (hit) selectResult(hit);
            });
          });
        } catch {
          suggestEl.innerHTML = '<div class="loc-suggest-empty">⚠️ Travellermap nicht erreichbar</div>';
        }
      }, 320);
    });

    input.addEventListener('blur', () => setTimeout(() => { suggestEl.innerHTML = ''; }, 200));
  },

  _showMapWorldInfo(result) {
    const el = document.getElementById('mapWorldInfo');
    if (!el) return;
    const uwp        = result.type === 'world' ? this._decodeUWP(result.uwp) : null;
    const TYPE_LABEL = { world: 'System', sector: 'Sektor', subsector: 'Teilsektor' };
    const typeLabel  = TYPE_LABEL[result.type] || '';
    const locParts   = [typeLabel];
    if (result.sector && result.type !== 'sector') locParts.push(this._esc(result.sector));
    if (result.hex)    locParts.push(this._esc(result.hex));

    el.style.display = 'block';
    el.innerHTML = `
      <div class="map-wi-header">
        <div class="map-wi-name">
          <strong>${result.icon || ''} ${this._esc(result.name)}</strong>
          <span class="map-wi-loc">${locParts.join(' · ')}</span>
        </div>
        ${result.uwp ? `<code class="map-wi-uwp">${this._esc(result.uwp)}</code>` : ''}
        <button class="map-wi-close" id="mapWiClose">✕</button>
      </div>
      ${uwp ? `<div class="map-wi-stats">
        <span title="Raumhafen">🚀 ${this._esc(uwp.starport)}</span>
        <span title="Planetengröße">🌍 ${this._esc(uwp.size)}</span>
        <span title="Atmosphäre">💨 ${this._esc(uwp.atmosphere)}</span>
        <span title="Hydrosphäre">💧 ${this._esc(uwp.hydrosphere)}</span>
        <span title="Bevölkerung">👥 ${this._esc(uwp.population)}</span>
        <span title="Regierung">🏛 ${this._esc(uwp.government)}</span>
        <span title="Gesetzesstufe">⚖️ Gesetz ${this._esc(uwp.lawLevel)}</span>
        <span title="Technologiestufe">🔧 ${this._esc(uwp.techLevel)}</span>
      </div>` : ''}`;
    document.getElementById('mapWiClose')?.addEventListener('click', () => {
      el.style.display = 'none';
      document.querySelectorAll('.map-loc-chip').forEach(c => c.classList.remove('active'));
    });
  },

  // ── Hilfsmethoden ────────────────────────────────────────────────────────

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

  _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },
};
