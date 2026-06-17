# Traveller - Charakterdatenblatt

Eine Web-basierte Verwaltungssoftware für Charaktere aus dem Rollenspiel **Traveller Classic**.

## Features

✨ **Vier Seiten für vollständige Charakterverwaltung:**
- **Metadaten**: Name, Titel, Heimatplanet, Alter
- **Attribute & Skills**: 6 Grundattribute (0-15) + beliebige Skillsliste
- **Waffen & Ausrüstung**: Tabellarische Verwaltung von Items
- **Werdegang**: Karriere-Historie, Rang und Vorteile

🎯 **Funktionalität:**
- Mehrere Charaktere verwalten
- Charaktere laden/erstellen/löschen
- Tab-Navigation zwischen Seiten
- Persistente Speicherung in Browser-localStorage
- 3 Test-Charaktere zum Start
- Responsive Design (Desktop & Mobil)

## Installation

### Schnellstart (Dateimanager)
1. **Ordner öffnen**: `traveller-charsheet/frontend/`
2. **Datei öffnen**: `index.html` mit Webbrowser öffnen
3. **Fertig!** Keine Installation notwendig.

### Mit Node.js/Express (Optional für später)
```bash
# Backend starten
cd backend
npm install
npm start
# Öffne http://localhost:3000 im Browser
```

## Verwendung

### Charakter wählen
- Nutze das **Dropdown-Menü** oben um zwischen Charakteren zu wechseln
- Klick auf **"Neu"** um einen neuen Charakter zu erstellen
- Klick auf **"Löschen"** um einen Charakter zu löschen

### Charakterdaten bearbeiten
1. Wähle eine der 4 **Tabs** aus (Metadaten, Attribute, Waffen, Werdegang)
2. **Bearbeite die Felder**
3. Klick auf **"Speichern"** um die Änderungen zu speichern
4. Klick auf **"Zurücksetzen"** um Änderungen rückgängig zu machen

### Skills/Ausrüstung/Karriere hinzufügen
- Klick auf **"[Element] hinzufügen"** Button
- Neue Zeile erscheint in der Tabelle
- Fülle die Felder aus
- **"Speichern"** Button drücken zum Persistieren

## Datenstruktur

Charaktere werden als JSON im Browser gespeichert:
```json
{
  "id": "char-001",
  "metadata": {
    "name": "Character Name",
    "title": "Rank/Title",
    "homeworld": "Planet Name",
    "age": 30
  },
  "attributes": {
    "strength": 8,
    "dexterity": 7,
    "endurance": 9,
    "intelligence": 10,
    "education": 11,
    "socialStatus": 10
  },
  "skills": [
    {"name": "Pilot", "level": 2},
    {"name": "Navigation", "level": 1}
  ],
  "equipment": [
    {"name": "Laser Rifle", "type": "Waffe", "notes": "Standard Issue"}
  ],
  "career": {
    "careerHistory": [
      {"name": "Navy Scout", "years": 4}
    ],
    "rank": 2,
    "benefits": ["Spacecraft", "Medicine"]
  }
}
```

## Projektstruktur

```
traveller-charsheet/
├── frontend/
│   ├── index.html              # Hauptseite
│   ├── styles.css              # Styling
│   └── js/
│       ├── app.js              # Hauptlogik & Navigation
│       ├── storage.js          # localStorage Interface
│       ├── models/
│       │   └── character.js    # Character-Datenmodell
│       └── pages/
│           ├── metadata.js     # Metadaten-Editor
│           ├── attributes.js   # Attribute & Skills
│           ├── equipment.js    # Waffen & Ausrüstung
│           └── career.js       # Werdegang
├── backend/
│   ├── package.json            # npm Dependencies
│   └── server.js               # Express Server (optional)
└── README.md                   # Diese Datei
```

## Häufig gestellte Fragen

**F: Werden meine Daten gespeichert?**  
A: Ja! Alles wird im Browser-localStorage gespeichert. Die Daten bleiben auch nach Neustart erhalten.

**F: Kann ich Charaktere exportieren?**  
A: Noch nicht - das wird als nächste Feature hinzugefügt.

**F: Funktioniert es offline?**  
A: Ja, 100% offline. Keine Internetverbindung notwendig.

**F: Wie viele Charaktere kann ich speichern?**  
A: Praktisch unbegrenzt (bis zur localStorage-Grenze, ca. 5-10MB).

## Nächste Verbesserungen

- 📤 Export/Import als JSON-Datei
- 🎨 Weitere Traveller Classic Attribute (z.B. Zustand, Medizinische Geschichte)
- 📊 Charakter-Editor mit validierung nach Traveller-Regeln
- ☁️ Cloud-Synchronisation (wenn Backend verwendet wird)
- 🌙 Dark Mode

## Technologie

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Storage**: Browser localStorage
- **Backend** (optional): Node.js, Express
- **Kompatibilität**: Chrome, Firefox, Safari, Edge

## Lizenz

MIT

---

**Viel Spaß mit deinem Traveller-Charakterverwaltungssystem!** 🚀
