/**
 * MGT2-Manifest – der Vertrag des Mongoose-Traveller-2e-Moduls mit dem Kern
 * (Multi-System Phase 1, siehe systems/README.md).
 *
 * Registriert sich unter der historischen id 'traveller', die seit jeher in
 * jedem Charakter steht (character.system) — bewusst KEINE Umbenennung, damit
 * Bestandsdaten, Verlaufsversionen, Backups und Exporte unverändert gelten
 * (Entscheidung "B+", keine Datenmigration).
 *
 * Phase-1-Umfang: id, Name und die Tab-Leiste (Reihenfolge, Icons, Labels und
 * Seiten exakt wie zuvor hart in index.html/app.js verdrahtet — null
 * Verhaltensänderung). Weitere Vertragsschlüssel (currency, calendar, labels,
 * entityExtraFields, mergeSpec, …) folgen in Phase 2.
 */
const Mgt2System = {
  id:   'traveller',
  name: 'Mongoose Traveller 2e',

  // Kalender-Vertrag (Phase 2): In-Game-Datumsfelder der Kern-Seiten —
  // Widget, Placeholder und Label kommen von hier, siehe mgt2/calendar.js.
  calendar: Mgt2Calendar,

  // Mischung aus Kern-Seiten (metadata, equipment, notes) und MGT2-Seiten
  // (attributes, ship, combat, career, karte — liegen unter systems/mgt2/).
  tabs: [
    { id: 'metadata',   icon: '👤',  label: 'Charakter',  page: () => MetadataPage },
    { id: 'attributes', icon: '⚡',  label: 'Attribute',  page: () => AttributesPage },
    { id: 'equipment',  icon: '🎒',  label: 'Ausrüstung', page: () => EquipmentPage },
    { id: 'ship',       icon: '🚀',  label: 'Schiff',     page: () => ShipPage },
    { id: 'combat',     icon: '⚔️',  label: 'Kampf',      page: () => CombatPage },
    { id: 'career',     icon: '📋',  label: 'Werdegang',  page: () => CareerPage },
    { id: 'notes',      icon: '📝',  label: 'Log',        page: () => NotesPage },
    { id: 'karte',      icon: '🗺️',  label: 'Karte',      page: () => KartePage },
  ],
};

SystemRegistry.register(Mgt2System);
