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

  // Header-Banner (Kopfzeile der App): kurzer Markenname + Icon, ersetzt das
  // zuvor hart in index.html stehende Traveller-Logo. icon darf rohes
  // SVG-Markup (beginnt mit "<") oder ein einfaches Emoji sein — siehe
  // App._banner()/_updateHeaderBanner(). Dasselbe Kompassrosen-Icon wie
  // bisher, jetzt als MGT2-Manifest-Wert statt Kern-Konstante.
  banner: {
    label: 'Traveller',
    icon: `<svg class="traveller-icon" viewBox="0 0 36 36" width="30" height="30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="0.75"/>
      <g stroke="white" stroke-width="1.6" stroke-linecap="round" opacity="0.92">
        <line x1="18" y1="4"    x2="18" y2="11"/>
        <line x1="18" y1="25"   x2="18" y2="32"/>
        <line x1="4"  y1="18"   x2="11" y2="18"/>
        <line x1="25" y1="18"   x2="32" y2="18"/>
        <line x1="8.1"  y1="8.1"  x2="13.2" y2="13.2"/>
        <line x1="22.8" y1="22.8" x2="27.9" y2="27.9"/>
        <line x1="27.9" y1="8.1"  x2="22.8" y2="13.2"/>
        <line x1="8.1"  y1="27.9" x2="13.2" y2="22.8"/>
      </g>
      <circle cx="18" cy="18" r="3.8" fill="white"/>
      <circle cx="18" cy="2"  r="1.9" fill="#a78bfa"/>
      <circle cx="34" cy="18" r="1.5" fill="#60a5fa"/>
    </svg>`,
  },

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

  // Datenpfad des Kern-Bausteins "career-background" (Phase 2, Feld-Audit
  // Fund F1, siehe pages/career-background.js): Prägende Ereignisse und
  // Hintergrund & Persönlichkeit liegen bei MGT2 weiterhin unter career.*
  // (Bestandsschutz) statt am neuen Kern-Standardpfad background/keyEvents.
  backgroundPath: 'career.background',
  keyEventsPath: 'career.keyEvents',

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
