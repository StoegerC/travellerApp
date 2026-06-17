/**
 * Character Modell für Traveller Classic
 */
class Character {
  constructor(data = {}) {
    this.id = data.id || 'char-' + Date.now();
    this.system = data.system || 'traveller'; // Rollenspielsystem
    this.metadata = {
      name: data.metadata?.name || '',
      title: data.metadata?.title || '',
      homeworld: data.metadata?.homeworld || '',
      age: data.metadata?.age || 18,
      portraitImage: data.metadata?.portraitImage || null // Base64 encoded image
    };
    this.attributes = {
      strength: data.attributes?.strength || { value: 6, current: 6, dm: 0 },
      dexterity: data.attributes?.dexterity || { value: 6, current: 6, dm: 0 },
      endurance: data.attributes?.endurance || { value: 6, current: 6, dm: 0 },
      intelligence: data.attributes?.intelligence || { value: 6, current: 6, dm: 0 },
      education: data.attributes?.education || { value: 6, current: 6, dm: 0 },
      socialStatus: data.attributes?.socialStatus || { value: 6, current: 6, dm: 0 },
      psi: data.attributes?.psi || { value: 0, current: 0, dm: 0 }
    };
    // Skills: Sammlung aller Skills mit Levels
    const baseSkills = this.initializeSkills();
    if (Array.isArray(data.skills) && data.skills.length > 0) {
      // Mappe Basis-Skills und erhalte Level
      const mapped = baseSkills.map(skill => {
        const existing = data.skills.find(s => s.name === skill.name);
        return {
          name: skill.name,
          level: existing ? (parseInt(existing.level) || 0) : 0
        };
      });

      // Füge zusätzliche, benutzerdefinierte Skills hinzu, die nicht in baseSkills vorhanden sind
      const baseNames = new Set(baseSkills.map(s => s.name));
      const extras = data.skills
        .filter(s => !baseNames.has(s.name))
        .map(s => ({ name: s.name, level: parseInt(s.level) || 0 }));

      this.skills = mapped.concat(extras);
    } else {
      this.skills = baseSkills;
    }
    this.equipment = data.equipment || [];
    this.notes = data.notes || '';
    this.career = {
      careerHistory: data.career?.careerHistory || [],
      rank: data.career?.rank || 0,
      benefits: data.career?.benefits || [],
      galaxyMap: {
        visitedSystems: data.career?.galaxyMap?.visitedSystems || []
      }
    };
  }

  /**
   * Initialisiert alle Skills mit Level 0
   */
  initializeSkills() {
    if (typeof TravellerSkills !== 'undefined') {
      return TravellerSkills.getSkills().map(skillName => ({
        name: skillName,
        level: 0
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

  /**
   * Zu JSON konvertieren (für Storage)
   */
  toJSON() {
    return {
      id: this.id,
      system: this.system,
      metadata: this.metadata,
      attributes: this.attributes,
      skills: this.skills,
      equipment: this.equipment,
      notes: this.notes,
      career: this.career
    };
  }

  /**
   * Aus JSON erstellen
   */
  static fromJSON(data) {
    return new Character(data);
  }
}
