require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { checkAuth } = require('./auth');
const characterRoutes = require('./routes/characters');
const campaignRoutes = require('./routes/campaigns');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// CORS – entspricht den bisherigen Worker-Headern (Access-Control-Allow-*)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));

// Base64-Bilder machen Charakter-JSON während der Übergangszeit groß
app.use(express.json({ limit: '20mb' }));

// Unauthentifizierter Health-Check (systemd/Tunnel-Monitoring)
app.get('/health', (req, res) => res.json({ ok: true }));

// Statisches Frontend bleibt öffentlich (kein Bearer-Token beim reinen Laden der Seite)
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Ab hier: Bearer-Auth Pflicht (alle Sync-API-Routen)
app.use(checkAuth);
app.use(characterRoutes);
app.use(campaignRoutes);

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`Traveller Charsheet Backend läuft auf http://${HOST}:${PORT}`);
});
