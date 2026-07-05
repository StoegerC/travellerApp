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
    return true;
  },

  renderStats(s) {
    const fmtMb = bytes => (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    const fmtUptime = sec => {
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
      return `${h}h ${m}m`;
    };
    const cards = [
      { label: 'Charaktere', value: s.characterCount },
      { label: 'Kampagnen', value: s.campaignCount },
      { label: 'Nutzer', value: s.userCount },
      { label: 'Dateien', value: s.files.count },
      { label: 'Datei-Speicher', value: fmtMb(s.files.totalSize) },
      { label: 'Speicher frei', value: s.disk ? fmtMb(s.disk.freeBytes) : '–' },
      { label: 'Server-Uptime', value: fmtUptime(s.uptimeSeconds) },
    ];
    document.getElementById('statsGrid').innerHTML = cards.map(c =>
      `<div class="stat-card"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>`
    ).join('');
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
  },

  _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
};

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
