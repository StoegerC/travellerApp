/**
 * Notizen-Seite – freies Textfeld mit Auto-Save
 */
const NotesPage = {
  _saveTimer: null,

  render(character) {
    const notes = character.notes || '';
    return `
      <h2>Notizen</h2>
      <textarea
        id="notesText"
        class="notes-textarea"
        placeholder="Hier kannst du Notizen, Missionsziele, NSC-Namen, wichtige Hinweise usw. festhalten …"
      >${notes}</textarea>
      <div id="notesSavedIndicator" class="notes-saved-indicator"></div>
    `;
  },

  getData() {
    return document.getElementById('notesText')?.value || '';
  },

  save(character) {
    character.notes = this.getData();
  },

  attachListeners() {
    const textarea = document.getElementById('notesText');
    if (!textarea) return;

    // Skaliere Textarea automatisch mit dem Inhalt
    textarea.addEventListener('input', () => {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        if (!window.currentCharacter) return;
        window.currentCharacter.notes = this.getData();
        Storage.saveCharacter(window.currentCharacter);
        this._showSaved();
      }, 1500);
    });
  },

  _showSaved() {
    const el = document.getElementById('notesSavedIndicator');
    if (!el) return;
    el.textContent = '✓ Gespeichert';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2000);
  }
};
