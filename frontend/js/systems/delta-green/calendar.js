/**
 * DgCalendar – Kalender-Vertrag des Delta-Green-Moduls (siehe
 * systems/mgt2/calendar.js für den Vertrag, systems/README.md für die
 * Erklärung). Delta Green spielt in der Gegenwart — ein natives
 * <input type="date"> reicht, kein eigenes Kalenderformat wie bei MGT2s
 * Imperialkalender nötig. Der Browser liefert/erwartet bereits ISO-Datum
 * (JJJJ-MM-TT), das erfüllt die Vertrags-Pflicht (lexikografisch
 * chronologisch sortierbar) automatisch.
 */
const DgCalendar = {
  label: 'Datum',
  placeholder: 'JJJJ-MM-TT',

  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  renderInput(id, value) {
    return `<input type="date" id="${id}" value="${this._esc(value)}">`;
  },

  // Natives <input type="date"> braucht keine eigene Sync-Logik zwischen
  // Teilfeldern (anders als Mgt2Calendar) — der Wert steht schon direkt im
  // Feld mit genau dieser id, Autosave greift über das bestehende
  // bubbelnde 'input'-Event des Content-Bereichs.
  attachInput(id) {},

  setInput(id, value) {
    const el = document.getElementById(id);
    if (!el || el.value) return;
    el.value = String(value || '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
};
