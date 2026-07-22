/**
 * Werte – generische Attribut-/Fertigkeiten-Listen des Universal-Templates
 * (Multi-System Phase 4). Komponiert aus dem Kern-Widget
 * CoreWidgets.renderValueList/attachValueList statt eigene Zeilen-Logik zu
 * bauen — für ein künftiges konkretes System als Vorbild gedacht (siehe
 * systems/README.md): eigene Regelwerks-Werte ersetzen hier Stück für
 * Stück die freien Listen.
 *
 * Daten liegen unter character.systemData.{attributes,skills}
 * (Namespace-Regel) statt eigener Top-Level-Felder.
 */
const UniversalValuesPage = {

  _attributes(char) {
    return char.systemData.attributes || (char.systemData.attributes = []);
  },
  _skills(char) {
    return char.systemData.skills || (char.systemData.skills = []);
  },

  render(character) {
    const attributes = this._attributes(character);
    const skills     = this._skills(character);
    return `<div class="universal-values-page">
      ${CoreWidgets.renderValueList(attributes, {
        title: 'Attribute', idPrefix: 'uvAttr',
        namePlaceholder: 'z.B. Stärke', valuePlaceholder: 'z.B. 12', addLabel: '+ Attribut',
      })}
      ${CoreWidgets.renderValueList(skills, {
        title: 'Fertigkeiten', idPrefix: 'uvSkill',
        namePlaceholder: 'z.B. Schwertkampf', valuePlaceholder: 'z.B. 3', addLabel: '+ Fertigkeit',
      })}
    </div>`;
  },

  save(character) { /* CoreWidgets speichert direkt bei jeder Änderung */ },

  attachListeners() {
    const char = window.currentCharacter;
    // Nur bei Hinzufügen/Löschen nötig — ein reiner Feld-Blur speichert
    // direkt in CoreWidgets.attachValueList(), ohne die Seite neu zu rendern.
    const rerenderOnStructureChange = () => {
      document.getElementById('values-page').innerHTML = this.render(char);
      this.attachListeners();
    };
    CoreWidgets.attachValueList(char, this._attributes(char), { idPrefix: 'uvAttr' },  rerenderOnStructureChange);
    CoreWidgets.attachValueList(char, this._skills(char),     { idPrefix: 'uvSkill' }, rerenderOnStructureChange);
  },
};
