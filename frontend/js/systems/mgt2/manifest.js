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

  // Begriffs-Labels (Phase 2): das Log-Paket im Kern nennt Quests/Sessions
  // mit diesen Wörtern statt sie fest zu verdrahten — siehe App._label().
  labels: { quest: 'Quest', quests: 'Quests', session: 'Session', sessions: 'Sessions' },

  // Kalender-Vertrag (Phase 2): In-Game-Datumsfelder der Kern-Seiten —
  // Widget, Placeholder und Label kommen von hier, siehe mgt2/calendar.js.
  calendar: Mgt2Calendar,

  // Zusatzfelder für Log-Entitäten (Phase 2, Feld-Audit Fund F2): die
  // Rassen-Auswahl im Personen-Formular ist Traveller-Inventar, kein
  // Kern-Konzept — Kern-Formular und -Popover rendern/lesen/befüllen sie
  // generisch über App._entityExtraFields() (siehe app.js).
  entityExtraFields: {
    persons: [
      { key: 'race', label: 'Rasse', type: 'select', default: 'Mensch',
        options: ['Mensch', 'Vargr', 'Aslan', 'Zhodani', 'Droyne', 'Hiver', "K'kree", 'Sonstige'] },
    ],
  },

  // Alters-Grenzen auf der Kern-Charakterseite (Phase 2, Feld-Audit Fund F3):
  // 18–120 ist eine MGT2-Annahme (Musterungsalter), kein Kern-Konzept.
  ageRange: [18, 120],

  // Währung & Finanz-Kategorien (Phase 2, Feld-Audit Fund F5): Kern-Seiten
  // (finances.js, equipment.js, notes.js) fragen App._currency()/
  // _financeCategories() statt "Cr" bzw. die Kategorienliste hart zu kennen.
  // CSS-Klasse pro Kategorie wird deklarativ aus dem key abgeleitet
  // ("cat-" + key) — siehe .cat-sold/.cat-equipment/… in styles.css.
  currency: 'Cr',
  financeCategories: [
    { key: 'sold',      label: 'Sold' },
    { key: 'equipment', label: 'Ausrüstung' },
    { key: 'ship',      label: 'Schiff' },
    { key: 'trade',     label: 'Handel' },
    { key: 'other',     label: 'Sonstiges' },
  ],
  // Automatische Buchungen (Schuldenrate, Abrechnung wiederkehrender Posten)
  // — bisher hart 'ship'/'other', jetzt deklariert statt in finances.js verdrahtet.
  defaultDebtCategory: 'ship',
  defaultSettleCategory: 'other',

  // Merge-Vertrag (Phase 2, sync-merge.js): Die Sync-Engine kennt keine
  // MGT2-Feldnamen mehr, sondern fragt hier nach den System-Arrays. Kern-
  // Arrays (notes.*, finances.*, equipment) sind für jedes System gleich
  // und werden unabhängig davon immer gemergt (siehe sync-merge.js).
  // arrays: Punkt-Pfad -> Merge-Key (true = "id", String = anderer Key,
  // z.B. "name" bei Skills). ships: eigenes Flag statt Pfad-Eintrag, weil
  // Schiffe Sub-Merges für weapons[]/finances.*[] brauchen (_mergeShips).
  mergeSpec: {
    arrays: {
      skills: 'name',
      training: true,
      'career.terms':     true,
      'career.keyEvents': true,
    },
    ships: true,
  },

  // Zusatzfeld auf der Kern-Charakterseite (Phase 2, Feld-Audit Fund F4):
  // Helden XP ist eine MGT2-Hausregel, kein Kern-Konzept. Bleibt unter
  // character.metadata.heroXp (Bestandsschutz) — auch der eigene, direkt
  // editierbare Zähler im Kampf-Tab (combat.js) liest/schreibt weiterhin
  // genau dieses Feld, das ist reiner MGT2-Code und bleibt unverändert.
  metadataExtraFields: [
    { key: 'heroXp', label: 'Helden XP', type: 'number', min: 0, step: 1, default: 0 },
  ],

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
