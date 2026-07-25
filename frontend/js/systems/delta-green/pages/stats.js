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
 * Darstellung, Checkbox+Name+Wert je Zeile, Steigern-Dialog beim Abhaken
 * (checked->unchecked — Ankreuzen speichert dagegen direkt ohne Dialog,
 * Korrektur 25.07.2026, ursprünglich andersherum gebaut) siehe
 * _renderSkillsBlock()/_attachSkillsListeners()/_openSkillDialog() unten.
 * Bewusst NICHT in CoreWidgets verallgemeinert — dieses Checkbox-Dialog-
 * Muster ist eine sehr spezifische Delta-Green-Hausregel (Fehlschlag
 * ankreuzen, nach der Sitzung abhaken und 1D4 addieren), kein
 * wiederverwendbares Kern-Konzept wie die einfache Name+Wert-Liste.
 *
 * Maximalwerte von Trefferpunkte/Willenskraft/Sanity sowie der Breaking
 * Point werden automatisch aus den Standardformeln berechnet und
 * eingetragen (User-Wunsch 25.07.2026, Kurswechsel ggü. der ursprünglichen
 * Entscheidung "bleibt frei editierbar" vom selben Tag) — kein `<input>`
 * mehr dafür, reine Anzeige wie beim x5-Feld der Charakteristiken, live
 * neu berechnet bei jeder Attribut-Eingabe bzw. jeder Änderung des
 * aktuellen Sanity-Werts (Breaking Point hängt von beidem ab: POW UND
 * aktueller Sanity). Luck hat laut Regelwerk KEINE Formel (wird gewürfelt)
 * und bleibt deshalb als einziger Maximalwert frei editierbar — siehe
 * `_POOLS`-Flag `auto`. Der aktuelle Wert bekommt bei allen vier
 * Ressourcen weiterhin einen Zähler zum schnellen Anpassen am Tisch
 * (CoreWidgets.attachCounter, wie MGT2s Attribut-Karten/Helden-XP — hier
 * an einem zweiten, unabhängigen System erprobt).
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
 * Ressourcen zeigen zusätzlich die kurze Ableitungsregel in Grau — die
 * Standardformeln aus dem Delta-Green-Regelwerk (Agent's Handbook):
 * Trefferpunkte = (STR+CON)/2 aufgerundet, Willenskraft = POW,
 * Sanity = 99−POW, Breaking Point = aktuelle Sanity−POW. Luck wird laut
 * Regelwerk einmalig gewürfelt (1W100), nicht aus einer Charakteristik
 * hergeleitet — bekommt deshalb nur den Hinweistext, keinen automatisch
 * berechneten Maximalwert.
 */
const DgStatsPage = {
  _CHARACTERISTICS: [
    { key: 'str', label: 'STR' }, { key: 'con', label: 'CON' }, { key: 'dex', label: 'DEX' },
    { key: 'int', label: 'INT' }, { key: 'pow', label: 'POW' }, { key: 'cha', label: 'CHA' },
  ],
  // auto: Maximalwert wird automatisch berechnet (siehe _applyDerivedResourceValues()),
  // kein manuelles <input> mehr — nur Luck hat laut Regelwerk keine Formel
  // (wird gewürfelt) und bleibt deshalb frei editierbar.
  _POOLS: {
    hp:   { field: 'hitPoints', label: 'Trefferpunkte', auto: true },
    wp:   { field: 'willpower', label: 'Willenskraft',  auto: true },
    san:  { field: 'sanity',    label: 'Sanity',        auto: true },
    luck: { field: 'luck',      label: 'Luck',          auto: false },
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

  // Reine Berechnung, kein Modell-Zugriff — Luck hat bewusst keinen
  // Eintrag, da laut Regelwerk nicht aus einer Charakteristik hergeleitet.
  _derivedValues(chars, pools) {
    return {
      hp:  Math.ceil(((chars.str || 0) + (chars.con || 0)) / 2),
      wp:  chars.pow || 0,
      san: 99 - (chars.pow || 0),
      breakingPoint: (pools.san.current || 0) - (chars.pow || 0),
    };
  },

  // Schreibt die automatisch berechneten Ressourcen-Werte (HP/Willenskraft/
  // Sanity-Max, Breaking Point) ins Modell UND aktualisiert — falls die
  // Seite schon im DOM steht — die Anzeige live, ohne komplettes Rerender
  // (reines textContent, kein innerHTML-Ersatz -> keine Fokus-Race wie bei
  // den früheren Blur-Rerender-Versuchen, siehe combat.js-Historie).
  // Aufrufer: render() (Elemente noch nicht im DOM -> nur die Modell-Seite
  // greift), Charakteristik-Eingabe und Sanity-Zähler in attachListeners()
  // (Elemente stehen -> Anzeige aktualisiert sich sofort mit).
  _applyDerivedResourceValues(char) {
    // Charakteristiken-Werte bevorzugt live aus dem DOM lesen (falls die
    // Eingabefelder schon existieren) statt aus dem gespeicherten Modell —
    // letzteres wird ja erst bei Blur aktualisiert (siehe weiter unten),
    // würde also während des Tippens veraltete Werte liefern. Beim
    // allerersten render() (Felder noch nicht im DOM) fällt das
    // automatisch auf das gespeicherte Modell zurück.
    const stored = this._characteristics(char);
    const chars = {};
    this._CHARACTERISTICS.forEach(c => {
      const el = document.getElementById(`dgChar-${c.key}`);
      chars[c.key] = el ? (parseInt(el.value) || 0) : (stored[c.key] || 0);
    });
    const pools = { hp: this._hitPoints(char), wp: this._willpower(char), san: this._sanity(char) };
    const derived = this._derivedValues(chars, pools);
    pools.hp.max          = derived.hp;
    pools.wp.max          = derived.wp;
    pools.san.max         = derived.san;
    pools.san.breakingPoint = derived.breakingPoint;

    const hpEl  = document.getElementById('dghpMax');
    const wpEl  = document.getElementById('dgwpMax');
    const sanEl = document.getElementById('dgsanMax');
    const bpEl  = document.getElementById('dgSanBreak');
    if (hpEl)  hpEl.textContent  = derived.hp;
    if (wpEl)  wpEl.textContent  = derived.wp;
    if (sanEl) sanEl.textContent = derived.san;
    if (bpEl)  bpEl.textContent  = derived.breakingPoint;

    return derived;
  },

  render(character) {
    const chars = this._characteristics(character);
    const descriptions = this._charDescriptions(character);
    this._applyDerivedResourceValues(character); // schreibt hp/wp/san.max + san.breakingPoint automatisch
    const pools = { hp: this._hitPoints(character), wp: this._willpower(character), san: this._sanity(character), luck: this._luck(character) };

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
            this._renderPool(prefix, meta.label, pools[prefix], this._RESOURCE_RULES[prefix], meta.auto)
          ).join('')}
          ${this._renderBreakingPoint(pools.san)}
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
  // (wiederverwendeter) Dialog fürs Abhaken, siehe _openSkillDialog().
  _renderSkillsBlock(character) {
    // Alphabetisch sortiert (User-Wunsch 25.07.2026) — nur für die
    // Anzeige, character.systemData.skills selbst behält die
    // Einfüge-Reihenfolge (jede Zeile ist über data-id ohnehin
    // positionsunabhängig verdrahtet, siehe _attachSkillsListeners()).
    const activeSkills = this._skills(character).filter(s => !s._deleted);
    const skills = activeSkills.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
    const cols = this._splitIntoColumns(skills, 3);

    // "Standard-Fertigkeiten ergänzen"-Knopf (User-Wunsch 25.07.2026): für
    // Bestandscharaktere, die vor defaultSkills angelegt wurden oder bei
    // denen Einträge gelöscht wurden — fügt nur fehlende Namen hinzu (siehe
    // _attachSkillsListeners()), verdoppelt nichts. Nur sichtbar, wenn das
    // aktive System überhaupt defaultSkills deklariert (Delta Green) UND
    // tatsächlich noch etwas fehlt.
    const existingNames = new Set(activeSkills.map(s => (s.name || '').trim().toLowerCase()));
    const missingCount = App._defaultSkills().filter(n => !existingNames.has(n.trim().toLowerCase())).length;

    return `<div class="dg-block">
      <h3 class="dg-block-title">Fertigkeiten</h3>
      <p class="dg-skills-hint">Mach ein Kreuz, wenn eine Probe fehlschlägt. Addiere nach der Sitzung 1D4 auf jede angekreuzte Fertigkeit, lösche die Kreuze dann.</p>
      <div class="dg-skill-columns">
        ${cols.map(col => `<div class="dg-skill-col">${col.map(s => this._renderSkillRow(s)).join('')}</div>`).join('')}
      </div>
      ${App.editMode ? `<div class="dg-skill-actions">
        <button class="cw-vl-add" id="dgSkillAddBtn">+ Fertigkeit</button>
        ${missingCount > 0 ? `<button class="btn-secondary" id="dgSkillFillDefaultsBtn">Standard-Fertigkeiten ergänzen (${missingCount})</button>` : ''}
      </div>` : ''}
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

  // auto=true (HP/Willenskraft/Sanity): Maximalwert ist reine Anzeige
  // (Span, kein <input>, wie das x5-Feld) — wird automatisch berechnet,
  // siehe _applyDerivedResourceValues(). auto=false (Luck): weiterhin
  // manuell editierbar, da laut Regelwerk keine Formel existiert.
  _renderPool(prefix, label, pool, ruleText, auto) {
    return `<div class="dg-pool">
      <div class="dg-pool-labelcol">
        <span class="dg-pool-label">${label}</span>
        ${ruleText ? `<span class="dg-pool-rule">${this._esc(ruleText)}</span>` : ''}
      </div>
      <div class="stepper-controls">
        <button class="stepper-btn" id="dg${prefix}Minus" aria-label="${label} verringern">−</button>
        <span class="stepper-val" id="dg${prefix}Value">${pool.current}</span>
        <span class="dg-pool-sep">/</span>
        ${auto
          ? `<span class="dg-pool-max" id="dg${prefix}Max">${pool.max}</span>`
          : (App.editMode
              ? `<input type="number" class="dg-pool-max-input" id="dg${prefix}Max" value="${pool.max}" min="0">`
              : `<span class="dg-pool-max">${pool.max}</span>`)}
        <button class="stepper-btn" id="dg${prefix}Plus" aria-label="${label} erhöhen">+</button>
      </div>
    </div>`;
  },

  // Breaking Point ist immer automatisch (kein auto-Flag nötig, gibt nur
  // diese eine Instanz).
  _renderBreakingPoint(san) {
    return `<div class="dg-pool">
      <div class="dg-pool-labelcol">
        <span class="dg-pool-label">Breaking Point</span>
        <span class="dg-pool-rule">${this._esc(this._BREAKING_POINT_RULE)}</span>
      </div>
      <div class="stepper-controls">
        <span class="dg-pool-max" id="dgSanBreak">${san.breakingPoint || 0}</span>
      </div>
    </div>`;
  },

  save(character) {
    const chars = this._characteristics(character);
    this._CHARACTERISTICS.forEach(c => {
      const el = document.getElementById(`dgChar-${c.key}`);
      if (el) chars[c.key] = parseInt(el.value) || 0;
    });
    // Nur Luck hat noch ein manuelles Max-Feld — HP/Willenskraft/Sanity/
    // Breaking Point werden automatisch berechnet, siehe
    // _applyDerivedResourceValues() (dort auch schon geschrieben, hier
    // also kein zusätzlicher Schreibzugriff nötig).
    Object.entries(this._POOLS).forEach(([prefix, meta]) => {
      if (meta.auto) return;
      const el = document.getElementById(`dg${prefix}Max`);
      if (el) this._pool(character, meta.field, {}).max = parseInt(el.value) || 0;
    });
    this._applyDerivedResourceValues(character);
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
      // x5-Zeile und die automatisch berechneten Ressourcen-Maxima (HP/
      // Willenskraft/Sanity/Breaking Point) sind rein abgeleitet (nicht
      // extra gespeichert, siehe _applyDerivedResourceValues()) — bei
      // jeder Eingabe sofort neu berechnen, kein Warten auf Blur nötig.
      const x5El = document.getElementById(`dgX5-${c.key}`);
      el?.addEventListener('input', () => {
        if (x5El) x5El.textContent = (parseInt(el.value) || 0) * 5;
        this._applyDerivedResourceValues(char);
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
        // Breaking Point hängt von der aktuellen Sanity ab — bei jedem
        // Zähler-Klick (nicht nur beim Sanity-Zähler selbst, kostet aber
        // nichts) live neu berechnen, kein Rerender nötig (reines
        // textContent, siehe _applyDerivedResourceValues()).
        this._applyDerivedResourceValues(char);
        Storage.saveCharacter(char);
      });

      // Luck ist die einzige Ressource mit noch manuellem Max-Feld (kein
      // auto-Flag) — HP/Willenskraft/Sanity werden automatisch berechnet,
      // siehe _applyDerivedResourceValues() und den auto-Zweig oben in
      // _renderPool(). Bewusst KEIN Rerender bei Luck-Max-Blur: ein Blur
      // kann mitten in einem Fokuswechsel zum nächsten Feld auftreten
      // (z.B. Tab zur nächsten Ressource) — ein synchrones innerHTML in
      // diesem Moment würde damit kollidieren ("node to be removed is no
      // longer a child of this node" beim Testen). Folge: der ±-Zähler
      // übernimmt eine neu eingetragene Obergrenze erst nach dem nächsten
      // echten Rerender (Tab-Wechsel) — reiner Anzeige-Nachlauf, der Wert
      // selbst ist ab hier bereits korrekt gespeichert.
      if (meta.auto) return;
      const maxEl = document.getElementById(`dg${prefix}Max`);
      maxEl?.addEventListener('blur', () => {
        pool.max = parseInt(maxEl.value) || 0;
        Storage.saveCharacter(char);
      });
    });

    this._attachSkillsListeners(char, rerender);
    CoreWidgets.attachValueList(char, this._disorders(char), { idPrefix: 'dgDisorder' }, rerender);
  },

  _attachSkillsListeners(char, rerender) {
    const skills = this._skills(char);

    // Checkbox in beiden Modi aktiv (siehe _renderSkillRow()): Ankreuzen
    // (unchecked->checked, ein Fehlschlag während der Sitzung) speichert
    // direkt ohne Dialog. Abhaken (checked->unchecked, "ich werte diesen
    // Fehlschlag jetzt aus") öffnet den Steigern-Dialog — Korrektur
    // 25.07.2026, ursprünglich andersherum gebaut.
    document.querySelectorAll('.dg-skill-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const skill = skills.find(s => s.id === cb.dataset.id);
        if (!skill) return;
        skill.checked = cb.checked;
        Storage.saveCharacter(char);
        if (!cb.checked) this._openSkillDialog(char, skill, rerender);
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

    // "Standard-Fertigkeiten ergänzen" (User-Wunsch 25.07.2026): fügt nur
    // Namen aus App._defaultSkills() hinzu, die noch nicht (Groß-/
    // Kleinschreibung ignoriert) unter den aktiven Fertigkeiten stehen —
    // für Bestandscharaktere von vor der defaultSkills-Einführung, wie
    // "Alexei 'Kernel' Morozov". Bestehende Einträge/Werte bleiben
    // unangetastet, keine Duplikate.
    document.getElementById('dgSkillFillDefaultsBtn')?.addEventListener('click', () => {
      const existingNames = new Set(skills.filter(s => !s._deleted).map(s => (s.name || '').trim().toLowerCase()));
      const now = new Date().toISOString();
      let added = 0;
      App._defaultSkills().forEach(name => {
        if (existingNames.has(name.trim().toLowerCase())) return;
        skills.push({ id: this._uid(), name, value: 0, checked: false, createdAt: now, updatedAt: now });
        added++;
      });
      Storage.saveCharacter(char);
      App.showStatus(`${added} Standard-Fertigkeit${added === 1 ? '' : 'en'} ergänzt`, 'success');
      rerender();
    });
  },

  // Ein einziger, wiederverwendeter Dialog für alle Fertigkeiten (statt
  // eines Dialogs pro Zeile) — Klick-Handler werden bei jedem Öffnen per
  // Property-Zuweisung (.onclick =) statt addEventListener() neu gesetzt,
  // damit sich bei mehrfachem Öffnen ohne zwischenzeitlichen Rerender
  // (z.B. Abhaken -> Abbrechen -> andere Fertigkeit abhaken) keine
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

    // Abbrechen: macht das Abhaken rückgängig (Häkchen wird wieder
    // gesetzt, sowohl im Modell als auch an der DOM-Checkbox selbst — die
    // steht ja bereits auf unchecked, seit genau dieser Klick den Dialog
    // geöffnet hat), Wert bleibt unverändert. Korrektur 25.07.2026: vorher
    // blieb die Checkbox beim Abbrechen unchecked.
    cancelBtn.onclick = () => {
      skill.checked = true;
      const cb = document.getElementById(`dgSkillCheck-${skill.id}`);
      if (cb) cb.checked = true;
      Storage.saveCharacter(char);
      close();
    };
    overlay.onclick = e => { if (e.target === overlay) close(); };
  },
};
