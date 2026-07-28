/**
 * Hintergrund – Delta Green hat keine Karriere-Generierung (Agenten starten
 * fertig rekrutiert, keine Dienst-Timeline wie MGT2s Terms/Rang/Musterung).
 * Diese Seite ist deshalb größtenteils ein dünner Wrapper um den Kern-
 * Baustein CareerBackground (Prägende Ereignisse, Hintergrund &
 * Persönlichkeit, Favoriten-Kontakte) — kein eigener Timeline-Block wie in
 * systems/mgt2/pages/career.js.
 *
 * Datenpfad des Kern-Bausteins kommt automatisch aus dem Kern-Fallback (kein
 * backgroundPath/keyEventsPath-Override im Manifest nötig):
 * character.systemData.background/character.systemData.keyEvents, siehe
 * App._backgroundPath()/_keyEventsPath().
 *
 * Zusätzlich (User-Wunsch 27.07.2026, Konzept vorab per Artifact
 * abgestimmt): ein eigener Block "Motivationen und Syndrome" —
 * Delta-Green-spezifisch, deshalb HIER und NICHT im system-übergreifenden
 * CareerBackground-Baustein, unter character.systemData.motivationsSyndromes.
 * Jede Zeile: SM-Schalter (M/S, startet bei M, nur im Bearbeitungsmodus
 * umschaltbar — im Lesemodus per natives disabled-Attribut gesperrt),
 * Bezeichnung (Textfeld) und ein Details-Dialog exakt nach dem Muster von
 * pages/equipment.js's _showTraits(): Markdown-Text + Bild-Upload über
 * FileSync, imperativ erzeugt/angehängt statt Teil des deklarativen
 * render() — Details bleibt bewusst in BEIDEN Modi klickbar, wie bei der
 * Ausrüstung. Dezenter Hinweistext zum Regelmechanismus (Syndrom entsteht
 * beim Überschreiten des Breaking Point) auf User-Bestätigung hin ergänzt,
 * bewusst nicht selbst geraten (Unsicherheit über exakten offiziellen
 * Wortlaut).
 *
 * "Störungen" (Disorders, character.systemData.disorders) sind seit
 * 27.07.2026 ebenfalls hier, direkt unter "Motivationen und Syndrome" —
 * vorher im Werte-Tab (systems/delta-green/pages/stats.js), User-
 * Einschätzung: Störungen gehören inhaltlich eher zum psychologischen
 * Profil des Charakters als zu den Spielwerten. Reine Positionsänderung,
 * Datenpfad/Datenstruktur (freie Name+Wert-Liste über
 * CoreWidgets.renderValueList/attachValueList) unverändert.
 */
const DgBackgroundPage = {
  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  _uid() { return 'ms' + Date.now() + Math.random().toString(36).slice(2, 6); },

  _motivationsSyndromes(char) {
    return char.systemData.motivationsSyndromes || (char.systemData.motivationsSyndromes = []);
  },
  _disorders(char) {
    return char.systemData.disorders || (char.systemData.disorders = []);
  },

  render(character) {
    return CareerBackground.render(character)
      + this._renderMotivationsBlock(character)
      + this._renderDisordersBlock(character);
  },

  _renderDisordersBlock(character) {
    return `<div class="dg-block">
      ${CoreWidgets.renderValueList(this._disorders(character), {
        title: 'Störungen', idPrefix: 'dgDisorder',
        namePlaceholder: 'z.B. Paranoia', valuePlaceholder: 'Auslöser/Notizen', addLabel: '+ Störung',
      })}
    </div>`;
  },

  _renderMotivationsBlock(character) {
    const rows = this._motivationsSyndromes(character).filter(r => !r._deleted);
    return `<div class="dg-block">
      <h3 class="dg-block-title">Motivationen und Syndrome</h3>
      <p class="dg-block-hint">„M" = Motivation, „S" = Syndrom.</p>
      <p class="dg-block-hint">Ein Syndrom entsteht, wenn der Agent seinen Breaking Point überschreitet.</p>
      <div class="dg-ms-table">
        ${rows.map(r => this._renderMsRow(r)).join('') || '<p class="cr-empty">Noch keine Einträge.</p>'}
      </div>
      ${App.editMode ? `<button class="cw-vl-add" id="dgMsAddBtn">+ Eintrag</button>` : ''}
    </div>`;
  },

  _renderMsRow(row) {
    const sm = row.sm === 'S' ? 'S' : 'M';
    return `<div class="dg-ms-row">
      <button type="button" class="dg-ms-toggle${sm === 'S' ? ' is-s' : ''}" data-id="${row.id}" ${App.editMode ? '' : 'disabled'} aria-label="Motivation oder Syndrom umschalten">${sm}</button>
      ${App.editMode
        ? `<input type="text" class="dg-ms-label-input" data-id="${row.id}" value="${this._esc(row.label)}" placeholder="Bezeichnung">`
        : `<span class="dg-ms-label-view">${this._esc(row.label) || '–'}</span>`}
      <button type="button" class="dg-ms-details-btn btn-info" data-id="${row.id}">Details</button>
      ${App.editMode ? `<button type="button" class="dg-ms-del" data-id="${row.id}" aria-label="Eintrag entfernen">🗑</button>` : ''}
    </div>`;
  },

  save(character) { /* Felder speichern direkt bei Änderung, siehe _attachMotivationsListeners() — wie CareerBackground */ },

  attachListeners() {
    const char = window.currentCharacter;
    const rerender = () => {
      document.getElementById('background-page').innerHTML = this.render(char);
      this.attachListeners();
    };
    CareerBackground.attachListeners(char, rerender);
    this._attachMotivationsListeners(char, rerender);
    CoreWidgets.attachValueList(char, this._disorders(char), { idPrefix: 'dgDisorder' }, rerender);
  },

  _attachMotivationsListeners(char, rerender) {
    const rows = this._motivationsSyndromes(char);

    // Details-Button immer aktiv (auch im Lesemodus, wie bei der Ausrüstung).
    document.querySelectorAll('.dg-ms-details-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = rows.find(r => r.id === btn.dataset.id);
        if (row) this._showMsDetails(char, row);
      });
    });

    // SM-Schalter: im Lesemodus per natives disabled-Attribut gesperrt
    // (siehe _renderMsRow()), der Listener selbst kann deshalb unbedingt
    // angehängt werden — ein disabled-Button feuert ohnehin kein click.
    document.querySelectorAll('.dg-ms-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = rows.find(r => r.id === btn.dataset.id);
        if (!row) return;
        row.sm = row.sm === 'S' ? 'M' : 'S';
        row.updatedAt = new Date().toISOString();
        btn.textContent = row.sm;
        btn.classList.toggle('is-s', row.sm === 'S');
        Storage.saveCharacter(char);
      });
    });

    if (!App.editMode) return;

    document.querySelectorAll('.dg-ms-label-input').forEach(input => {
      input.addEventListener('blur', () => {
        const row = rows.find(r => r.id === input.dataset.id);
        if (!row) return;
        row.label = input.value;
        row.updatedAt = new Date().toISOString();
        Storage.saveCharacter(char);
      });
    });

    document.querySelectorAll('.dg-ms-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = rows.find(r => r.id === btn.dataset.id);
        if (!row) return;
        if (!confirm('Eintrag wirklich löschen?')) return;
        const now = new Date().toISOString();
        row._deleted  = true;
        row.deletedAt = now;
        row.updatedAt = now;
        Storage.saveCharacter(char);
        rerender();
      });
    });

    document.getElementById('dgMsAddBtn')?.addEventListener('click', () => {
      const now = new Date().toISOString();
      rows.push({ id: this._uid(), sm: 'M', label: '', details: {}, createdAt: now, updatedAt: now });
      Storage.saveCharacter(char);
      rerender();
    });
  },

  // Details-Dialog analog zur Ausrüstung (equipment.js _showTraits(),
  // siehe Dateikopf-Kommentar) — dieselben CSS-Klassen (.traits-*),
  // dieselbe Bild-Upload-Logik über FileSync, dieselbe Markdown-Anzeige
  // über Md.render(). Imperativ erzeugt/angehängt statt Teil des
  // deklarativen render(), exakt wie im Vorbild.
  _showMsDetails(char, row) {
    const details = row.details || (row.details = {});

    const modal = document.createElement('div');
    modal.className = 'traits-modal-overlay';
    modal.innerHTML = `
      <div class="traits-modal">
        <h3>${this._esc(row.label || 'Eintrag')} – Details</h3>
        ${App.editMode ? `<label class="traits-label">Bild</label>
          <input type="file" id="msImg" accept="image/*">` : ''}
        <div id="msImgPreview" class="traits-img-preview">
          ${(details.imageFileId || details.image) ? `<img src="${this._esc(details.imageFileId ? FileSync.getUrl(details.imageFileId) : details.image)}">` : ''}
        </div>
        ${App.editMode
          ? `<label class="traits-label">Beschreibung</label>
             <textarea id="msDesc" class="traits-textarea">${this._esc(details.description || '')}</textarea>
             <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle |</span>`
          : `<div class="traits-desc-view md-content">${Md.render(details.description || '') || '<p class="md-p" style="color:#999">Keine Beschreibung.</p>'}</div>`}
        <div class="traits-actions">
          <button id="msCancelBtn" class="btn-secondary">Schließen</button>
          ${App.editMode ? '<button id="msSaveBtn" class="btn-primary">Speichern</button>' : ''}
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('msCancelBtn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    if (App.editMode) {
      document.getElementById('msImg')?.addEventListener('change', async e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const result = await FileSync.upload(file, { ownerType: 'character', ownerId: char.id, field: 'motivationImage', refId: row.id });
        if (!result.ok) { App.showStatus('Bild-Upload fehlgeschlagen', 'error'); return; }
        // Kein FileSync.remove() fürs alte Bild — gleiche Entscheidung wie
        // equipment.js: still ersetzen, Aufräumen nur über die Admin-Seite.
        details.image = null;
        details.imageFileId = result.data.id;
        document.getElementById('msImgPreview').innerHTML = `<img src="${this._esc(FileSync.getUrl(details.imageFileId))}">`;
      });

      document.getElementById('msSaveBtn').addEventListener('click', () => {
        details.description = document.getElementById('msDesc').value;
        row.details = details;
        row.updatedAt = new Date().toISOString();
        Storage.saveCharacter(char);
        modal.remove();
      });
    }
  },
};
