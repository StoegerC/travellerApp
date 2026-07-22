/**
 * CoreWidgets – schmale Kern-Widget-Bibliothek (Multi-System Phase 4,
 * Challenge-Fund U4), aus der System-Seiten komponieren statt gleiche
 * Bausteine (Zähler, Tabellenliste, Tracker …) jeweils neu zu bauen.
 *
 * Bewusst erst jetzt gebaut, nicht schon in Phase 2: ohne einen zweiten
 * echten Verwendungsfall wäre die API geraten gewesen (Plan §5, "Verfrühte
 * Abstraktion"). Das Universal-Template (systems/universal/) ist der erste
 * echte Bedarf und bekommt genau das, was es braucht — eine editierbare
 * Name+Wert-Liste. Zähler/Tracker kommen erst dazu, wenn ein System sie
 * tatsächlich braucht (MGT2s combat.js/attributes.js bleiben vorerst
 * unangetastet, siehe Todo.txt).
 *
 * Muster: reine render()/attach()-Funktionspaare wie ein Seiten-Mixin,
 * aber ohne eigenen State — Daten (items) und Persistenz (onChange) gehören
 * der aufrufenden System-Seite, damit dasselbe Widget auf einer Seite
 * mehrfach nebeneinander verwendet werden kann (siehe idPrefix).
 */
const CoreWidgets = {

  _uid() { return 'w' + Date.now() + Math.random().toString(36).slice(2, 6); },
  _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  /**
   * Editierbare Name+Wert-Liste (z.B. freie Attribute/Fertigkeiten eines
   * generischen Systems). items: Array<{id, name, value, createdAt,
   * updatedAt, _deleted?, deletedAt?}> — Löschung per Tombstone statt
   * splice (Merge-Bauordnung, Leitfaden-Fund L3), damit die Liste
   * sync-merge-fähig ist, sobald ein Manifest sie per mergeSpec (keyField
   * "id") deklariert.
   *
   * opts: { title?, idPrefix, namePlaceholder?, valuePlaceholder?, addLabel? }
   * idPrefix muss eindeutig sein, wenn mehrere Listen auf derselben Seite
   * gerendert werden (z.B. "Attribute" und "Fertigkeiten").
   */
  renderValueList(items, opts) {
    const { title = '', idPrefix, namePlaceholder = 'Name', valuePlaceholder = 'Wert', addLabel = '+ Eintrag' } = opts;
    const visible = (items || []).filter(i => !i._deleted);

    if (!App.editMode) {
      const rows = visible.map(i => `
        <div class="cw-vl-row cw-vl-row-view">
          <span class="cw-vl-name">${this._esc(i.name)}</span>
          <span class="cw-vl-value">${this._esc(i.value)}</span>
        </div>`).join('');
      return `<div class="cw-value-list">
        ${title ? `<h3 class="cw-vl-title">${this._esc(title)}</h3>` : ''}
        ${rows || '<p class="cr-empty">Noch keine Einträge.</p>'}
      </div>`;
    }

    const rows = visible.map(i => `
      <div class="cw-vl-row">
        <input type="text" class="cw-vl-name-input"  data-id="${this._esc(i.id)}" data-field="name"  value="${this._esc(i.name)}"  placeholder="${namePlaceholder}">
        <input type="text" class="cw-vl-value-input" data-id="${this._esc(i.id)}" data-field="value" value="${this._esc(i.value)}" placeholder="${valuePlaceholder}">
        <button class="cw-vl-del" data-id="${this._esc(i.id)}" aria-label="Entfernen">🗑</button>
      </div>`).join('');

    return `<div class="cw-value-list" id="${idPrefix}-list">
      ${title ? `<h3 class="cw-vl-title">${this._esc(title)}</h3>` : ''}
      <div class="cw-vl-rows">${rows || '<p class="cr-empty">Noch keine Einträge.</p>'}</div>
      <button class="cw-vl-add" id="${idPrefix}-add">${addLabel}</button>
    </div>`;
  },

  /**
   * Verdrahtet eine per renderValueList() gerenderte Liste.
   *
   * Bewusste Trennung von Speichern und Re-Render (wie career-background.js
   * es bei den Hintergrund-Feldern vormacht): ein Feld-Blur speichert nur
   * (Storage.saveCharacter), OHNE die Seite neu zu rendern — ein voller
   * Rerender bei jedem Blur würde mit dem Fokuswechsel ins nächste Feld
   * wettlaufen (der Browser blurt das alte Feld, bevor er das neue
   * fokussiert; ersetzt der Blur-Handler in diesem Moment das DOM, läuft
   * die Fokussierung des gerade angeklickten/getabbten Feldes ins Leere).
   * onStructureChange() wird nur bei Hinzufügen/Löschen aufgerufen, weil
   * dort tatsächlich Zeilen erscheinen/verschwinden müssen.
   */
  attachValueList(char, items, opts, onStructureChange) {
    if (!App.editMode) return;
    const idPrefix = opts.idPrefix;
    const list = document.getElementById(`${idPrefix}-list`);
    if (!list) return;

    list.querySelectorAll('.cw-vl-name-input, .cw-vl-value-input').forEach(input => {
      input.addEventListener('blur', () => {
        const item = items.find(i => i.id === input.dataset.id);
        if (!item) return;
        item[input.dataset.field] = input.value;
        item.updatedAt = new Date().toISOString();
        Storage.saveCharacter(char);
      });
    });

    list.querySelectorAll('.cw-vl-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = items.find(i => i.id === btn.dataset.id);
        if (!item) return;
        const now = new Date().toISOString();
        item._deleted  = true;
        item.deletedAt = now;
        item.updatedAt = now;
        Storage.saveCharacter(char);
        onStructureChange();
      });
    });

    list.querySelector('.cw-vl-add')?.addEventListener('click', () => {
      const now = new Date().toISOString();
      items.push({ id: this._uid(), name: '', value: '', createdAt: now, updatedAt: now });
      Storage.saveCharacter(char);
      onStructureChange();
    });
  },
};
