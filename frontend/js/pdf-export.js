/**
 * PdfExport – druckt eine Auswahl von Charakter-Tabs als PDF, über den
 * nativen Browser-Druckdialog ("Als PDF sichern") statt einer externen
 * Bibliothek wie jsPDF — passt zum Projekt-Grundsatz "vollständig offline,
 * keine externen Abhängigkeiten" (siehe CLAUDE.md).
 *
 * Kern-Modul, systemunabhängig: WELCHE Tabs gedruckt werden, entscheidet
 * allein das Manifest (`printTabs`, Array von Tab-IDs, siehe
 * App._printTabs()). Ohne diesen Schlüssel bleibt der Druck-Knopf im
 * Header unsichtbar (siehe updateVisibility()) — aktuell nur bei Delta
 * Green gesetzt (User-Wunsch 31.07.2026: Agent/Werte/Ausrüstung), MGT2 und
 * das Universal-Template bewusst unverändert gelassen (siehe
 * feedback_delta_green_scope in den Projekt-Notizen).
 *
 * Seiten-Module können optional eine renderPrint(character)-Methode
 * anbieten (Fallback: render()) — nötig für Seiten, deren normales
 * render() App-Chrome enthält, das auf einem gedruckten Blatt nichts zu
 * suchen hat (Charakter-Selektor/Sync/Kampagne bei metadata.js) oder nur
 * einen von mehreren Sub-Tabs zeigt (Ausrüstungs-Kategorien bei
 * equipment.js) — siehe dortige Kommentare.
 *
 * Druck-HTML landet in einem eigenen, auf dem Bildschirm unsichtbaren
 * Container (#printExportContainer in index.html), der nur über eine
 * @media print-Regel sichtbar wird (siehe styles.css) — alles andere wird
 * während des Drucks ausgeblendet. Der Container wird nach dem Drucken
 * (afterprint-Event) wieder geleert, damit seine Inhalte nicht dauerhaft
 * doppelte IDs/Klassen mit der Live-Seite im DOM stehen haben.
 */
const PdfExport = {
  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // IDs aus dem Druck-HTML entfernen: der Ausdruck braucht keine
  // Interaktivität, aber ohne das würden Live-Seite und Druck-Kopie kurz
  // dieselben IDs im DOM tragen (ungültiges HTML) — Risiko, dass ein
  // getElementById() der Live-Seite versehentlich das unsichtbare
  // Druck-Element statt des echten trifft.
  _stripIds(html) {
    return html.replace(/\sid="[^"]*"/g, '');
  },

  updateVisibility() {
    const btn = document.getElementById('pdfExportBtn');
    if (btn) btn.style.display = (App.currentCharacter && App._printTabs().length) ? '' : 'none';
  },

  init() {
    document.getElementById('pdfExportBtn')?.addEventListener('click', () => this.export());
    window.addEventListener('afterprint', () => this._cleanup());
    this.updateVisibility();
  },

  _cleanup() {
    const container = document.getElementById('printExportContainer');
    if (container) container.innerHTML = '';
  },

  export() {
    const char = App.currentCharacter;
    const tabIds = App._printTabs();
    if (!char || !tabIds.length) return;

    const container = document.getElementById('printExportContainer');
    if (!container) return;

    // Druckansicht ist immer die Leseansicht — Eingabefelder ergeben auf
    // Papier keinen Sinn, view-mode-HTML ist zudem kompakter.
    const originalEditMode = App.editMode;
    App.editMode = false;

    const sections = tabIds.map(tabId => {
      const tabDef = App._tab(tabId);
      const page = App._page(tabId);
      if (!tabDef || !page) return '';
      const html = typeof page.renderPrint === 'function' ? page.renderPrint(char) : page.render(char);
      return `<section class="print-section">
        <h2 class="print-section-title">${tabDef.icon} ${this._esc(tabDef.label)}</h2>
        ${this._stripIds(html)}
      </section>`;
    }).join('');

    App.editMode = originalEditMode;

    container.innerHTML = `
      <div class="print-doc-header">
        <h1>${this._esc(char.metadata?.name || 'Unbenannt')}</h1>
      </div>
      ${sections}
    `;

    window.print();
  },
};
