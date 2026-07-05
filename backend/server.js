require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { checkAuth, requireRole } = require('./auth');
const authRoutes = require('./routes/auth');
const characterRoutes = require('./routes/characters');
const campaignRoutes = require('./routes/campaigns');
const fileRoutes = require('./routes/files');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// CORS – entspricht den bisherigen Worker-Headern (Access-Control-Allow-*)
// If-Unmodified-Since-Version: optimistische Sperre beim Charakter-Push (Client
// schickt den zuletzt bekannten Versions-Stand mit). X-Updated-At: Server
// antwortet mit dem aktuellen Stand, muss dem Browser explizit freigegeben
// werden (sonst per CORS unsichtbar für fetch()).
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'If-Unmodified-Since-Version'],
  exposedHeaders: ['X-Updated-At'],
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

// GET /files/:id bleibt oeffentlich wie die statischen Assets: <img src="...">
// kann keinen Authorization-Header mitschicken. Die ID ist eine lange
// Zufallszeichenkette (nicht erratbar) - Upload/Loeschen bleiben unten geschuetzt.
app.use(fileRoutes.publicRouter);

// POST /auth/login ist oeffentlich - ohne gueltige Session kann man sich
// sonst gar nicht erst einloggen.
app.use(authRoutes.publicRouter);

// Ab hier: Bearer-Session-Auth Pflicht (Phase 3, ersetzt den frueheren
// geteilten API_KEY vollstaendig - kein Parallelbetrieb)
app.use(checkAuth);
app.use(authRoutes.protectedRouter);
app.use(characterRoutes);
app.use(campaignRoutes);
app.use(fileRoutes.protectedRouter);
app.use(requireRole('admin'), adminRoutes);

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`Traveller Charsheet Backend läuft auf http://${HOST}:${PORT}`);
});
