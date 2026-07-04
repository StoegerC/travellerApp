/**
 * Bearer-Token-Auth – ein einzelner geteilter Schlüssel für alle Clients,
 * analog zum bisherigen Cloudflare-Worker-Verhalten (env.API_KEY).
 *
 * Bewusst als einzelne Funktion gekapselt: ein späterer Wechsel auf
 * Pro-Spieler-Tokens (z.B. Nachschlagen in einer `tokens`-Tabelle) betrifft
 * dann nur diese Datei, nicht die Routen.
 */
function checkAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${process.env.API_KEY}`) {
    return res.status(401).send('Unauthorized');
  }
  next();
}

module.exports = { checkAuth };
