/**
 * Delta-Green-Manifest – zweites Regelwerk neben MGT2 und der Universal-
 * Kopiervorlage (Multi-System, siehe systems/README.md und den
 * Delta-Green-Plan in Todo.txt).
 *
 * Delta Green (Agenten-Horror-Kampagnen, d100-Fertigkeitsproben) hat keine
 * Karriere-Generierung, kein Schiff, keine Karte, keine Finanz-Kategorien —
 * entsprechend schlank bleibt dieses Manifest, ganz im Sinne der
 * Universal-Vorlage. Namespace-Regel: alle Regeldaten unter
 * character.systemData (siehe pages/stats.js).
 *
 * Bewusst KEIN eigenes backgroundPath/keyEventsPath — der jetzt gefixte
 * Kern-Fallback (App._backgroundPath()/_keyEventsPath()) zeigt automatisch
 * auf character.systemData.background/.keyEvents.
 *
 * Bewusst KEIN Marken-Logo (Eye-in-Triangle) — icon ist ein neutrales
 * Emoji, wie beim Universal-Template. `defaultSkills` (User-Wunsch
 * 25.07.2026) befüllt neue Charaktere mit den Fertigkeits-NAMEN vom
 * offiziellen Charakterbogen als Startpunkt, jeweils mit dem dort
 * abgedruckten Basis-Prozentwert im Namen selbst (z.B. "Anthropologie
 * (0%)", User-Wunsch 26.07.2026) — das ist trotzdem kein starrer Katalog:
 * die Fertigkeiten-Liste bleibt die freie Name+Wert-Liste aus
 * pages/stats.js, frei umbenennbar/löschbar/erweiterbar, und der
 * eigentliche Wert (was der Charakter tatsächlich investiert hat) startet
 * unabhängig vom Namenstext weiterhin bei 0, wie ein manuell
 * hinzugefügter Eintrag. Gilt nur für NEU angelegte Charaktere, keine
 * rückwirkende Migration (siehe "Standard-Fertigkeiten ergänzen"-Knopf in
 * pages/stats.js für Bestandscharaktere).
 *
 * Muss NACH systems/mgt2/manifest.js geladen werden (MGT2 bleibt Fallback
 * für Bestandscharaktere ohne/mit unbekannter System-Kennung).
 */
const DeltaGreenSystem = {
  id:   'delta-green',
  name: 'Delta Green',

  banner: { label: 'Delta Green', icon: '🕵️' },

  // Begriffs-Labels: Delta-Green-Agenten führen Operationen statt Quests,
  // schreiben Einsatzberichte statt Session-Notizen, und "Wohnort" passt
  // besser als "Heimatplanet" für ein Gegenwarts-Setting.
  labels: {
    quest: 'Operation', quests: 'Operationen',
    session: 'Einsatzbericht', sessions: 'Einsatzberichte',
    homeworld: 'Wohnort',
  },

  // Kalender-Vertrag: natives Datumsfeld statt Imperialkalender, siehe
  // delta-green/calendar.js.
  calendar: DgCalendar,

  // Zusatzfeld für Log-Personen: Bindungswert (0-10) zu wichtigen Kontakten
  // — ein Delta-Green-Kernkonzept (kann anstelle von Sanity beschädigt
  // werden), kein Kern-Konzept, daher hier deklariert statt in notes.js
  // fest verdrahtet (siehe App._entityExtraFields()).
  entityExtraFields: {
    persons: [
      { key: 'bondScore', label: 'Bindung', type: 'number', min: 0, max: 10, default: 0 },
    ],
  },

  // Kein currency/financeCategories-Override: Delta-Green-Agenten haben kein
  // eigenes Wirtschaftssystem wie MGT2s Handel — der neutrale Kern-Fallback
  // (App._currency()/_financeCategories(), siehe app.js) reicht für die
  // schlichte Ausgaben-/Einnahmen-Verwaltung auf der Finanzen-Seite.

  // Zusatzfelder auf der Kern-Charakterseite (User-Wunsch 25.07.2026):
  // Profession/Nationalität/Ausbildung wie die übrigen Kern-Textfelder,
  // Aussehen als mehrzeiliges Feld (neuer Kern-Feldtyp "textarea",
  // App._renderExtraFieldHtml()). Liegen unter character.metadata
  // (Bestandsschutz-Muster wie MGT2s heroXp), kein eigener Datenpfad nötig.
  metadataExtraFields: [
    { key: 'profession',  label: 'Profession',                type: 'text' },
    { key: 'nationality', label: 'Nationalität',               type: 'text' },
    { key: 'education',   label: 'Schulbildung, Ausbildung',   type: 'text' },
    { key: 'appearance',  label: 'Äußerliche Beschreibung',    type: 'textarea', rows: 3 },
  ],

  // Standard-Notation für das Würfel-Widget: Delta Green würfelt Prozentwerte
  // (2x W10 = W100) gegen Fertigkeitswerte.
  diceDefault: 'D100',

  // PDF-Export (User-Wunsch 31.07.2026, siehe pdf-export.js): Agent, Werte
  // und Ausrüstung, in dieser Reihenfolge. Bewusst nicht Hintergrund/Log —
  // nur die klassischen "Charakterbogen"-Werte, wie explizit gewünscht.
  // Kein entsprechender Schlüssel bei MGT2/Universal (Anpassungswünsche
  // gelten bis auf Widerruf nur für Delta Green) — der Druck-Knopf bleibt
  // dort deshalb unsichtbar.
  printTabs: ['metadata', 'stats', 'equipment'],

  // Vorbefüllung für character.systemData.skills bei der Neuanlage (siehe
  // App._seedDefaultSkills()) — Fertigkeits-NAMEN samt Basis-Prozentwert
  // vom offiziellen Charakterbogen, im Namen selbst (siehe Kommentar
  // oben); der tatsächliche Fertigkeitswert (systemData.skills[].value)
  // startet trotzdem bei 0.
  defaultSkills: [
    'Anthropologie (0%)', 'Archäologie (0%)', 'Artillerie (0%)',
    'Athletik (30%)', 'Ausweichen (30%)', 'Auto fahren (20%)',
    'Buchhaltung (10%)', 'Bürokratie (10%)', 'Chirurgie (0%)',
    'Computerwissenschaften (0%)', 'Erkunden (20%)', 'Erste Hilfe (10%)',
    'Forensik (0%)', 'Geschichte (10%)', 'Gesetzeskunde (0%)',
    'Handwerk (0%)', 'Heimlichkeit (10%)', 'HUMINT (10%)',
    'Kriminologie (10%)', 'Kunst (0%)', 'Lotsen und lenken (0%)',
    'Medizin (0%)', 'Militärwissenschaften (0%)', 'Nahkampfwaffen (30%)',
    'Navigation (10%)', 'Okkultismus (10%)', 'Pharmazie (0%)',
    'Psychotherapie (10%)', 'Reiten (10%)', 'Schusswaffen (20%)',
    'Schwere Maschinen (10%)', 'Schwere Waffen (0%)', 'Schwimmen (20%)',
    'SIGINT (0%)', 'Sprengstoffe (0%)', 'Überlebenskunst (10%)',
    'Überreden (20%)', 'Unnatürlich (0%)', 'Verkleiden (10%)',
    'Wachsamkeit (20%)', 'Waffenloser Kampf (40%)', 'Wissenschaften (0%)',
  ],

  tabs: [
    { id: 'metadata',   icon: '👤', label: 'Agent',       page: () => MetadataPage },
    { id: 'stats',      icon: '📊', label: 'Werte',       page: () => DgStatsPage },
    { id: 'equipment',  icon: '🎒', label: 'Ausrüstung',  page: () => EquipmentPage },
    { id: 'background', icon: '📖', label: 'Hintergrund', page: () => DgBackgroundPage },
    { id: 'notes',      icon: '📝', label: 'Log',         page: () => NotesPage },
  ],

  // Merge-Vertrag: Fertigkeiten- UND Störungen-Liste granular mergen (wie
  // Universal), damit zwei Geräte gleichzeitig unterschiedliche Einträge
  // ändern können.
  mergeSpec: {
    arrays: {
      'systemData.skills':    true,
      'systemData.disorders': true,
    },
  },
};

SystemRegistry.register(DeltaGreenSystem);
