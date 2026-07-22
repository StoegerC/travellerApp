/**
 * Universal-Manifest – minimales, spielunabhängiges Template (Multi-System
 * Phase 4). Dient als Beweis des Manifest-Vertrags UND als Kopiervorlage für
 * künftige konkrete Systeme (siehe systems/README.md) — bewusst KEIN
 * Regelwerk vorweggenommen (Plan-Entscheidung, kann sich jederzeit ändern).
 *
 * Nur Kern-Tabs + eine generische Werte-Seite; kein Kalender, keine
 * Entitäts-/Metadata-Zusatzfelder, keine Altersgrenze, kein
 * career-background-Kern-Baustein, kein Schiff, keine Karte, keine
 * Finanz-Kategorien. Jeder App._xxx()-Accessor hat dafür bereits einen
 * neutralen Fallback (siehe app.js) — ein neues System muss nur die
 * Schlüssel angeben, die von den MGT2-Defaults abweichen sollen.
 *
 * Muss NACH systems/mgt2/manifest.js geladen werden: SystemRegistry macht
 * das zuerst registrierte System zum Fallback für Bestandscharaktere ohne
 * (oder mit unbekannter) System-Kennung — das muss MGT2 bleiben.
 */
const UniversalSystem = {
  id:   'universal',
  name: 'Universal (spielunabhängig)',

  tabs: [
    { id: 'metadata',  icon: '👤', label: 'Charakter',  page: () => MetadataPage },
    { id: 'values',    icon: '📊', label: 'Werte',      page: () => UniversalValuesPage },
    { id: 'equipment', icon: '🎒', label: 'Ausrüstung', page: () => EquipmentPage },
    { id: 'notes',     icon: '📝', label: 'Log',        page: () => NotesPage },
  ],

  // Namespace-Regel (Plan §3): alle Regeldaten unter character.systemData.
  // mergeSpec deklariert die beiden Listen granular (keyField "id"), damit
  // zwei Geräte gleichzeitig unterschiedliche Einträge ändern können, ohne
  // dass eine Seite die andere beim Sync überschreibt (Challenge-Fund T2) —
  // jeder Eintrag trägt dafür id/createdAt/updatedAt und wird per Tombstone
  // statt splice gelöscht (Leitfaden-Fund L3, siehe core-widgets.js).
  mergeSpec: {
    arrays: {
      'systemData.attributes': true,
      'systemData.skills':     true,
    },
  },
};

SystemRegistry.register(UniversalSystem);
