/**
 * SystemRegistry – zentrale Anlaufstelle des Kerns für Regelsystem-Module
 * (Multi-System Phase 1, siehe Todo.txt und systems/README.md).
 *
 * Der Kern kennt nie ein konkretes System, sondern fragt hier mit
 * character.system nach dem Manifest. Jedes System registriert sich beim
 * Laden seines manifest.js selbst (Script-Reihenfolge: nach den Kern-Seiten,
 * vor app.js).
 */
const SystemRegistry = {
  _systems: {},
  _defaultId: null,

  register(manifest) {
    this._systems[manifest.id] = manifest;
    // Das zuerst registrierte System ist der Fallback für Charaktere ohne
    // (oder mit unbekannter) Kennung — heute MGT2 unter der historischen
    // id 'traveller', die bereits in jedem Bestandscharakter steht.
    if (!this._defaultId) this._defaultId = manifest.id;
  },

  // Manifest zur Kennung; unbekannte Kennungen fallen auf das Default-System
  // zurück. (Die Unbekannt-Regel — read-only + Hinweisbanner — kommt in
  // Phase 3, wenn es mehr als ein System gibt.)
  get(id) {
    return this._systems[id] || this._systems[this._defaultId];
  },

  has(id) { return !!this._systems[id]; },

  list() { return Object.values(this._systems); },
};
