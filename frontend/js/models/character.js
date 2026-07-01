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
      age: data.metadata?.age || 18,
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
      psi: data.attributes?.psi || { value: -1, current: -1, dm: 0 }
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
    this.equipment = data.equipment || [];
    this.notes = Character._migrateNotes(data.notes);
    this.radiationDose = typeof data.radiationDose === 'number' ? data.radiationDose : 0;
    this.firstAidLog = Array.isArray(data.firstAidLog) ? data.firstAidLog : [];
    this.finances = {
      cashCredits:    typeof data.finances?.cashCredits === 'number' ? data.finances.cashCredits : 0,
      pension:        typeof data.finances?.pension     === 'number' ? data.finances.pension     : 0,
      transactions:   Array.isArray(data.finances?.transactions)   ? data.finances.transactions   : [],
      recurringItems: Array.isArray(data.finances?.recurringItems) ? data.finances.recurringItems : [],
      debts:          Array.isArray(data.finances?.debts)          ? data.finances.debts          : [],
    };
    this.career    = Character._migrateCareer(data.career);
    this.training  = Array.isArray(data.training) ? data.training : [];
    this.ships        = Array.isArray(data.ships) ? data.ships.map(s => Character._migrateShip(s)) : [];
    this.activeShipId = data.activeShipId || null;
    this.shipRoles    = (data.shipRoles && typeof data.shipRoles === 'object' && !Array.isArray(data.shipRoles)) ? data.shipRoles : {};
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
      image:            raw.image        || null,
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
      weapons:          Array.isArray(raw.weapons)          ? raw.weapons          : [],
      critHits:         (raw.critHits && typeof raw.critHits === 'object') ? raw.critHits : {},
      crewPositions:    Array.isArray(raw.crewPositions)    ? raw.crewPositions    : [],
      operatingCost:    parseInt(raw.operatingCost)     || 0,
      notes:            raw.notes        || '',
      createdAt:        raw.createdAt    || new Date().toISOString(),
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

    // Aktuelles Format
    return {
      sessions:  Array.isArray(raw.sessions)  ? raw.sessions  : [],
      persons:   Array.isArray(raw.persons)   ? raw.persons   : [],
      locations: Array.isArray(raw.locations) ? raw.locations : [],
      quests:    Array.isArray(raw.quests)    ? raw.quests    : []
    };
  }

  /**
   * Zu JSON konvertieren (für Storage)
   */
  toJSON() {
    return {
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
    };
  }

  /**
   * Aus JSON erstellen
   */
  static fromJSON(data) {
    return new Character(data);
  }
}
