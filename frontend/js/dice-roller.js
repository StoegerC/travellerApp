/**
 * DiceRoller – jederzeit erreichbares Würfel-Widget (XdY+Z), systemunabhängig
 * (Kern, kein Regelwerk-Code). Konzept + Entscheidungen siehe Todo.txt
 * (UI/UX-Abschnitt) — Zielwert/Effekt-Ebene bewusst NICHT eingebaut (User-
 * Entscheidung), Verlauf/letzte Eingabe pro Charakter, rein lokal.
 *
 * Datenhaltung bewusst NICHT im Charakter-Modell: ein Würfelwurf ist ein
 * flüchtiges Tischereignis, kein synchronisationswürdiger Blattinhalt. State
 * lebt in localStorage unter einem pro Charakter-ID eigenen Schlüssel und
 * wird bei jedem open() frisch geladen — kein Zustand, der zwischen
 * Charakterwechseln aktiv gehalten werden müsste.
 *
 * Vorbereitet für eine spätere Schadenswurf-Integration (z.B. ein 🎲-Symbol
 * neben dem Schaden-Feld einer Waffe in equipment.js): openWith(notation)
 * öffnet das Widget direkt mit einer vorgegebenen Notation. Noch nirgends
 * aufgerufen — reine Vorbereitung, kein aktives Feature.
 */
const DiceRoller = {
  _MAX_HISTORY: 5,
  _state: null,     // { count, sides, mod, history: [...] } des gerade offenen Charakters
  _rolling: false,

  _key(charId) { return `traveller_dice_${charId}`; },

  _clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

  _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  // "2d6+3", "D6", "3d6-1" - grosszuegig gegenueber Gross-/Kleinschreibung
  // und fehlendem fuehrendem "1". null bei ungueltiger Eingabe (der Aufrufer
  // faellt dann auf den zuletzt gueltigen Zustand zurueck statt zu werfen -
  // am Spieltisch soll nichts wegen eines Tippfehlers haengen bleiben).
  _parse(str) {
    const m = String(str).trim().match(/^(\d*)[dD](\d+)\s*([+-]\s*\d+)?$/);
    if (!m) return null;
    const count = m[1] ? parseInt(m[1], 10) : 1;
    const sides = parseInt(m[2], 10);
    const mod   = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
    return {
      count: this._clamp(count, 1, 50),
      sides: this._clamp(sides, 2, 1000),
      mod:   this._clamp(mod, -99, 99),
    };
  },

  _notation(s = this._state) {
    const m = s.mod;
    return `${s.count}D${s.sides}${m > 0 ? '+' + m : (m < 0 ? m : '')}`;
  },

  // Default-Notation des aktiven Regelsystems (Manifest-Schlüssel diceDefault,
  // z.B. MGT2 "2D6") mit Kern-Fallback fuer Systeme ohne eigene Angabe.
  _defaultNotation() {
    return App._system?.().diceDefault || '2D6';
  },

  _load(charId) {
    try {
      const raw = localStorage.getItem(this._key(charId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.count === 'number') {
          parsed.history = Array.isArray(parsed.history) ? parsed.history : [];
          return parsed;
        }
      }
    } catch { /* korrupter/fremder Wert - auf Default zurueckfallen */ }
    const d = this._parse(this._defaultNotation()) || { count: 2, sides: 6, mod: 0 };
    return { ...d, history: [] };
  },

  _save(charId) {
    try { localStorage.setItem(this._key(charId), JSON.stringify(this._state)); } catch { /* z.B. privater Modus ohne Storage-Zugriff - Wurf funktioniert trotzdem, nur ohne Persistenz */ }
  },

  // ── Sichtbarkeit des Auslöse-Buttons ─────────────────────────────────────
  // Kein Charakter geladen (Willkommens-Dialog) -> Button ausblenden, es gibt
  // noch keine Charakter-ID, unter der ein Verlauf abgelegt werden koennte.
  updateVisibility() {
    const fab = document.getElementById('diceFab');
    if (fab) fab.style.display = App.currentCharacter ? '' : 'none';
  },

  // ── Öffnen / Schließen ────────────────────────────────────────────────────
  init() {
    const fab = document.getElementById('diceFab');
    fab?.addEventListener('click', () => {
      // Rein dekorative Dreh-Animation beim Öffnen — symbolisiert das
      // Würfeln schon beim Antippen des Buttons, nicht erst beim Wurf selbst.
      fab.classList.remove('spin');
      void fab.offsetWidth; // Reflow erzwingen, damit die Animation bei schnellem Doppel-Tap neu startet
      fab.classList.add('spin');
      this.open();
    });
    // Klick auf den Hintergrund (nicht das Sheet selbst) schließt, wie bei
    // einem nativen Bottom-Sheet üblich.
    document.getElementById('diceOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'diceOverlay') this.close();
    });
    this.updateVisibility();
  },

  open() {
    const char = App.currentCharacter;
    if (!char) return;
    this._state = this._load(char.id);
    this._resultVisible = false;
    document.getElementById('diceOverlay')?.classList.add('open');
    this._render();
  },

  // Für eine künftige Schadenswurf-Integration vorbereitet (siehe Datei-
  // Kommentar) — öffnet direkt mit einer vorgegebenen Notation.
  openWith(notation) {
    const char = App.currentCharacter;
    if (!char) return;
    this._state = this._load(char.id);
    const parsed = this._parse(notation);
    if (parsed) Object.assign(this._state, parsed);
    this._resultVisible = false;
    document.getElementById('diceOverlay')?.classList.add('open');
    this._render();
  },

  close() {
    document.getElementById('diceOverlay')?.classList.remove('open');
  },

  // ── Render ────────────────────────────────────────────────────────────────
  _historyHtml() {
    const history = this._state.history;
    if (!history.length) return '<p class="dice-history-empty">Noch keine Würfe.</p>';
    return history.map((h, i) => `
      <div class="dice-history-item" data-idx="${i}">
        <span class="dice-history-notation">${this._esc(h.notation)}</span>
        <span class="dice-history-total">${h.total}</span>
      </div>`).join('');
  },

  _attachHistoryListeners() {
    document.querySelectorAll('.dice-history-item').forEach(item => {
      item.addEventListener('click', () => {
        const h = this._state.history[parseInt(item.dataset.idx, 10)];
        if (!h) return;
        const parsed = this._parse(h.notation);
        if (parsed) Object.assign(this._state, parsed);
        this._refreshSteppers();
      });
    });
  },

  _render() {
    const el = document.getElementById('diceModalContent');
    if (!el) return;
    const s = this._state;

    el.innerHTML = `
      <div class="dice-modal-head">
        <h3>Würfelwurf</h3>
        <button class="dice-modal-close" id="diceCloseInner" aria-label="Schließen">✕</button>
      </div>

      <div class="dice-notation-display" id="notationDisplay" title="Antippen für Direkteingabe">${this._esc(this._notation())}</div>
      <input class="dice-notation-edit" id="notationEdit" inputmode="text" placeholder="z.B. 2D6+3" style="display:none">

      <div class="stepper-row">
        <div class="stepper-group">
          <span class="stepper-label">Anzahl</span>
          <div class="stepper-controls">
            <button class="stepper-btn" data-action="count-minus" aria-label="Anzahl verringern">−</button>
            <span class="stepper-val" id="countVal">${s.count}</span>
            <button class="stepper-btn" data-action="count-plus" aria-label="Anzahl erhöhen">+</button>
          </div>
        </div>
        <span class="stepper-sep">D</span>
        <div class="stepper-group">
          <span class="stepper-label">Seiten</span>
          <div class="stepper-controls">
            <button class="stepper-btn" data-action="sides-minus" aria-label="Seiten verringern">−</button>
            <span class="stepper-val" id="sidesVal">${s.sides}</span>
            <button class="stepper-btn" data-action="sides-plus" aria-label="Seiten erhöhen">+</button>
          </div>
        </div>
        <span class="stepper-sep">+</span>
        <div class="stepper-group">
          <span class="stepper-label">Modifikator</span>
          <div class="stepper-controls">
            <button class="stepper-btn" data-action="mod-minus" aria-label="Modifikator verringern">−</button>
            <span class="stepper-val" id="modVal">${s.mod > 0 ? '+' + s.mod : s.mod}</span>
            <button class="stepper-btn" data-action="mod-plus" aria-label="Modifikator erhöhen">+</button>
          </div>
        </div>
      </div>

      <button class="dice-roll-btn" id="rollBtn">🎲 Würfeln</button>

      <div class="dice-result" id="resultBox">
        <div class="dice-result-dice" id="resultDice"></div>
        <div class="dice-result-sum" id="resultSum"></div>
        <div class="dice-result-total" id="resultTotal"></div>
      </div>

      <h4 class="dice-history-title">Letzte Würfe</h4>
      <div class="dice-history-list" id="historyList">${this._historyHtml()}</div>
    `;
    this._attachListeners();
  },

  _refreshSteppers() {
    const s = this._state;
    document.getElementById('notationDisplay').textContent = this._notation();
    document.getElementById('countVal').textContent = s.count;
    document.getElementById('sidesVal').textContent = s.sides;
    document.getElementById('modVal').textContent = s.mod > 0 ? '+' + s.mod : s.mod;
  },

  _attachListeners() {
    document.getElementById('diceCloseInner')?.addEventListener('click', () => this.close());

    document.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = this._state;
        switch (btn.dataset.action) {
          case 'count-minus': s.count = this._clamp(s.count - 1, 1, 50); break;
          case 'count-plus':  s.count = this._clamp(s.count + 1, 1, 50); break;
          case 'sides-minus': s.sides = this._clamp(s.sides - 1, 2, 1000); break;
          case 'sides-plus':  s.sides = this._clamp(s.sides + 1, 2, 1000); break;
          case 'mod-minus':   s.mod   = this._clamp(s.mod - 1, -99, 99); break;
          case 'mod-plus':    s.mod   = this._clamp(s.mod + 1, -99, 99); break;
        }
        this._refreshSteppers();
      });
    });

    const display = document.getElementById('notationDisplay');
    const edit     = document.getElementById('notationEdit');
    display.addEventListener('click', () => {
      edit.value = this._notation();
      display.style.display = 'none';
      edit.style.display = 'block';
      edit.focus();
      edit.select();
    });
    const commitEdit = () => {
      const parsed = this._parse(edit.value);
      if (parsed) Object.assign(this._state, parsed);
      edit.style.display = 'none';
      display.style.display = 'block';
      this._refreshSteppers();
    };
    edit.addEventListener('blur', commitEdit);
    edit.addEventListener('keydown', e => { if (e.key === 'Enter') edit.blur(); });

    this._attachHistoryListeners();

    document.getElementById('rollBtn')?.addEventListener('click', () => this._roll());
  },

  // ── Würfeln + Animation ───────────────────────────────────────────────────
  // Ergebnis steht sofort fest (deterministische Logik/Verlauf, unabhängig von
  // der Animationsdauer) - die Animation verzögert nur, WANN die echten Zahlen
  // sichtbar werden, und blendet bis dahin schnell wechselnde Platzhalter ein.
  // prefers-reduced-motion: reduce -> Ergebnis sofort ohne Flacker-Effekt.
  _roll() {
    if (this._rolling) return;
    const s = this._state;

    const dice = [];
    for (let i = 0; i < s.count; i++) dice.push(1 + Math.floor(Math.random() * s.sides));
    const sum   = dice.reduce((a, b) => a + b, 0);
    const total = sum + s.mod;
    const notation = this._notation();

    const rollBtn     = document.getElementById('rollBtn');
    const resultBox    = document.getElementById('resultBox');
    const resultDice   = document.getElementById('resultDice');
    const resultSum    = document.getElementById('resultSum');
    const resultTotal  = document.getElementById('resultTotal');

    const finish = () => {
      resultDice.innerHTML = dice.map(d => `<span class="die-chip landed">${d}</span>`).join('');
      resultSum.textContent = dice.length > 1 || s.mod
        ? dice.join(' + ') + (s.mod ? ` ${s.mod > 0 ? '+ ' + s.mod : '− ' + Math.abs(s.mod)}` : '')
        : '';
      resultTotal.textContent = total;
      resultBox.classList.add('show');
      this._rolling = false;
      rollBtn.disabled = false;

      s.history.unshift({ notation, dice, total });
      if (s.history.length > this._MAX_HISTORY) s.history.length = this._MAX_HISTORY;
      this._save(App.currentCharacter.id);
      document.getElementById('historyList').innerHTML = this._historyHtml();
      this._attachHistoryListeners();
    };

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) { finish(); return; }

    this._rolling = true;
    rollBtn.disabled = true;
    resultBox.classList.add('show');
    resultSum.textContent = '';
    resultTotal.textContent = '';

    // Flacker-Phase: Platzhalter-Zahlen, die schnell durchwechseln, plus eine
    // Schüttel-Animation je Würfel (siehe .die-chip.rolling in styles.css).
    resultDice.innerHTML = dice.map(() => `<span class="die-chip rolling">${1 + Math.floor(Math.random() * s.sides)}</span>`).join('');
    const flicker = setInterval(() => {
      document.querySelectorAll('#resultDice .die-chip').forEach(chip => {
        chip.textContent = 1 + Math.floor(Math.random() * s.sides);
      });
    }, 70);

    setTimeout(() => {
      clearInterval(flicker);
      finish();
    }, 550);
  },
};
