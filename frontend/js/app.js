/**
 * Hauptanwendungs-Logik
 */
const App = {
  currentCharacter: null,
  currentPage: 'metadata',
  editMode: false,

  pages: {
    metadata: MetadataPage,
    attributes: AttributesPage,
    equipment: EquipmentPage,
    career: CareerPage,
    notes: NotesPage
  },

  init() {
    this.setupEventListeners();
    this.loadCharacters();

    const characters = Storage.listCharacters();
    if (characters.length > 0) {
      this.loadCharacter(characters[0].id);
    } else {
      this.createNewCharacter();
    }

    this.updateEditButton();
  },

  setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target.closest('.tab-btn');
        if (target) this.switchPage(target.dataset.page);
      });
    });

    document.getElementById('characterSelect').addEventListener('change', (e) => {
      if (e.target.value) this.loadCharacter(e.target.value);
    });

    document.getElementById('newCharBtn').addEventListener('click', () => this.createNewCharacter());
    document.getElementById('deleteCharBtn').addEventListener('click', () => this.deleteCharacter());
    document.getElementById('saveBtn').addEventListener('click', () => this.saveCharacter());
    document.getElementById('toggleEditBtn').addEventListener('click', () => this.toggleEditMode());
  },

  loadCharacters() {
    const select = document.getElementById('characterSelect');
    const characters = Storage.listCharacters();

    select.innerHTML = '<option value="">-- Charakter wählen --</option>';
    characters.forEach(char => {
      const option = document.createElement('option');
      option.value = char.id;
      option.textContent = char.name || 'Namenlos';
      select.appendChild(option);
    });
  },

  loadCharacter(id) {
    this.currentCharacter = Storage.loadCharacter(id);
    if (!this.currentCharacter) {
      console.error('Charakter nicht gefunden:', id);
      return;
    }

    window.currentCharacter = this.currentCharacter;
    document.getElementById('characterSelect').value = id;
    this.renderCurrentPage();
    this.showStatus(`${this.currentCharacter.metadata.name || 'Charakter'} geladen`, 'success');
  },

  /**
   * Erstellt direkt einen neuen Traveller-Charakter ohne Modal.
   */
  createNewCharacter() {
    this.currentCharacter = new Character({ system: 'traveller' });
    Storage.saveCharacter(this.currentCharacter);
    this.loadCharacters();
    document.getElementById('characterSelect').value = this.currentCharacter.id;
    this.editMode = true;
    this.renderCurrentPage();
    this.showStatus('Neuer Charakter erstellt', 'success');
  },

  deleteCharacter() {
    if (!this.currentCharacter) return;

    const name = this.currentCharacter.metadata.name || 'Charakter';
    if (!confirm(`„${name}" wirklich löschen?`)) return;

    Storage.deleteCharacter(this.currentCharacter.id);
    this.currentCharacter = null;
    this.loadCharacters();

    const characters = Storage.listCharacters();
    if (characters.length > 0) {
      this.loadCharacter(characters[0].id);
    } else {
      this.createNewCharacter();
    }

    this.showStatus('Charakter gelöscht', 'success');
  },

  saveCharacter() {
    if (!this.currentCharacter) {
      this.showStatus('Kein Charakter geladen', 'error');
      return;
    }

    // Aktuelle Seite immer speichern
    const page = this.pages[this.currentPage];
    if (page && page.save) {
      page.save(this.currentCharacter);
    }

    const currentId = this.currentCharacter.id;
    if (Storage.saveCharacter(this.currentCharacter)) {
      this.loadCharacters();
      document.getElementById('characterSelect').value = currentId;
      this.showStatus('Gespeichert ✓', 'success');
    } else {
      this.showStatus('Fehler beim Speichern', 'error');
    }
  },

  switchPage(pageName) {
    if (!this.pages[pageName]) return;

    // Aktuelle Seite immer speichern (nicht nur im Edit-Modus)
    const oldPage = this.pages[this.currentPage];
    if (oldPage && oldPage.save && this.currentCharacter) {
      oldPage.save(this.currentCharacter);
      Storage.saveCharacter(this.currentCharacter);
    }

    this.currentPage = pageName;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === pageName);
    });

    this.renderCurrentPage();
  },

  renderCurrentPage() {
    if (!this.currentCharacter) return;

    window.currentCharacter = this.currentCharacter;

    const page = this.pages[this.currentPage];
    if (!page) return;

    if (this.currentPage === 'career') {
      const galaxyMap = this.currentCharacter.career?.galaxyMap || {};
      window.currentVisitedSystems = galaxyMap.visitedSystems || [];
    }

    const container = document.getElementById(`${this.currentPage}-page`);
    container.innerHTML = page.render(this.currentCharacter);

    if (page.attachListeners) {
      page.attachListeners();
    }

    document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
    container.classList.add('active');

    this.updateEditButton();
  },

  toggleEditMode() {
    const page = this.pages[this.currentPage];
    if (!page) return;

    if (this.editMode && page.save) {
      page.save(this.currentCharacter);
      Storage.saveCharacter(this.currentCharacter);
    }

    this.editMode = !this.editMode;
    this.renderCurrentPage();
  },

  updateEditButton() {
    const btn = document.getElementById('toggleEditBtn');
    if (!btn) return;

    if (this.editMode) {
      btn.textContent = '✓ Fertig';
      btn.classList.add('active');
    } else {
      btn.textContent = '✎ Bearbeiten';
      btn.classList.remove('active');
    }

    // Notizen-Seite braucht keinen Edit-Modus-Toggle (immer editierbar)
    btn.style.display = this.currentPage === 'notes' ? 'none' : 'block';
  },

  showStatus(message, type = 'success') {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;

    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status';
    }, 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
