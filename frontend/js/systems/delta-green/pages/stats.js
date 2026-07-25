/**
 * Werte – Charakteristiken, Ressourcen (Trefferpunkte/Willenskraft/Sanity/
 * Luck), Fertigkeiten und Störungen (Disorders) für Delta Green.
 *
 * Fertigkeiten UND Störungen bewusst als freie Name+Wert-Liste statt eines
 * fest hinterlegten Katalogs wie MGT2s data/skills.js — so wird keine
 * Delta-Green-Fertigkeits-/Störungsliste aus dem Regelwerk in den Code
 * übernommen, und Hausregeln/Editionen mit abweichenden Listen
 * funktionieren genauso. Störungen nutzen weiterhin
 * CoreWidgets.renderValueList (Wert-Feld trägt Auslöser/Notiz statt eines
 * Prozentwerts). Fertigkeiten haben seit 25.07.2026 (User-Wunsch) ein
 * eigenes, bespoke Rendering statt CoreWidgets.renderValueList — 3-spaltige
 * Darstellung, Checkbox+Name+Wert je Zeile, Klemmen-Dialog beim Ankreuzen
 * (siehe _renderSkillsBlock()/_attachSkillsListeners()/_openSkillDialog()
 * unten). Bewusst NICHT in CoreWidgets verallgemeinert — dieses
 * Checkbox-Dialog-Muster ist eine sehr spezifische Delta-Green-Hausregel
 * (Fehlschlag ankreuzen, nach der Sitzung 1D4 addieren), kein
 * wiederverwendbares Kern-Konzept wie die einfache Name+Wert-Liste.
 *
 * Maximalwerte (Trefferpunkte/Willenskraft/Sanity/Luck) und der Breaking
 * Point bleiben weiterhin frei editierbar statt automatisch gesetzt — seit
 * 25.07.2026 zeigt die App zwar einen abgeleiteten Richtwert daneben (s.u.),
 * setzt ihn aber nicht selbst ein, damit abweichende Werte (Verletzungen,
 * Hausregeln, Rundungsvarianten) jederzeit möglich bleiben, genau wie auf
 * dem gedruckten Bogen. Der aktuelle Wert bekommt einen Zähler zum
 * schnellen Anpassen am Tisch (CoreWidgets.attachCounter, wie MGT2s
 * Attribut-Karten/Helden-XP — hier an einem zweiten, unabhängigen System
 * erprobt).
 *
 * Charakteristiken bekommen zusätzlich zwei abgeleitete Zeilen (User-Wunsch
 * 25.07.2026): ein automatisch berechnetes "x5"-Feld (Attributswert × 5,
 * rein abgeleitet — nicht gespeichert, bei jeder Eingabe live neu
 * berechnet) und ein freier Beschreibungstext je Attribut
 * (character.systemData.characteristicDescriptions). Beide Zeilen liegen
 * in derselben Grid-Spalte wie das zugehörige Attribut (dg-char-table),
 * damit sie mit ihm bündig bleiben.
 *
 * Datenpfad: character.systemData.characteristics/characteristicDescriptions/
 * hitPoints/willpower/sanity/luck/skills/disorders (Namespace-Regel, kein
 * Feld überschreibt MGT2s gleichnamige Top-Level-Felder).
 *
 * Ressourcen zeigen zusätzlich einen abgeleiteten Richtwert in Klammern
 * plus die kurze Ableitungsregel in Grau (User-Wunsch 25.07.2026) — die
 * Standardformeln aus dem Delta-Green-Regelwerk (Agent's Handbook):
 * Trefferpunkte = (STR+CON)/2 aufgerundet, Willenskraft = POW,
 * Sanity = 99−POW, Breaking Point = aktuelle Sanity−POW. Luck wird laut
 * Regelwerk einmalig gewürfelt (1W100), nicht aus einer Charakteristik
 * hergeleitet — bekommt deshalb nur den Hinweistext, keinen Klammerwert.
 * Diese Richtwerte sind eine reine Anzeigehilfe (bei jedem Seiten-Rerender
 * neu berechnet, nicht live bei jedem Tastendruck) — der tatsächliche
 * Maximalwert bleibt weiterhin frei editierbar, siehe Erklärung oben zu
 * "bewusst nicht automatisch berechnet".
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
  _disorders(char) { return char.systemData.disorders || (char.systemData.disorders = []); },
  _charDescriptions(char) {
    return char.systemData.characteristicDescriptions || (char.systemData.characteristicDescriptions = {});
  },

  // Kurzform-Ableitungsregeln (grau, neben jeder Ressource) — Standard-
  // Delta-Green-Formeln, siehe Dateikopf-Kommentar.
  _RESOURCE_RULES: {
    hp:   '(STR+CON)/2, aufgerundet',
    wp:   '= POW',
    san:  '99 − POW',
    luck: '1W100 bei Erschaffung (kein Attribut)',
  },
  _BREAKING_POINT_RULE: 'aktuelle Sanity − POW',

  // Abgeleitete Richtwerte für die Klammer-Anzeige neben jeder Ressource
  // (reine Anzeigehilfe, siehe Dateikopf-Kommentar) — Luck hat bewusst
  // keinen Eintrag, da laut Regelwerk nicht aus einer Charakteristik
  // hergeleitet.
  _derivedValues(chars, pools) {
    return {
      hp:  Math.ceil(((chars.str || 0) + (chars.con || 0)) / 2),
      wp:  chars.pow || 0,
      san: 99 - (chars.pow || 0),
      breakingPoint: (pools.san.current || 0) - (chars.pow || 0),
    };
  },

  render(character) {
    const chars = this._characteristics(character);
    const descriptions = this._charDescriptions(character);
    const pools = { hp: this._hitPoints(character), wp: this._willpower(character), san: this._sanity(character), luck: this._luck(character) };
    const derived = this._derivedValues(chars, pools);

    return `<div class="dg-stats-page">
      <div class="dg-block">
        <h3 class="dg-block-title">Charakteristiken</h3>
        <div class="dg-char-table-wrap">
          <div class="dg-char-table">
            <div class="dg-char-rowlabel"></div>
            ${this._CHARACTERISTICS.map(c => this._renderCharacteristic(c, chars[c.key])).join('')}
            <div class="dg-char-rowlabel">x5</div>
            ${this._CHARACTERISTICS.map(c => this._renderX5(c, chars[c.key])).join('')}
            <div class="dg-char-rowlabel">Beschreibung</div>
            ${this._CHARACTERISTICS.map(c => this._renderCharDescription(c, descriptions[c.key])).join('')}
          </div>
        </div>
      </div>

      <div class="dg-block">
        <h3 class="dg-block-title">Ressourcen</h3>
        <div class="dg-pool-grid">
          ${Object.entries(this._POOLS).map(([prefix, meta]) =>
            this._renderPool(prefix, meta.label, pools[prefix], derived[prefix], this._RESOURCE_RULES[prefix])
          ).join('')}
          ${this._renderBreakingPoint(pools.san, derived.breakingPoint)}
        </div>
      </div>

      ${this._renderSkillsBlock(character)}

      <div class="dg-block">
        ${CoreWidgets.renderValueList(this._disorders(character), {
          title: 'Störungen', idPrefix: 'dgDisorder',
          namePlaceholder: 'z.B. Paranoia', valuePlaceholder: 'Auslöser/Notizen', addLabel: '+ Störung',
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

  // Rein abgeleitet (Attributswert × 5) — nicht gespeichert, wird bei jeder
  // Eingabe im zugehörigen Attribut-Feld live neu berechnet (siehe
  // attachListeners()), deshalb kein <input>, sondern nur Anzeige.
  _renderX5(c, value) {
    return `<div class="dg-x5-cell" id="dgX5-${c.key}">${(value || 0) * 5}</div>`;
  },

  _renderCharDescription(c, text) {
    if (App.editMode) {
      return `<textarea class="dg-char-desc" id="dgCharDesc-${c.key}" rows="2" placeholder="Notiz zu ${c.label}">${this._esc(text || '')}</textarea>`;
    }
    return `<div class="dg-char-desc-view">${this._esc(text || '') || '–'}</div>`;
  },

  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _uid() { return 'w' + Date.now() + Math.random().toString(36).slice(2, 6); },

  // Teilt items in numCols möglichst gleich große, aufeinanderfolgende
  // Gruppen auf (Rest wandert auf die ersten Spalten) — für die
  // 3-spaltige Fertigkeiten-Darstellung (User-Wunsch 25.07.2026).
  _splitIntoColumns(items, numCols) {
    const base = Math.floor(items.length / numCols);
    const remainder = items.length % numCols;
    const cols = [];
    let idx = 0;
    for (let i = 0; i < numCols; i++) {
      const size = base + (i < remainder ? 1 : 0);
      cols.push(items.slice(idx, idx + size));
      idx += size;
    }
    return cols;
  },

  // Fertigkeiten-Abschnitt (User-Wunsch 25.07.2026, siehe Dateikopf-
  // Kommentar): 3 Spalten, Checkbox+Name+Wert je Zeile, plus ein einziger
  // (wiederverwendeter) Dialog fürs Ankreuzen, siehe _openSkillDialog().
  _renderSkillsBlock(character) {
    const skills = this._skills(character).filter(s => !s._deleted);
    const cols = this._splitIntoColumns(skills, 3);
    return `<div class="dg-block">
      <h3 class="dg-block-title">Fertigkeiten</h3>
      <p class="dg-skills-hint">Mach ein Kreuz, wenn eine Probe fehlschlägt. Addiere nach der Sitzung 1D4 auf jede angekreuzte Fertigkeit, lösche die Kreuze dann.</p>
      <div class="dg-skill-columns">
        ${cols.map(col => `<div class="dg-skill-col">${col.map(s => this._renderSkillRow(s)).join('')}</div>`).join('')}
      </div>
      ${App.editMode ? `<button class="cw-vl-add" id="dgSkillAddBtn">+ Fertigkeit</button>` : ''}
      <div class="dg-skill-dialog-overlay" id="dgSkillDialogOverlay">
        <div class="dg-skill-dialog">
          <h4 class="dg-skill-dialog-title" id="dgSkillDialogTitle">Fertigkeit steigern</h4>
          <div class="dg-skill-dialog-row">
            <input type="number" class="dg-skill-dialog-input" id="dgSkillDialogInput" value="0">
            <button type="button" class="dg-skill-dialog-roll" id="dgSkillDialogRoll" title="1D4 würfeln" aria-label="1D4 würfeln">🎲</button>
          </div>
          <div class="dg-skill-dialog-actions">
            <button type="button" class="btn-secondary" id="dgSkillDialogCancel">Abbrechen</button>
            <button type="button" class="btn-success" id="dgSkillDialogApply">Übernehmen</button>
          </div>
        </div>
      </div>
    </div>`;
  },

  // Checkbox bewusst in BEIDEN Modi interaktiv (User-Wunsch) — anders als
  // Name/Wert, die wie überall sonst in der App nur im Bearbeitungsmodus
  // editierbar sind. Gleiches Muster wie die Ressourcen-Zähler weiter oben
  // (±-Buttons rendern ebenfalls unabhängig von App.editMode).
  _renderSkillRow(s) {
    const value = s.value ?? 0;
    const checkbox = `<input type="checkbox" class="dg-skill-check" id="dgSkillCheck-${s.id}" data-id="${s.id}" ${s.checked ? 'checked' : ''}>`;
    if (App.editMode) {
      return `<div class="dg-skill-row">
        ${checkbox}
        <input type="text" class="dg-skill-name-input" data-id="${s.id}" value="${this._esc(s.name)}" placeholder="Fertigkeit">
        <input type="number" class="dg-skill-value-input" data-id="${s.id}" value="${value}">
        <button class="dg-skill-del" data-id="${s.id}" aria-label="Fertigkeit entfernen">🗑</button>
      </div>`;
    }
    return `<div class="dg-skill-row dg-skill-row-view">
      ${checkbox}
      <span class="dg-skill-name">${this._esc(s.name)}</span>
      <span class="dg-skill-value">${value}</span>
    </div>`;
  },

  _renderPool(prefix, label, pool, derivedValue, ruleText) {
    return `<div class="dg-pool">
      <div class="dg-pool-labelcol">
        <span class="dg-pool-label">${label}</span>
        ${ruleText ? `<span class="dg-pool-rule">${this._esc(ruleText)}</span>` : ''}
      </div>
      <div class="stepper-controls">
        <button class="stepper-btn" id="dg${prefix}Minus" aria-label="${label} verringern">−</button>
        <span class="stepper-val" id="dg${prefix}Value">${pool.current}</span>
        <span class="dg-pool-sep">/</span>
        ${App.editMode
          ? `<input type="number" class="dg-pool-max-input" id="dg${prefix}Max" value="${pool.max}" min="0">`
          : `<span class="dg-pool-max">${pool.max}</span>`}
        ${derivedValue !== undefined ? `<span class="dg-pool-derived">(${derivedValue})</span>` : ''}
        <button class="stepper-btn" id="dg${prefix}Plus" aria-label="${label} erhöhen">+</button>
      </div>
    </div>`;
  },

  _renderBreakingPoint(san, derivedValue) {
    return `<div class="dg-pool">
      <div class="dg-pool-labelcol">
        <span class="dg-pool-label">Breaking Point</span>
        <span class="dg-pool-rule">${this._esc(this._BREAKING_POINT_RULE)}</span>
      </div>
      <div class="stepper-controls">
        ${App.editMode
          ? `<input type="number" class="dg-pool-max-input" id="dgSanBreak" value="${san.breakingPoint || 0}" min="0">`
          : `<span class="dg-pool-max">${san.breakingPoint || 0}</span>`}
        ${derivedValue !== undefined ? `<span class="dg-pool-derived">(${derivedValue})</span>` : ''}
      </div>
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
      // x5-Zeile ist rein abgeleitet (nicht gespeichert) — bei jeder Eingabe
      // sofort neu berechnen, kein Warten auf Blur/Speichern nötig.
      const x5El = document.getElementById(`dgX5-${c.key}`);
      el?.addEventListener('input', () => {
        if (x5El) x5El.textContent = (parseInt(el.value) || 0) * 5;
      });
    });

    // Auto-Save on Blur für die Attribut-Beschreibungen, gleiches Muster wie
    // die Charakteristiken-Felder oben.
    const descriptions = this._charDescriptions(char);
    this._CHARACTERISTICS.forEach(c => {
      const el = document.getElementById(`dgCharDesc-${c.key}`);
      el?.addEventListener('blur', () => {
        descriptions[c.key] = el.value;
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

    this._attachSkillsListeners(char, rerender);
    CoreWidgets.attachValueList(char, this._disorders(char), { idPrefix: 'dgDisorder' }, rerender);
  },

  _attachSkillsListeners(char, rerender) {
    const skills = this._skills(char);

    // Checkbox in beiden Modi aktiv (siehe _renderSkillRow()): Ankreuzen
    // (unchecked->checked) öffnet den Steigern-Dialog, Abhaken
    // (checked->unchecked) speichert direkt ohne Dialog — die einzige Art,
    // ein versehentliches Kreuz ohne Dialog-Umweg rückgängig zu machen.
    document.querySelectorAll('.dg-skill-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const skill = skills.find(s => s.id === cb.dataset.id);
        if (!skill) return;
        skill.checked = cb.checked;
        Storage.saveCharacter(char);
        if (cb.checked) this._openSkillDialog(char, skill, rerender);
      });
    });

    if (!App.editMode) return;

    document.querySelectorAll('.dg-skill-name-input').forEach(input => {
      input.addEventListener('blur', () => {
        const skill = skills.find(s => s.id === input.dataset.id);
        if (!skill) return;
        skill.name = input.value;
        skill.updatedAt = new Date().toISOString();
        Storage.saveCharacter(char);
      });
    });

    document.querySelectorAll('.dg-skill-value-input').forEach(input => {
      input.addEventListener('blur', () => {
        const skill = skills.find(s => s.id === input.dataset.id);
        if (!skill) return;
        skill.value = parseFloat(input.value) || 0;
        skill.updatedAt = new Date().toISOString();
        Storage.saveCharacter(char);
      });
    });

    document.querySelectorAll('.dg-skill-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const skill = skills.find(s => s.id === btn.dataset.id);
        if (!skill) return;
        const now = new Date().toISOString();
        skill._deleted  = true;
        skill.deletedAt = now;
        skill.updatedAt = now;
        Storage.saveCharacter(char);
        rerender();
      });
    });

    document.getElementById('dgSkillAddBtn')?.addEventListener('click', () => {
      const now = new Date().toISOString();
      skills.push({ id: this._uid(), name: '', value: 0, checked: false, createdAt: now, updatedAt: now });
      Storage.saveCharacter(char);
      rerender();
    });
  },

  // Ein einziger, wiederverwendeter Dialog für alle Fertigkeiten (statt
  // eines Dialogs pro Zeile) — Klick-Handler werden bei jedem Öffnen per
  // Property-Zuweisung (.onclick =) statt addEventListener() neu gesetzt,
  // damit sich bei mehrfachem Öffnen ohne zwischenzeitlichen Rerender
  // (z.B. Ankreuzen -> Abbrechen -> anderes Feld ankreuzen) keine
  // doppelten Listener aufsummieren.
  _openSkillDialog(char, skill, rerender) {
    const overlay = document.getElementById('dgSkillDialogOverlay');
    const title   = document.getElementById('dgSkillDialogTitle');
    const input   = document.getElementById('dgSkillDialogInput');
    const rollBtn   = document.getElementById('dgSkillDialogRoll');
    const applyBtn  = document.getElementById('dgSkillDialogApply');
    const cancelBtn = document.getElementById('dgSkillDialogCancel');
    if (!overlay || !input) return;

    title.textContent = `Fertigkeit steigern: ${skill.name || '(ohne Namen)'}`;
    input.value = '0';
    overlay.classList.add('open');

    const close = () => overlay.classList.remove('open');

    rollBtn.onclick = () => { input.value = Math.floor(Math.random() * 4) + 1; };

    // Übernehmen: Zahl zum Fertigkeitswert addieren, Häkchen entfernen.
    applyBtn.onclick = () => {
      const n = parseInt(input.value) || 0;
      skill.value = (parseFloat(skill.value) || 0) + n;
      skill.checked = false;
      skill.updatedAt = new Date().toISOString();
      Storage.saveCharacter(char);
      close();
      rerender();
    };

    // Abbrechen: nichts passiert — Häkchen bleibt gesetzt (war beim Öffnen
    // schon skill.checked=true), Wert bleibt unverändert.
    cancelBtn.onclick = () => close();
    overlay.onclick = e => { if (e.target === overlay) close(); };
  },
};
