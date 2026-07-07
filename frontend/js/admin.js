/**
 * Admin-Oberfläche (Phase 3) – eigenständige Seite, kein Teil der
 * Haupt-App-Navigation. Nutzt dieselben localStorage-Schlüssel wie die
 * Haupt-App (traveller_worker_url/traveller_cloud_key) - ist man dort schon
 * als Administrator eingeloggt, meldet diese Seite sich automatisch mit
 * derselben Session an.
 */
const AdminApp = {
  url: '',
  token: '',

  async apiFetch(path, opts = {}) {
    const res = await fetch(`${this.url}${path}`, {
      ...opts,
      headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    return res;
  },

  async init() {
    this.url   = localStorage.getItem('traveller_worker_url') || '';
    this.token = localStorage.getItem('traveller_cloud_key')  || '';
    document.getElementById('adminUrl').value = this.url;

    document.getElementById('loginBtn').addEventListener('click', () => this.login());
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    document.getElementById('createUserBtn').addEventListener('click', () => this.createUser());
    document.getElementById('orphanedCleanupBtn').addEventListener('click', () => this.cleanupOrphanedFiles());
    document.getElementById('snapshotTarget').addEventListener('change', () => this.loadSnapshotList());
    document.getElementById('snapshotRestoreBtn').addEventListener('click', () => this.restoreSnapshot());

    if (this.url && this.token) {
      const ok = await this.tryShowMain();
      if (!ok) this.showLogin('Sitzung abgelaufen oder keine Admin-Rechte - bitte erneut anmelden.');
    }
  },

  showLogin(error) {
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('mainView').classList.add('hidden');
    document.getElementById('loginError').textContent = error || '';
  },

  async login() {
    const url      = document.getElementById('adminUrl').value.trim().replace(/\/$/, '');
    const email    = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errEl    = document.getElementById('loginError');
    if (!url || !email || password.length < 8) { errEl.textContent = 'Bitte alle Felder ausfüllen (Passwort min. 8 Zeichen).'; return; }

    errEl.textContent = 'Melde an …';
    try {
      const res = await fetch(`${url}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) { errEl.textContent = await res.text() || 'Anmeldung fehlgeschlagen'; return; }
      const data = await res.json();
      this.url = url;
      this.token = data.token;
      localStorage.setItem('traveller_worker_url', url);
      localStorage.setItem('traveller_cloud_key', data.token);
      const ok = await this.tryShowMain();
      if (!ok) errEl.textContent = 'Angemeldet, aber kein Administrator-Konto.';
    } catch (e) {
      errEl.textContent = e.message;
    }
  },

  logout() {
    this.apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.setItem('traveller_cloud_key', '');
    this.token = '';
    this.showLogin();
  },

  // Prueft ob die aktuelle Session Admin-Rechte hat (GET /admin/stats
  // schlaegt mit 403 fehl, wenn nicht) und zeigt bei Erfolg die Hauptansicht.
  async tryShowMain() {
    const res = await this.apiFetch('/admin/stats').catch(() => null);
    if (!res || !res.ok) return false;
    const stats = await res.json();
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('mainView').classList.remove('hidden');
    document.getElementById('welcomeText').textContent = this.url;
    this.renderStats(stats);
    this.loadUsers();
    this.loadOverview();
    this.loadOrphanedFiles();
    return true;
  },

  _fmtBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  renderStats(s) {
    const fmtUptime = sec => {
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
      return `${h}h ${m}m`;
    };
    const cards = [
      { label: 'Charaktere', value: s.characterCount },
      { label: 'Kampagnen', value: s.campaignCount },
      { label: 'Nutzer', value: s.userCount },
      { label: 'Dateien', value: s.files.count },
      { label: 'Datei-Speicher', value: this._fmtBytes(s.files.totalSize) },
      { label: 'Speicher frei', value: s.disk ? this._fmtBytes(s.disk.freeBytes) : '–' },
      { label: 'Server-Uptime', value: fmtUptime(s.uptimeSeconds) },
    ];
    document.getElementById('statsGrid').innerHTML = cards.map(c =>
      `<div class="stat-card"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>`
    ).join('');
  },

  async loadOverview() {
    const res = await this.apiFetch('/admin/overview');
    if (!res.ok) return;
    const data = await res.json();
    this._overviewData = data;
    this.renderSnapshotTargets(data);
    const rows = [...data.users];
    // "Verwaist" nur anzeigen, wenn tatsaechlich etwas ohne (aktuellen) Owner
    // existiert - z.B. nach Loeschen eines Nutzers (Charaktere/Kampagnen
    // bleiben laut Design erhalten, siehe admin.js DELETE-Kommentar).
    const hasOrphaned = data.orphaned.characters.length || data.orphaned.campaigns.length;
    if (hasOrphaned) rows.push({ id: '_orphaned', email: '⚠ Ohne zugeordneten Nutzer', roles: [], ...data.orphaned });

    document.getElementById('overviewTableBody').innerHTML = rows.map(u => {
      const totalBytes = u.storage.characterBytes + u.storage.mediaBytes;
      return `
        <tr>
          <td>${this._esc(u.email)}</td>
          <td>${u.characters.length}</td>
          <td>${u.campaigns.length}</td>
          <td>${this._fmtBytes(u.storage.characterBytes)}</td>
          <td>${this._fmtBytes(u.storage.mediaBytes)}</td>
          <td>${this._fmtBytes(totalBytes)}</td>
          <td><button class="btn-secondary btn-toggle-detail" data-toggle="${u.id}">Details</button></td>
        </tr>
        <tr class="owner-detail-row hidden" id="detail-${u.id}">
          <td colspan="7">${this._renderOwnerDetail(u)}</td>
        </tr>`;
    }).join('');

    document.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById(`detail-${btn.dataset.toggle}`)?.classList.toggle('hidden');
      });
    });
  },

  _renderOwnerDetail(u) {
    const list = (items, emptyLabel) => items.length
      ? `<ul class="owner-detail-list">${items.map(i =>
          `<li><span>${this._esc(i.name || 'Namenlos')}</span><span class="item-size">${this._fmtBytes(i.bytes)}</span></li>`
        ).join('')}</ul>`
      : `<p class="owner-detail-empty">${emptyLabel}</p>`;
    return `
      <div class="owner-detail-cols">
        <div><strong>Charaktere</strong>${list(u.characters, 'Keine Charaktere')}</div>
        <div><strong>Kampagnen</strong>${list(u.campaigns, 'Keine Kampagnen')}</div>
      </div>`;
  },

  async loadUsers() {
    const res = await this.apiFetch('/admin/users');
    if (!res.ok) return;
    const users = await res.json();
    document.getElementById('userTableBody').innerHTML = users.map(u => `
      <tr>
        <td>${this._esc(u.email)}</td>
        <td>${u.roles.map(r => `<span class="role-tag">${r}</span>`).join('') || '–'}</td>
        <td>${u.hasPassword ? '✓ gesetzt' : '– noch nicht gesetzt'}</td>
        <td class="row-actions">
          <button class="btn-secondary" data-action="toggle-gm" data-id="${u.id}" data-roles='${JSON.stringify(u.roles)}'>${u.roles.includes('gm') ? 'Meister entziehen' : '+ Meister'}</button>
          <button class="btn-secondary" data-action="toggle-admin" data-id="${u.id}" data-roles='${JSON.stringify(u.roles)}'>${u.roles.includes('admin') ? 'Admin entziehen' : '+ Admin'}</button>
          <button class="btn-secondary" data-action="reset" data-id="${u.id}">Passwort zurücksetzen</button>
          <button class="btn-danger" data-action="delete" data-id="${u.id}" data-email="${this._esc(u.email)}">Löschen</button>
        </td>
      </tr>`).join('');

    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this.handleUserAction(btn));
    });
  },

  async handleUserAction(btn) {
    const { action, id } = btn.dataset;
    if (action === 'toggle-gm' || action === 'toggle-admin') {
      const roles = JSON.parse(btn.dataset.roles);
      const role = action === 'toggle-gm' ? 'gm' : 'admin';
      const next = roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role];
      await this.apiFetch(`/admin/users/${id}/roles`, { method: 'PUT', body: JSON.stringify({ roles: next }) });
    } else if (action === 'reset') {
      if (!confirm('Passwort dieses Nutzers zurücksetzen? Alle Geräte werden abgemeldet.')) return;
      await this.apiFetch(`/admin/users/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({}) });
    } else if (action === 'delete') {
      if (!confirm(`Nutzer „${btn.dataset.email}" wirklich löschen? Charaktere/Kampagnen bleiben erhalten.`)) return;
      await this.apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
    }
    this.loadUsers();
    this.loadOverview();
  },

  async createUser() {
    const email = document.getElementById('newUserEmail').value.trim();
    const roles = [...document.getElementById('newUserRoles').selectedOptions].map(o => o.value);
    const errEl = document.getElementById('userError');
    if (!email) { errEl.textContent = 'E-Mail angeben'; return; }
    const res = await this.apiFetch('/admin/users', { method: 'POST', body: JSON.stringify({ email, roles }) });
    if (!res.ok) { errEl.textContent = await res.text(); return; }
    errEl.textContent = '';
    document.getElementById('newUserEmail').value = '';
    this.loadUsers();
    this.loadOverview();
  },

  // ── Verwaiste Mediendateien ─────────────────────────────────────────────

  async loadOrphanedFiles() {
    const res = await this.apiFetch('/admin/orphaned-files');
    if (!res.ok) return;
    const files = await res.json();
    document.getElementById('orphanedTableBody').innerHTML = files.map(f => `
      <tr>
        <td>${this._esc(f.filename)}</td>
        <td>${this._fmtBytes(f.size)}</td>
        <td>${f.ageDays} Tage</td>
        <td class="row-actions">
          <button class="btn-secondary" data-restore-id="${f.id}">↩ Wiederherstellen</button>
        </td>
      </tr>`).join('');
    document.getElementById('orphanedEmptyHint').classList.toggle('hidden', files.length > 0);
    document.getElementById('orphanedCleanupBtn').textContent = `🗑 ${files.length} verwaiste Dateien löschen`;
    document.getElementById('orphanedCleanupBtn').classList.toggle('hidden', files.length === 0);

    document.querySelectorAll('[data-restore-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const res = await this.apiFetch(`/admin/orphaned-files/${btn.dataset.restoreId}/restore`, { method: 'POST' });
        if (!res.ok) { alert(await res.text()); return; }
        this.loadOrphanedFiles();
        this.loadOverview();
      });
    });
  },

  async cleanupOrphanedFiles() {
    const count = document.querySelectorAll('#orphanedTableBody tr').length;
    if (!count) return;
    if (!confirm(`${count} verwaiste Datei(en) endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    const res = await this.apiFetch('/admin/orphaned-files/cleanup', { method: 'POST' });
    if (!res.ok) { alert(await res.text()); return; }
    this.loadOrphanedFiles();
    this.loadOverview();
    this.tryShowMain();
  },

  // ── Snapshot-Rollback ────────────────────────────────────────────────────

  renderSnapshotTargets(data) {
    const options = [];
    const addAll = (owner) => {
      owner.characters.forEach(c => options.push({ type: 'character', id: c.id, label: `👤 ${c.name || 'Namenlos'}` }));
      owner.campaigns.forEach(c  => options.push({ type: 'campaign',  id: c.id, label: `🏕 ${c.name || 'Namenlos'}` }));
    };
    data.users.forEach(addAll);
    addAll(data.orphaned);

    const select = document.getElementById('snapshotTarget');
    const prev = select.value;
    select.innerHTML = options.map(o => `<option value="${o.type}:${this._esc(o.id)}">${this._esc(o.label)}</option>`).join('');
    if (options.some(o => `${o.type}:${o.id}` === prev)) select.value = prev;
    this.loadSnapshotList();
  },

  async loadSnapshotList() {
    const val = document.getElementById('snapshotTarget').value;
    const listEl = document.getElementById('snapshotList');
    if (!val) { listEl.innerHTML = ''; return; }
    const [type, id] = val.split(':');
    const res = await this.apiFetch(`/admin/backup-snapshots?type=${type}&id=${encodeURIComponent(id)}`);
    if (!res.ok) { listEl.innerHTML = ''; return; }
    const snapshots = await res.json();
    listEl.innerHTML = snapshots.length
      ? snapshots.map(s => `<option value="${s.commit}">${new Date(s.date).toLocaleString('de-AT')} — ${this._esc(s.message)}</option>`).join('')
      : '<option value="" disabled>Keine Snapshots gefunden</option>';
  },

  async restoreSnapshot() {
    const val = document.getElementById('snapshotTarget').value;
    const commit = document.getElementById('snapshotList').value;
    const errEl = document.getElementById('snapshotError');
    if (!val || !commit) { errEl.textContent = 'Bitte Ziel und Snapshot wählen'; return; }
    const [type, id] = val.split(':');
    const label = document.getElementById('snapshotTarget').selectedOptions[0]?.textContent || id;
    const dateLabel = document.getElementById('snapshotList').selectedOptions[0]?.textContent || commit;
    if (!confirm(`„${label}" wirklich auf den Stand vom ${dateLabel} zurücksetzen? Der aktuelle Stand geht dabei verloren (außer er steckt selbst schon in einem älteren Snapshot).`)) return;

    const res = await this.apiFetch('/admin/backup-snapshots/restore', {
      method: 'POST', body: JSON.stringify({ type, id, commit }),
    });
    if (!res.ok) { errEl.textContent = await res.text(); return; }
    errEl.textContent = '';
    document.getElementById('snapshotHint').textContent =
      '✓ Wiederhergestellt. Alle Geräte sollten die App einmal neu laden, bevor dort weitergespeichert wird - sonst können noch nicht synchronisierte lokale Änderungen den Rollback teilweise rückgängig machen.';
    this.loadOverview();
    this.loadOrphanedFiles();
  },

  _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
};

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
