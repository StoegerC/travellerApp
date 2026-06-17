const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// API Endpoints (Platzhalter für später)
app.get('/api/characters', (req, res) => {
  res.json({ message: 'Characters API - noch nicht implementiert' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server error' });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Traveller Charsheet Server läuft auf http://localhost:${PORT}`);
});
