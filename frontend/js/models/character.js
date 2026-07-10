/**
 * Character Modell für Traveller Classic
 */
class Character {
  constructor(data = {}) {
    this.id         = data.id         || 'char-' + Date.now();
    this.system     = data.system     || 'traveller';
    this.syncMode   = data.syncMode   || 'local';
    this.campaignId = data.campaignId || null;
    this.metadata = {
      name: data.metadata?.name || '',
      title: data.metadata?.title || '',
      homeworld: data.metadata?.homeworld || '',
      age:       data.metadata?.age       || 18,
      birthdate: data.metadata?.birthdate || '',
      // Mehrere Porträts; Rückwärtskompatibilität: altes portraitImage → portraits[0]
      portraits:      data.metadata?.portraits      || (data.metadata?.portraitImage ? [data.metadata.portraitImage] : []),
      portraitIndex:  data.metadata?.portraitIndex  || 0
    };
    this.attributes = {
      strength: data.attributes?.strength || { value: 6, current: 6, dm: 0 },
      dexterity: data.attributes?.dexterity || { value: 6, current: 6, dm: 0 },
      endurance: data.attributes?.endurance || { value: 6, current: 6, dm: 0 },
      intelligence: data.attributes?.intelligence || { value: 6, current: 6, dm: 0 },
      education: data.attributes?.education || { value: 6, current: 6, dm: 0 },
      socialStatus: data.attributes?.socialStatus || { value: 6, current: 6, dm: 0 },
      psi: data.attributes?.psi || { value: -1, current: -1, dm: -2 }
    };
    // Skills: Sammlung aller Skills mit Levels
    const baseSkills = this.initializeSkills();
    if (Array.isArray(data.skills) && data.skills.length > 0) {
      const _lvl = l => { const n = parseInt(l); return isNaN(n) ? -3 : (n === -1 ? -3 : n); };
      // Mappe Basis-Skills und erhalte Level
      const mapped = baseSkills.map(skill => {
        const existing = data.skills.find(s => s.name === skill.name);
        return {
          name: skill.name,
          level: existing ? _lvl(existing.level) : -3
        };
      });

      // Füge zusätzliche, benutzerdefinierte Skills hinzu, die nicht in baseSkills vorhanden sind
      const baseNames = new Set(baseSkills.map(s => s.name));
      const extras = data.skills
        .filter(s => !baseNames.has(s.name))
        .map(s => ({ name: s.name, level: _lvl(s.level) }));

      this.skills = mapped.concat(extras);
    } else {
      this.skills = baseSkills;
    }
    this.skills = Character._withSyncFields(this.skills);
    this.equipment = Character._withSyncFields(data.equipment || []);
    this.notes = Character._migrateNotes(data.notes);
    for (const k of ['sessions', 'persons', 'locations', 'quests']) {
      this.notes[k] = Character._withSyncFields(this.notes[k]);
    }
    this.radiationDose = typeof data.radiationDose === 'number' ? data.radiationDose : 0;
    this.firstAidLog = Array.isArray(data.firstAidLog) ? data.firstAidLog : [];
    this.finances = {
      cashCredits:    typeof data.finances?.cashCredits === 'number' ? data.finances.cashCredits : 0,
      pension:        typeof data.finances?.pension     === 'number' ? data.finances.pension     : 0,
      transactions:   Character._withSyncFields(data.finances?.transactions),
      recurringItems: Character._withSyncFields(data.finances?.recurringItems),
      debts:          Character._withSyncFields(data.finances?.debts),
    };
    this.career = Character._migrateCareer(data.career);
    this.career.terms     = Character._withSyncFields(this.career.terms);
    this.career.keyEvents = Character._withSyncFields(this.career.keyEvents);
    this.training  = Character._withSyncFields(data.training);
    this.ships        = Array.isArray(data.ships) ? data.ships.map(s => Character._migrateShip(s)) : [];
    this.activeShipId = data.activeShipId || null;
    this.shipRoles    = (data.shipRoles && typeof data.shipRoles === 'object' && !Array.isArray(data.shipRoles)) ? data.shipRoles : {};
    // Zuletzt vom Server gesehener Versions-Zeitstempel (opaker String, siehe
    // backend/db.js updated_at) — für die optimistische Sperre beim Push.
    this._syncMeta = { updatedAt: data._syncMeta?.updatedAt || null };
  }

  /**
   * Ergänzt fehlende Merge-Felder (updatedAt/_deleted/deletedAt) auf einer
   * Liste von Items mit stabiler id. Bestehende Werte bleiben unangetastet —
   * nur zur Rückwärtskompatibilität für Altdaten ohne diese Felder.
   */
  static _withSyncFields(items) {
    return (Array.isArray(items) ? items : []).map(item => ({
      ...item,
      updatedAt: item.updatedAt || new Date(0).toISOString(),
      _deleted:  item._deleted === true,
      deletedAt: item.deletedAt || null,
    }));
  }

  /**
   * Initialisiert alle Skills mit Level 0
   */
  initializeSkills() {
    if (typeof TravellerSkills !== 'undefined') {
      return TravellerSkills.getSkills().map(skillName => ({
        name: skillName,
        level: -3
      }));
    }
    return [];
  }

  /**
   * Validiert ein Attribut (0-15 für Traveller Classic)
   */
  setAttribute(name, value) {
    const val = parseInt(value) || 0;
    if (val < 0 || val > 15) {
      throw new Error(`Attribut ${name} muss zwischen 0 und 15 liegen`);
    }
    if (this.attributes.hasOwnProperty(name)) {
      this.attributes[name] = val;
    }
  }

  /**
   * Skill hinzufügen oder aktualisieren
   */
  addSkill(name, level = 0) {
    const existing = this.skills.find(s => s.name === name);
    if (existing) {
      existing.level = level;
    } else {
      this.skills.push({ name, level });
    }
  }

  /**
   * Skill entfernen
   */
  removeSkill(name) {
    this.skills = this.skills.filter(s => s.name !== name);
  }

  /**
   * Ausrüstung hinzufügen
   */
  addEquipment(item) {
    this.equipment.push({
      name: item.name || '',
      type: item.type || '',
      notes: item.notes || ''
    });
  }

  /**
   * Ausrüstung entfernen
   */
  removeEquipment(index) {
    this.equipment.splice(index, 1);
  }

  static _migrateShip(raw = {}) {
    const id = raw.id || ('ship-' + Date.now() + '-' + Math.floor(Math.random() * 10000));
    return {
      id,
      name:             raw.name         || 'Unbenannt',
      class:            raw.class        || '',
      tl:               raw.tl           || '',
      tonnage:          raw.tonnage      || '',
      owner:            raw.owner        || '',
      isCampaign:       raw.isCampaign   !== false,
      // Altbestand (Phase 2, ein einzelnes Bild) wird in die neue Mehrfach-
      // Bilder-Liste uebernommen, damit bestehende Schiffsbilder nicht
      // verloren gehen - danach ist images[] die alleinige Quelle.
      images:           Array.isArray(raw.images) ? raw.images : [raw.imageFileId, raw.image].filter(Boolean),
      imageIndex:       Number.isInteger(raw.imageIndex) ? raw.imageIndex : 0,
      attachments:      Array.isArray(raw.attachments) ? raw.attachments : [],
      hullMax:          parseInt(raw.hullMax)           || 0,
      hullCurrent:      raw.hullCurrent  != null ? parseInt(raw.hullCurrent)      : (parseInt(raw.hullMax) || 0),
      structureMax:     parseInt(raw.structureMax)      || 0,
      structureCurrent: raw.structureCurrent != null ? parseInt(raw.structureCurrent) : (parseInt(raw.structureMax) || 0),
      armor:            parseInt(raw.armor)             || 0,
      armorBase:        parseInt(raw.armorBase)         || 0,
      mDrive:           raw.mDrive       || '',
      jDrive:           raw.jDrive       || '',
      powerPlant:       raw.powerPlant   || '',
      computer:         raw.computer     || '',
      sensors:          raw.sensors      || '',
      fuelMax:          parseInt(raw.fuelMax)           || 0,
      fuelCurrent:      raw.fuelCurrent  != null ? parseInt(raw.fuelCurrent)      : (parseInt(raw.fuelMax) || 0),
      weapons:          Character._withSyncFields(raw.weapons),
      critHits:         (raw.critHits && typeof raw.critHits === 'object') ? raw.critHits : {},
      critNotes:        (raw.critNotes && typeof raw.critNotes === 'object') ? raw.critNotes : {},
      crewRoles:        (raw.crewRoles && typeof raw.crewRoles === 'object') ? raw.crewRoles : {},
      crewPositions:    Array.isArray(raw.crewPositions)    ? raw.crewPositions    : [],
      operatingCost:    parseInt(raw.operatingCost)     || 0,
      notes:            raw.notes        || '',
      createdAt:        raw.createdAt    || new Date().toISOString(),
      updatedAt:        raw.updatedAt    || new Date(0).toISOString(),
      _deleted:         raw._deleted === true,
      deletedAt:        raw.deletedAt    || null,
      finances: {
        cashCredits:    typeof raw.finances?.cashCredits === 'number' ? raw.finances.cashCredits : 0,
        transactions:   Character._withSyncFields(raw.finances?.transactions),
        recurringItems: Character._withSyncFields(raw.finances?.recurringItems),
        debts:          Character._withSyncFields(raw.finances?.debts),
      },
    };
  }

  static _migrateCareer(raw) {
    const empty = {
      terms: [], keyEvents: [],
      background: { appearance: '', personality: '', goals: '', motivation: '', secrets: '', secretsHidden: true, quotes: [] }
    };
    if (!raw) return empty;

    // Already new format
    if (Array.isArray(raw.terms)) {
      return {
        terms:      raw.terms,
        keyEvents:  Array.isArray(raw.keyEvents) ? raw.keyEvents : [],
        background: {
          appearance:    raw.background?.appearance    || '',
          personality:   raw.background?.personality   || '',
          goals:         raw.background?.goals         || '',
          motivation:    raw.background?.motivation    || '',
          secrets:       raw.background?.secrets       || '',
          secretsHidden: raw.background?.secretsHidden !== false,
          quotes:        Array.isArray(raw.background?.quotes) ? raw.background.quotes : [],
        }
      };
    }

    // Migrate old careerHistory format
    const terms = (Array.isArray(raw.careerHistory) ? raw.careerHistory : []).map((h, i) => ({
      id: 'term-' + i,
      service: 'Other',
      rank: i === 0 ? String(raw.rank || '') : '',
      events: h.name ? `${h.name} (${h.years || 0} Jahre)` : '',
      skills: [],
      benefits: i === 0 && Array.isArray(raw.benefits) ? raw.benefits.join(', ') : '',
      musteredOut: false,
      musterOutReason: '',
    }));
    return { ...empty, terms };
  }

  /**
   * Migriert beliebige alte notes-Formate auf die aktuelle Struktur
   */
  static _migrateNotes(raw) {
    const empty = { sessions: [], persons: [], locations: [], quests: [] };
    if (!raw) return empty;

    // Uraltes Format: reiner String
    if (typeof raw === 'string') return empty;

    // Altes Format v1: { chronicle, persons }
    if (Array.isArray(raw.chronicle)) {
      return {
        sessions: raw.chronicle.map(c => ({
          id: c.id || ('s' + Date.now() + Math.random()),
          sessionDate: '',
          inGameDate: '',
          title: c.timestamp || 'Importiert',
          content: `<p>${(c.text || '').replace(/\n/g, '</p><p>')}</p>`,
          tags: { persons: [], locations: [], quests: [], events: [] }
        })),
        persons: (raw.persons || []).map(p => ({
          id: p.id || ('p' + Date.now() + Math.random()),
          name: p.name || '',
          role: '',
          description: p.notes || '',
          status: 'unknown',
          relation: 'neutral'
        })),
        locations: [],
        quests: []
      };
    }

    // Aktuelles Format. Additive Migration pro Person/Quest: alte
    // Einzel-Felder (locationId/questgiverId) werden in die neuen
    // Mehrfach-Felder uebernommen, aber nicht entfernt - fuer den Fall,
    // dass irgendwo noch Code auf das alte Feld schaut.
    const persons = (Array.isArray(raw.persons) ? raw.persons : []).map(p => ({
      ...p,
      locationIds: Array.isArray(p.locationIds) ? p.locationIds : (p.locationId ? [p.locationId] : []),
    }));
    const quests = (Array.isArray(raw.quests) ? raw.quests : []).map(q => ({
      ...q,
      questGiverIds: Array.isArray(q.questGiverIds) ? q.questGiverIds : (q.questgiverId ? [q.questgiverId] : []),
      locationIds:   Array.isArray(q.locationIds)   ? q.locationIds   : [],
    }));
    return {
      sessions:  Array.isArray(raw.sessions)  ? raw.sessions  : [],
      persons,
      locations: Array.isArray(raw.locations) ? raw.locations : [],
      quests,
    };
  }

  /**
   * Zu JSON konvertieren (für Storage)
   */
  toJSON() {
    // Deep-Clone noetig: verschachtelte Objekte/Arrays werden sonst per Referenz
    // zurueckgegeben. Storage.saveCharacter() haelt eine Kopie im Cache fuer den
    // Dirty-Check - mit Live-Referenzen wuerde jede spaetere Mutation (z.B.
    // character.notes.sessions.push(...)) auch den gecachten "alten" Stand
    // veraendern, wodurch der Vergleich nie einen Unterschied findet.
    return JSON.parse(JSON.stringify({
      id:         this.id,
      system:     this.system,
      syncMode:   this.syncMode,
      campaignId: this.campaignId,
      metadata: this.metadata,
      attributes: this.attributes,
      skills: this.skills,
      equipment: this.equipment,
      notes: this.notes,
      radiationDose: this.radiationDose,
      firstAidLog: this.firstAidLog,
      finances: this.finances,
      career:       this.career,
      training:     this.training,
      ships:        this.ships,
      activeShipId: this.activeShipId,
      shipRoles:    this.shipRoles,
      _syncMeta:    this._syncMeta,
    }));
  }

  /**
   * Aus JSON erstellen
   */
  static fromJSON(data) {
    return new Character(data);
  }
}
