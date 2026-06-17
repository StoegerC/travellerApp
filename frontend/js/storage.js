/**
 * Storage-Interface für localStorage
 */
const Storage = {
  STORAGE_KEY: 'traveller_characters',

  /**
   * Speichert einen Charakter
   */
  saveCharacter(character) {
    try {
      const characters = this.getAllCharacters();
      const index = characters.findIndex(c => c.id === character.id);
      
      if (index >= 0) {
        characters[index] = character.toJSON();
      } else {
        characters.push(character.toJSON());
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(characters));
      return true;
    } catch (e) {
      console.error('Fehler beim Speichern:', e);
      return false;
    }
  },

  /**
   * Lädt einen Charakter
   */
  loadCharacter(id) {
    try {
      const characters = this.getAllCharacters();
      const data = characters.find(c => c.id === id);
      return data ? Character.fromJSON(data) : null;
    } catch (e) {
      console.error('Fehler beim Laden:', e);
      return null;
    }
  },

  /**
   * Gibt alle Charaktere zurück
   */
  getAllCharacters() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Fehler beim Lesen von Storage:', e);
      return [];
    }
  },

  /**
   * Gibt Liste aller Charaktere (ID + Name) zurück
   */
  listCharacters() {
    return this.getAllCharacters().map(c => ({
      id: c.id,
      name: c.metadata.name || 'Namenlos'
    }));
  },

  /**
   * Löscht einen Charakter
   */
  deleteCharacter(id) {
    try {
      const characters = this.getAllCharacters();
      const filtered = characters.filter(c => c.id !== id);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
      return true;
    } catch (e) {
      console.error('Fehler beim Löschen:', e);
      return false;
    }
  },

  /**
   * Initialisiert Storage mit Test-Charakteren
   */
  initializeTestData() {
    const existing = this.getAllCharacters();
    if (existing.length > 0) return; // Bereits Daten vorhanden

    const testCharacters = [
      new Character({
        metadata: { name: 'Captain Zara Vale', title: 'Navy Officer', homeworld: 'Tarsus Prime', age: 42 },
        attributes: { strength: 8, dexterity: 7, endurance: 9, intelligence: 10, education: 11, socialStatus: 10 },
        skills: [
          { name: 'Pilot', level: 2 },
          { name: 'Navigation', level: 1 }
        ]
      }),
      new Character({
        metadata: { name: 'Dr. Keth Nomis', title: 'Scientist', homeworld: 'Centauri Station', age: 38 },
        attributes: { strength: 5, dexterity: 6, endurance: 7, intelligence: 13, education: 14, socialStatus: 8 },
        skills: [
          { name: 'Science', level: 3 },
          { name: 'Research', level: 2 }
        ]
      }),
      new Character({
        metadata: { name: 'Vex Calloway', title: 'Scout', homeworld: 'Frontier Station', age: 29 },
        attributes: { strength: 10, dexterity: 9, endurance: 8, intelligence: 8, education: 7, socialStatus: 6 },
        skills: [
          { name: 'Survival', level: 2 },
          { name: 'Gunnery', level: 1 }
        ]
      })
    ];

    testCharacters.forEach(char => this.saveCharacter(char));
  }
};

// Initialisiere Test-Charaktere beim Laden
document.addEventListener('DOMContentLoaded', () => {
  Storage.initializeTestData();
});
