/**
 * Metadaten-Seite
 */
const MetadataPage = {
  render(character) {
    const meta = character.metadata;
    
    // Initialisiere currentPortraitImage mit gespeichertem Bild
    window.currentPortraitImage = meta.portraitImage || null;
    
    if (App.editMode) {
      // Edit-Modus
      return `
        <h2>Charakterinformationen</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 20px 0;">
          
          <!-- Linke Spalte: Portrait -->
          <div>
            <h3>Portrait</h3>
            <div id="portraitContainer" style="margin-bottom: 20px;">
              ${meta.portraitImage 
                ? `<img id="portraitImg" src="${meta.portraitImage}" style="width: 100%; max-width: 400px; aspect-ratio: 3/4; object-fit: cover; border: 2px solid #ddd; border-radius: 8px;">` 
                : `<div style="width: 100%; max-width: 400px; aspect-ratio: 3/4; background: #f0f0f0; border: 2px dashed #ccc; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 14px;">Kein Portrait</div>`}
            </div>
            <label for="portraitUpload" style="display: inline-block; padding: 10px 15px; background: #007bff; color: white; border-radius: 4px; cursor: pointer; font-weight: 500;">
              Bild wählen
            </label>
            <input type="file" id="portraitUpload" accept="image/*" style="display: none;">
            <p style="font-size: 0.85em; color: #666; margin-top: 8px;">JPG, PNG oder WebP (max. 500KB)</p>
          </div>

          <!-- Rechte Spalte: Charakterdaten -->
          <div>
            <h3>Charakterdaten</h3>
            <div class="form-group">
              <label for="charName">Name:</label>
              <input type="text" id="charName" value="${meta.name || ''}" placeholder="Charaktername">
            </div>
            <div class="form-group">
              <label for="charTitle">Titel/Rang:</label>
              <input type="text" id="charTitle" value="${meta.title || ''}" placeholder="z.B. Captain, Dr.">
            </div>
            <div class="form-group">
              <label for="charAge">Alter:</label>
              <input type="number" id="charAge" value="${meta.age || 18}" min="18" max="120">
            </div>
            <div class="form-group">
              <label for="charHomeworld">Heimatplanet:</label>
              <input type="text" id="charHomeworld" value="${meta.homeworld || ''}" placeholder="Planet oder Station">
            </div>
          </div>
        </div>
      `;
    } else {
      // View-Modus
      return `
        <h2>Charakterinformationen</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 20px 0;">
          
          <!-- Linke Spalte: Portrait -->
          <div>
            <h3>Portrait</h3>
            <div style="margin-bottom: 20px;">
              ${meta.portraitImage 
                ? `<img src="${meta.portraitImage}" style="width: 100%; max-width: 400px; aspect-ratio: 3/4; object-fit: cover; border: 2px solid #ddd; border-radius: 8px;">` 
                : `<div style="width: 100%; max-width: 400px; aspect-ratio: 3/4; background: #f0f0f0; border: 2px dashed #ccc; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999; font-size: 14px;">Kein Portrait</div>`}
            </div>
          </div>

          <!-- Rechte Spalte: Charakterdaten -->
          <div>
            <h3>Charakterdaten</h3>
            <div style="display: grid; gap: 15px;">
              <div><strong>Name:</strong> ${meta.name || '-'}</div>
              <div><strong>Titel/Rang:</strong> ${meta.title || '-'}</div>
              <div><strong>Alter:</strong> ${meta.age || 18} Jahre</div>
              <div><strong>Heimatplanet:</strong> ${meta.homeworld || '-'}</div>
            </div>
          </div>
        </div>
      `;
    }
  },

  getData() {
    return {
      name: document.getElementById('charName')?.value || '',
      title: document.getElementById('charTitle')?.value || '',
      age: parseInt(document.getElementById('charAge')?.value) || 18,
      homeworld: document.getElementById('charHomeworld')?.value || '',
      portraitImage: window.currentPortraitImage || window.currentCharacter?.metadata?.portraitImage || null
    };
  },

  save(character) {
    // Sichere nur, wenn Eingabefelder existieren (Edit-Modus ist aktiv)
    const charNameInput = document.getElementById('charName');
    if (!charNameInput) return; // Keine Eingabefelder gefunden
    
    const data = this.getData();
    character.metadata = { ...character.metadata, ...data };
  },

  reset() {
    document.getElementById('metadata-page').innerHTML = '';
  },

  attachListeners() {
    if (!App.editMode) return; // Nur im Edit-Modus Event Listener hinzufügen
    
    const uploadInput = document.getElementById('portraitUpload');
    if (uploadInput) {
      uploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          // Prüfe Dateigröße (max 500KB)
          if (file.size > 500 * 1024) {
            alert('Bild zu groß! Maximum 500KB');
            return;
          }

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target.result;
            window.currentPortraitImage = base64;
            
            // Vorschau aktualisieren
            const portraitContainer = document.getElementById('portraitContainer');
            portraitContainer.innerHTML = `<img id="portraitImg" src="${base64}" style="width: 100%; max-width: 400px; aspect-ratio: 3/4; object-fit: cover; border: 2px solid #ddd; border-radius: 8px;">`;
          };
          reader.readAsDataURL(file);
        }
      });
    }
  }
};
