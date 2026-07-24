/**
 * Werte – Charakteristiken, Ressourcen (Trefferpunkte/Willenskraft/Sanity/
 * Luck) und Fertigkeiten für Delta Green.
 *
 * Fertigkeiten bewusst als freie Name+Wert-Liste (CoreWidgets.renderValueList,
 * wie beim Universal-Template) statt eines fest hinterlegten Skill-Katalogs
 * wie MGT2s data/skills.js — so wird keine Delta-Green-Fertigkeitsliste aus
 * dem Regelwerk in den Code übernommen, und Hausregeln/Editionen mit
 * abweichenden Listen funktionieren genauso.
 *
 * Maximalwerte (Trefferpunkte/Willenskraft/Sanity/Luck) und der Breaking
 * Point werden bewusst NICHT aus den Charakteristiken hergeleitet — kein
 * eingebautes Formel-Wissen über ein fremdes Regelwerk, das diese App nicht
 * verifizieren kann. Spielende tragen sie manuell ein, genau wie auf dem
 * gedruckten Bogen; nur der aktuelle Wert bekommt einen Zähler zum
 * schnellen Anpassen am Tisch (CoreWidgets.attachCounter, wie MGT2s
 * Attribut-Karten/Helden-XP — hier an einem zweiten, unabhängigen System
 * erprobt).
 *
 * Datenpfad: character.systemData.characteristics/hitPoints/willpower/
 * sanity/luck/skills (Namespace-Regel, kein Feld überschreibt MGT2s
 * gleichnamige Top-Level-Felder).
 */
const DgStatsPage = {
  _CHARACTERISTICS: [
    { key: 'str', label: 'STR' }, { key: 'con', label: 'CON' }, { key: 'dex', label: 'DEX' },
    { key: 'int', label: 'INT' }, { key: 'pow', label: 'POW' }, { key: 'cha', label: 'CHA' },
  ],
  _POOLS: {
    hp:   { field: 'hitPoints', label: 'Trefferpunkte' },
    wp:   { field: 'willpower', label: 'Willenskraft' },
    san:  { field: 'sanity',    label: 'Sanity' },
    luck: { field: 'luck',      label: 'Luck' },
  },

  _characteristics(char) {
    return char.systemData.characteristics
      || (char.systemData.characteristics = { str: 0, con: 0, dex: 0, int: 0, pow: 0, cha: 0 });
  },
  _pool(char, field, defaults) {
    return char.systemData[field] || (char.systemData[field] = { ...defaults });
  },
  _hitPoints(char) { return this._pool(char, 'hitPoints', { current: 10, max: 10 }); },
  _willpower(char) { return this._pool(char, 'willpower', { current: 10, max: 10 }); },
  _sanity(char)    { return this._pool(char, 'sanity',    { current: 50, max: 50, breakingPoint: 40 }); },
  _luck(char)      { return this._pool(char, 'luck',      { current: 50, max: 50 }); },
  _skills(char)    { return char.systemData.skills || (char.systemData.skills = []); },

  render(character) {
    const chars = this._characteristics(character);
    const pools = { hp: this._hitPoints(character), wp: this._willpower(character), san: this._sanity(character), luck: this._luck(character) };

    return `<div class="dg-stats-page">
      <div class="dg-block">
        <h3 class="dg-block-title">Charakteristiken</h3>
        <div class="dg-char-grid">
          ${this._CHARACTERISTICS.map(c => this._renderCharacteristic(c, chars[c.key])).join('')}
        </div>
      </div>

      <div class="dg-block">
        <h3 class="dg-block-title">Ressourcen</h3>
        <div class="dg-pool-grid">
          ${Object.entries(this._POOLS).map(([prefix, meta]) => this._renderPool(prefix, meta.label, pools[prefix])).join('')}
          ${this._renderBreakingPoint(pools.san)}
        </div>
      </div>

      <div class="dg-block">
        ${CoreWidgets.renderValueList(this._skills(character), {
          title: 'Fertigkeiten', idPrefix: 'dgSkill',
          namePlaceholder: 'z.B. Firearms', valuePlaceholder: 'z.B. 40%', addLabel: '+ Fertigkeit',
        })}
      </div>
    </div>`;
  },

  _renderCharacteristic(c, value) {
    if (App.editMode) {
      return `<div class="dg-char-cell">
        <label class="dg-char-label" for="dgChar-${c.key}">${c.label}</label>
        <input type="number" class="dg-char-input" id="dgChar-${c.key}" value="${value}" min="0" max="99">
      </div>`;
    }
    return `<div class="dg-char-cell">
      <span class="dg-char-label">${c.label}</span>
      <span class="dg-char-value">${value}</span>
    </div>`;
  },

  _renderPool(prefix, label, pool) {
    return `<div class="dg-pool">
      <span class="stepper-label">${label}</span>
      <div class="stepper-controls">
        <button class="stepper-btn" id="dg${prefix}Minus" aria-label="${label} verringern">−</button>
        <span class="stepper-val" id="dg${prefix}Value">${pool.current}</span>
        <span class="dg-pool-sep">/</span>
        ${App.editMode
          ? `<input type="number" class="dg-pool-max-input" id="dg${prefix}Max" value="${pool.max}" min="0">`
          : `<span class="dg-pool-max">${pool.max}</span>`}
        <button class="stepper-btn" id="dg${prefix}Plus" aria-label="${label} erhöhen">+</button>
      </div>
    </div>`;
  },

  _renderBreakingPoint(san) {
    return `<div class="dg-pool">
      <span class="stepper-label">Breaking Point</span>
      ${App.editMode
        ? `<input type="number" class="dg-pool-max-input" id="dgSanBreak" value="${san.breakingPoint || 0}" min="0">`
        : `<span class="dg-pool-max">${san.breakingPoint || 0}</span>`}
    </div>`;
  },

  save(character) {
    const chars = this._characteristics(character);
    this._CHARACTERISTICS.forEach(c => {
      const el = document.getElementById(`dgChar-${c.key}`);
      if (el) chars[c.key] = parseInt(el.value) || 0;
    });
    Object.entries(this._POOLS).forEach(([prefix, meta]) => {
      const el = document.getElementById(`dg${prefix}Max`);
      if (el) this._pool(character, meta.field, {}).max = parseInt(el.value) || 0;
    });
    const breakEl = document.getElementById('dgSanBreak');
    if (breakEl) this._sanity(character).breakingPoint = parseInt(breakEl.value) || 0;
  },

  attachListeners() {
    const char = window.currentCharacter;
    // Nur bei strukturellen Änderungen (Fertigkeit hinzufügen/löschen) nötig
    // — ein reiner Zähler-Klick speichert direkt ohne Rerender, ein Feld-
    // Blur in der Fertigkeiten-Liste ebenso (siehe core-widgets.js).
    const rerender = () => {
      document.getElementById('stats-page').innerHTML = this.render(char);
      this.attachListeners();
    };

    // Auto-Save on Blur für Charakteristiken/Maximalwerte (wie
    // career-background.js' .cr-bg-field): schreibt direkt ins Modell statt
    // erst bei App._doSave() beim Seitenwechsel. Notwendig, weil ein Klick
    // auf "+ Fertigkeit" weiter unten die ganze Seite neu rendert (structural
    // rerender) — ohne Blur-Save würde das jeden noch nicht gespeicherten
    // Eintrag in diesen Feldern stillschweigend verwerfen.
    const chars = this._characteristics(char);
    this._CHARACTERISTICS.forEach(c => {
      const el = document.getElementById(`dgChar-${c.key}`);
      el?.addEventListener('blur', () => {
        chars[c.key] = parseInt(el.value) || 0;
        Storage.saveCharacter(char);
      });
    });

    Object.entries(this._POOLS).forEach(([prefix, meta]) => {
      const pool = this._pool(char, meta.field, {});
      CoreWidgets.attachCounter({
        valueId: `dg${prefix}Value`, minusId: `dg${prefix}Minus`, plusId: `dg${prefix}Plus`,
        value: pool.current, min: 0, max: pool.max,
      }, newValue => {
        pool.current = newValue;
        Storage.saveCharacter(char);
      });

      // Bewusst KEIN Rerender hier (anders als beim Hinzufügen/Löschen einer
      // Fertigkeit weiter unten): ein Blur kann mitten in einem
      // Fokuswechsel zum nächsten Feld auftreten (z.B. Tab zur nächsten
      // Ressource) — ein synchrones innerHTML in diesem Moment würde mit dem
      // noch laufenden Fokuswechsel kollidieren (führte zu "node to be
      // removed is no longer a child of this node" beim Testen). Folge: der
      // ±-Zähler übernimmt eine neu eingetragene Obergrenze erst nach dem
      // nächsten echten Rerender (Tab-Wechsel) — reiner Anzeige-Nachlauf,
      // der Wert selbst ist ab hier bereits korrekt gespeichert.
      const maxEl = document.getElementById(`dg${prefix}Max`);
      maxEl?.addEventListener('blur', () => {
        pool.max = parseInt(maxEl.value) || 0;
        Storage.saveCharacter(char);
      });
    });

    const san = this._sanity(char);
    const breakEl = document.getElementById('dgSanBreak');
    breakEl?.addEventListener('blur', () => {
      san.breakingPoint = parseInt(breakEl.value) || 0;
      Storage.saveCharacter(char);
    });

    CoreWidgets.attachValueList(char, this._skills(char), { idPrefix: 'dgSkill' }, rerender);
  },
};
