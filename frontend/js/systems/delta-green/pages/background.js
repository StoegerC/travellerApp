/**
 * Hintergrund – Delta Green hat keine Karriere-Generierung (Agenten starten
 * fertig rekrutiert, keine Dienst-Timeline wie MGT2s Terms/Rang/Musterung).
 * Diese Seite ist deshalb ein reiner, dünner Wrapper um den Kern-Baustein
 * CareerBackground (Prägende Ereignisse, Hintergrund & Persönlichkeit,
 * Favoriten-Kontakte) — kein eigener Timeline-Block wie in
 * systems/mgt2/pages/career.js.
 *
 * Datenpfad kommt automatisch aus dem Kern-Fallback (kein backgroundPath/
 * keyEventsPath-Override im Manifest nötig): character.systemData.background/
 * character.systemData.keyEvents, siehe App._backgroundPath()/_keyEventsPath().
 */
const DgBackgroundPage = {
  render(character) {
    return CareerBackground.render(character);
  },

  save(character) { /* CareerBackground speichert direkt bei jeder Änderung */ },

  attachListeners() {
    const char = window.currentCharacter;
    const rerender = () => {
      document.getElementById('background-page').innerHTML = this.render(char);
      this.attachListeners();
    };
    CareerBackground.attachListeners(char, rerender);
  },
};
