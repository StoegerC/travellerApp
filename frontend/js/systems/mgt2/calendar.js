/**
 * Mgt2Calendar – Imperialkalender-Eingabe als Kalender-Vertrag des
 * MGT2-Moduls (Multi-System Phase 2, siehe systems/README.md).
 *
 * Der Kern rendert In-Game-Datumsfelder über App._calendar() und kennt das
 * Format nicht. Vertrag:
 *   label                  – Zusatz im Feld-Label, z.B. "In-Game-Datum (Imperialkalender)"
 *   placeholder            – für einfache Textfelder (Popover, Finanzen, Geburtsdatum)
 *   renderInput(id, value) – HTML des Eingabe-Widgets; ein (ggf. verstecktes)
 *                            Feld mit GENAU dieser id trägt den Wert-String,
 *                            den save()-Code wie bisher per getElementById(id).value liest
 *   attachInput(id)        – Listener nach dem Render anhängen
 *   setInput(id, value)    – Wert programmatisch setzen (z.B. Vorbelegung vom
 *                            aktiven Journal); feuert ein bubbelndes input-Event
 *
 * Wichtig (Vertrags-Pflicht, Fund L5): der Wert-String muss lexikografisch
 * chronologisch sortieren — "YYYY-DDD" (z.B. 1105-032) erfüllt das.
 */
const Mgt2Calendar = {
  label: 'Imperialkalender',
  placeholder: 'z.B. 1105-034',

  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // Jahr- und Tag-Feld, dahinter das versteckte Wertfeld (id) und die
  // Vorschau — dasselbe Markup, das zuvor doppelt in notes.js stand.
  renderInput(id, value) {
    const v = String(value || '');
    const [year, day] = v ? v.split('-') : ['', ''];
    return `
      <div class="trav-date-simple">
        <div class="trav-date-fields">
          <div class="trav-date-field-wrap">
            <span class="trav-date-sub-label">Jahr</span>
            <input type="number" id="${id}-year" class="trav-date-num-inp"
                   value="${this._esc(year)}" min="0" max="9999" placeholder="z.B. 1106">
          </div>
          <div class="trav-date-field-wrap">
            <span class="trav-date-sub-label">Tag (1–365)</span>
            <input type="number" id="${id}-day" class="trav-date-num-inp"
                   value="${day ? String(parseInt(day)) : ''}" min="1" max="365" placeholder="z.B. 190">
          </div>
        </div>
        <input type="hidden" id="${id}" value="${this._esc(v)}">
        <div class="trav-date-preview" id="${id}-preview"${v ? '' : ' style="display:none"'}>${this._esc(v)}</div>
      </div>`;
  },

  attachInput(id) {
    const yearInp = document.getElementById(`${id}-year`);
    const dayInp  = document.getElementById(`${id}-day`);
    const hidden  = document.getElementById(id);
    const preview = document.getElementById(`${id}-preview`);
    if (!yearInp || !dayInp || !hidden) return;

    const update = () => {
      const year = parseInt(yearInp.value);
      const day  = parseInt(dayInp.value);
      if (!yearInp.value || !dayInp.value || isNaN(year) || isNaN(day) || day < 1 || day > 365) {
        hidden.value = '';
        if (preview) { preview.textContent = ''; preview.style.display = 'none'; }
        return;
      }
      const dateStr = `${year}-${String(day).padStart(3, '0')}`;
      hidden.value = dateStr;
      if (preview) {
        preview.textContent = dateStr;
        preview.style.display = '';
      }
    };

    yearInp.addEventListener('input', update);
    dayInp.addEventListener('input', update);
  },

  setInput(id, value) {
    const yearInp = document.getElementById(`${id}-year`);
    const dayInp  = document.getElementById(`${id}-day`);
    if (!yearInp || !dayInp) return;
    const [year, day] = String(value || '').split('-');
    if (!year || !day) return;
    yearInp.value = year;
    dayInp.value  = String(parseInt(day));
    // input-Event stößt den attachInput-Sync (Wertfeld + Vorschau) und den
    // Autosave an (bubbles, siehe App-Listener auf dem Content-Bereich).
    yearInp.dispatchEvent(new Event('input', { bubbles: true }));
  },
};
