/**
 * SyncMerge – Client-seitiges Merging für den persönlichen Charakter-Sync.
 *
 * Server bleibt bewusst opak (kennt nur den JSON-Blob + updated_at für die
 * optimistische Sperre, siehe backend/db.js) — der komplette Merge läuft hier.
 *
 * Granularität ist Item-Ebene, nicht Feld-Ebene: bearbeiten zwei Geräte
 * unterschiedliche Felder DESSELBEN Items, gewinnt die zeitlich spätere
 * Version komplett. Das ist eine bewusst akzeptierte Grenze (siehe Plan).
 */
const SyncMerge = {

  _EPOCH: '1970-01-01T00:00:00.000Z',

  _ts(item) {
    return Date.parse(item?.updatedAt || this._EPOCH) || 0;
  },

  _pickNewer(a, b) {
    return this._ts(a) >= this._ts(b) ? a : b;
  },

  /**
   * Merged zwei Arrays von Items mit `id`-Feld. Items, die nur auf einer
   * Seite existieren, werden übernommen. Items auf beiden Seiten: die
   * zeitlich spätere `updatedAt`-Version gewinnt komplett (deckt sowohl
   * Edit-vs-Edit als auch Tombstone-vs-Edit ab, da Löschen updatedAt auch
   * bumpt).
   */
  mergeArray(local, remote) {
    return this._mergeByKey(local, remote, 'id');
  },

  _mergeByKey(local, remote, key) {
    local  = Array.isArray(local)  ? local  : [];
    remote = Array.isArray(remote) ? remote : [];

    const byKey = new Map();
    for (const item of remote) byKey.set(item[key], item);
    for (const item of local) {
      const other = byKey.get(item[key]);
      byKey.set(item[key], other ? this._pickNewer(item, other) : item);
    }
    return [...byKey.values()];
  },

  /**
   * Entfernt Tombstones, die älter als maxAgeDays sind. Läuft nebenbei bei
   * jedem Merge mit statt als eigener Cronjob (siehe Plan: akzeptiertes
   * Risiko, dass ein >90 Tage inaktives Gerät ein gelöschtes Item einmalig
   * wiederbeleben könnte).
   */
  purgeTombstones(items, maxAgeDays = 90) {
    if (!Array.isArray(items)) return items;
    const cutoff = Date.now() - maxAgeDays * 86400000;
    return items.filter(item => !(item?._deleted && Date.parse(item.deletedAt || 0) < cutoff));
  },

  _mergeArrayField(local, remote) {
    return this.purgeTombstones(this.mergeArray(local, remote));
  },

  /**
   * Merged ein einzelnes Schiff. Wird eines auf einer Seite gelöscht,
   * entscheidet _pickNewer über das ganze Schiff (keine Feld-Rekursion bei
   * Löschung). Sonst: Skalarfelder lokal-gewinnt, weapons[]/finances.*[]
   * einzeln gemerged. crewRoles wird hier NICHT angefasst — das übernimmt
   * bereits App._syncMyCampaignShips() separat.
   */
  _mergeShip(local, remote) {
    if (local?._deleted || remote?._deleted) return this._pickNewer(local, remote);

    const merged = { ...remote, ...local };
    merged.weapons = this._mergeArrayField(local.weapons, remote.weapons);

    const lf = local.finances  || {};
    const rf = remote.finances || {};
    merged.finances = { ...lf };
    merged.finances.transactions   = this._mergeArrayField(lf.transactions,   rf.transactions);
    merged.finances.recurringItems = this._mergeArrayField(lf.recurringItems, rf.recurringItems);
    merged.finances.debts          = this._mergeArrayField(lf.debts,          rf.debts);

    return merged;
  },

  _mergeShips(local, remote) {
    local  = Array.isArray(local)  ? local  : [];
    remote = Array.isArray(remote) ? remote : [];

    const byId = new Map();
    for (const s of remote) byId.set(s.id, s);
    for (const s of local) {
      const other = byId.get(s.id);
      byId.set(s.id, other ? this._mergeShip(s, other) : s);
    }
    return this.purgeTombstones([...byId.values()]);
  },

  /**
   * Setzt merged[...path] auf das Array-Merge-Ergebnis von
   * local[...path]/remote[...path] (Punkt-Pfad, z.B. "career.terms").
   * keyField: true -> Merge-Key "id" (Standardfall, inkl. Tombstones);
   * String -> anderer Merge-Key (z.B. "name" bei MGT2-Skills).
   *
   * materialized verhindert einen stillen Datenverlust bei mehreren
   * Pfaden mit gemeinsamem Präfix (z.B. "career.terms" UND
   * "career.keyEvents"): das Zwischenobjekt "career" darf pro Merge-Lauf
   * nur EINMAL frisch aufgebaut werden, sonst würde der zweite Pfad das
   * bereits gemergte Ergebnis des ersten wieder überschreiben.
   */
  _mergeSpecPath(merged, local, remote, path, keyField, materialized) {
    const parts   = path.split('.');
    const lastKey = parts.pop();
    let mLocal = local, mRemote = remote, mMerged = merged, prefix = '';
    for (const k of parts) {
      prefix  = prefix ? `${prefix}.${k}` : k;
      mLocal  = mLocal?.[k]  || {};
      mRemote = mRemote?.[k] || {};
      if (!materialized.has(prefix)) {
        mMerged[k] = { ...mRemote, ...mLocal };
        materialized.add(prefix);
      }
      mMerged = mMerged[k];
    }
    const key = keyField === true ? 'id' : keyField;
    mMerged[lastKey] = this.purgeTombstones(this._mergeByKey(mLocal[lastKey], mRemote[lastKey], key));
  },

  /**
   * Merged zwei komplette Character.toJSON()-Objekte. localJson gewinnt als
   * Default für alle Skalar-Felder (metadata, attributes, radiationDose,
   * firstAidLog, activeShipId, campaignId, shipRoles, syncMode, system, id).
   *
   * Kern-Arrays (Log-Paket, Finanzen, Ausrüstung) sind für jedes Regelsystem
   * identisch und werden immer gemergt. System-spezifische Arrays (bei MGT2:
   * skills/training/career.*, Schiffe) kommen über den mergeSpec-Parameter —
   * der Kern kennt ihre Feldnamen nicht mehr. mergeSpec wird bewusst als
   * Parameter übergeben statt hier selbst z.B. über SystemRegistry
   * nachzuschlagen: diese Datei bleibt damit reines, umgebungsunabhängiges
   * Plain-JS (siehe Datei-Kopfkommentar) und lässt sich ohne Browser-Globals
   * testen. Der Aufrufer (app.js) übergibt App._system().mergeSpec.
   *
   * arrays: { "punkt.pfad": true | "keyName" } — true = Merge-Key "id",
   * String = anderer Key (z.B. "name" bei MGT2-Skills). ships: boolean —
   * eigenes Flag statt Pfad-Eintrag, weil Schiffe Sub-Merges für
   * weapons[]/finances.*[] brauchen (_mergeShips) statt eines einfachen
   * Array-Merges nach Key.
   */
  mergeCharacter(localJson, remoteJson, mergeSpec = {}) {
    const local  = localJson  || {};
    const remote = remoteJson || {};
    const merged = { ...remote, ...local };

    merged.equipment = this._mergeArrayField(local.equipment, remote.equipment);

    const ln = local.notes  || {};
    const rn = remote.notes || {};
    merged.notes = { ...ln };
    for (const k of ['sessions', 'persons', 'locations', 'quests']) {
      merged.notes[k] = this._mergeArrayField(ln[k], rn[k]);
    }

    const lfi = local.finances  || {};
    const rfi = remote.finances || {};
    merged.finances = { ...lfi };
    merged.finances.transactions   = this._mergeArrayField(lfi.transactions,   rfi.transactions);
    merged.finances.recurringItems = this._mergeArrayField(lfi.recurringItems, rfi.recurringItems);
    merged.finances.debts          = this._mergeArrayField(lfi.debts,          rfi.debts);

    const spec = mergeSpec || {};
    const materialized = new Set();
    for (const [path, keyField] of Object.entries(spec.arrays || {})) {
      this._mergeSpecPath(merged, local, remote, path, keyField, materialized);
    }
    if (spec.ships) {
      merged.ships = this._mergeShips(local.ships, remote.ships);
    }

    return merged;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncMerge;
}
