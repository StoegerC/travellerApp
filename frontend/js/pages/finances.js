/**
 * Finanzen-Seite – Credits, Schulden, Transaktionen
 */
const FinancesPage = {
  _filter:  'all',
  _txSign:  1,

  _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _fmt(n) {
    return 'Cr ' + Math.abs(Math.round(n)).toLocaleString('de-DE');
  },

  _fmtSigned(n) {
    return (n >= 0 ? '+' : '−') + this._fmt(n);
  },

  _catMeta(cat) {
    const map = {
      sold:      { label: 'Sold',       cls: 'cat-sold'      },
      equipment: { label: 'Ausrüstung', cls: 'cat-equipment' },
      ship:      { label: 'Schiff',     cls: 'cat-ship'      },
      trade:     { label: 'Handel',     cls: 'cat-trade'     },
      other:     { label: 'Sonstiges',  cls: 'cat-other'     },
    };
    return map[cat] || map.other;
  },

  _f(character) {
    if (!character.finances) {
      character.finances = { cashCredits: 0, pension: 0, transactions: [], recurringItems: [], debts: [] };
    }
    return character.finances;
  },

  // ── Render ────────────────────────────────────────────────────────────────

  render(character) {
    const f          = this._f(character);
    const totalDebt  = f.debts.reduce((s, d) => s + Math.max(0, d.remainingAmount || 0), 0);
    const netto      = f.cashCredits - totalDebt;

    return `
      <div class="fin-page">
        ${this._block1(f, totalDebt, netto)}
        ${this._block3(f)}
        ${this._block4(f)}
        ${this._block2(f)}
      </div>
      ${this._modalTx()}
      ${this._modalRecurring()}
      ${this._modalDebt()}`;
  },

  // ── Block 1: Kontostand ───────────────────────────────────────────────────

  _block1(f, totalDebt, netto) {
    const cashCls  = f.cashCredits >= 0 ? 'fin-pos' : 'fin-neg';
    const nettoCls = netto >= 0          ? 'fin-pos' : 'fin-neg';

    return `<div class="fin-block fin-block-balance">
      <div class="fin-balance ${cashCls}">${this._fmt(f.cashCredits)}</div>
      <div class="fin-summary">
        <div class="fin-summary-row">
          <span>Schulden gesamt</span>
          <span class="fin-neg">${this._fmt(totalDebt)}</span>
        </div>
        <div class="fin-summary-row">
          <span>Pension</span>
          <span>${this._fmt(f.pension)} / Monat
            <button class="fin-pension-edit" title="Bearbeiten">✎</button>
          </span>
        </div>
        <div class="fin-summary-row fin-summary-netto">
          <span>Netto</span>
          <span class="${nettoCls}">${this._fmtSigned(netto)}</span>
        </div>
      </div>
      <div class="fin-main-btns">
        <button id="finIncomeBtn"  class="fin-btn-income">+ Einnahme</button>
        <button id="finExpenseBtn" class="fin-btn-expense">− Ausgabe</button>
      </div>
    </div>`;
  },

  // ── Block 2: Transaktions-Log ─────────────────────────────────────────────

  _block2(f) {
    const filters = [
      { key: 'all',       label: 'Alle'       },
      { key: 'sold',      label: 'Sold'       },
      { key: 'equipment', label: 'Ausrüstung' },
      { key: 'ship',      label: 'Schiff'     },
      { key: 'trade',     label: 'Handel'     },
      { key: 'other',     label: 'Sonstiges'  },
    ];

    const visible = f.transactions.filter(t => !t._deleted);
    const list = (this._filter === 'all'
      ? visible
      : visible.filter(t => t.category === this._filter)
    ).slice().sort((a, b) => b.createdAt - a.createdAt);

    const filterBar = `<div class="fin-filter-bar">${
      filters.map(fi => `<button class="fin-filter-btn${this._filter === fi.key ? ' active' : ''}" data-filter="${fi.key}">${fi.label}</button>`).join('')
    }</div>`;

    let rows = '';
    if (!list.length) {
      rows = `<p class="fin-empty">Noch keine Transaktionen.</p>`;
    } else {
      list.forEach(t => {
        const realIdx = f.transactions.indexOf(t);
        const meta    = this._catMeta(t.category);
        const amtCls  = t.amount >= 0 ? 'fin-pos' : 'fin-neg';
        rows += `<div class="fin-tx-row">
          <span class="fin-tx-date">${this._esc(t.ingameDate || '–')}</span>
          <span class="fin-tx-desc">${this._esc(t.description || '')}</span>
          <span class="fin-badge ${meta.cls}">${meta.label}</span>
          <span class="fin-tx-amt ${amtCls}">${this._fmtSigned(t.amount)}</span>
          <button class="fin-tx-del" data-idx="${realIdx}">✕</button>
        </div>`;
      });
    }

    return `<div class="fin-block">
      <h3 class="fin-block-title">Transaktionen</h3>
      ${filterBar}
      <div class="fin-tx-list">${rows}</div>
    </div>`;
  },

  // ── Block 3: Wiederkehrende Posten ────────────────────────────────────────

  _block3(f) {
    let rows = '';
    f.recurringItems.forEach((item, i) => {
      if (item._deleted) return; // Index i bleibt roh (siehe data-idx-Nutzung)
      const amtCls      = item.amount >= 0 ? 'fin-pos' : 'fin-neg';
      const intervalLbl = { monthly: 'Monatlich', bimonthly: 'Alle 2 Monate', semiannual: 'Alle 6 Monate', weekly: 'Wöchentlich', yearly: 'Jährlich' }[item.interval] || item.interval;
      rows += `<div class="fin-rec-row">
        <span class="fin-rec-desc">${this._esc(item.description)}</span>
        <span class="fin-rec-interval">${intervalLbl}</span>
        <span class="fin-rec-amt ${amtCls}">${this._fmtSigned(item.amount)}</span>
        <label class="fin-switch">
          <input type="checkbox" class="fin-rec-toggle" data-idx="${i}" ${item.isActive ? 'checked' : ''}>
          <span class="fin-switch-slider"></span>
        </label>
        <button class="fin-rec-del" data-idx="${i}">✕</button>
      </div>`;
    });

    if (!rows) rows = `<p class="fin-empty">Keine wiederkehrenden Posten.</p>`;

    return `<div class="fin-block">
      <h3 class="fin-block-title">Wiederkehrende Posten</h3>
      <div class="fin-rec-list">${rows}</div>
      <div class="fin-rec-footer">
        <button id="addRecurringBtn"  class="fin-btn-secondary">+ Posten hinzufügen</button>
        <button id="monthlySettleBtn" class="fin-btn-settle">📅 Abrechnen</button>
      </div>
    </div>`;
  },

  // ── Block 4: Schulden ─────────────────────────────────────────────────────

  _block4(f) {
    let cards = '';
    f.debts.forEach((d, i) => {
      if (d._deleted) return; // Index i bleibt roh (siehe data-idx-Nutzung)
      const paid = (d.totalAmount || 0) - (d.remainingAmount || 0);
      const pct  = d.totalAmount > 0 ? Math.min(100, Math.max(0, Math.round((paid / d.totalAmount) * 100))) : 0;
      const done = (d.remainingAmount || 0) <= 0;

      cards += `<div class="fin-debt-card">
        <div class="fin-debt-header">
          <div>
            <span class="fin-debt-name">${this._esc(d.name)}</span>
            ${d.creditor ? `<span class="fin-debt-creditor">${this._esc(d.creditor)}</span>` : ''}
          </div>
          <button class="fin-debt-del" data-idx="${i}">✕</button>
        </div>
        <div class="fin-progress-track">
          <div class="fin-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="fin-debt-info">
          <span>${pct}% abbezahlt</span>
          <span class="fin-debt-numbers">
            <span class="fin-neg">${this._fmt(d.remainingAmount || 0)} verbleibend</span>
            &nbsp;|&nbsp;${this._fmt(d.monthlyPayment || 0)} / Monat
          </span>
        </div>
        ${done
          ? `<div class="fin-debt-done">✅ Abbezahlt</div>`
          : `<button class="fin-debt-pay" data-idx="${i}" data-payment="${d.monthlyPayment || 0}">
               Rate zahlen (${this._fmt(d.monthlyPayment || 0)})
             </button>`
        }
        ${d.notes ? `<div class="md-content fin-debt-notes">${Md.render(d.notes)}</div>` : ''}
      </div>`;
    });

    if (!cards) cards = `<p class="fin-empty">Keine Schulden eingetragen.</p>`;

    return `<div class="fin-block">
      <h3 class="fin-block-title">Schulden</h3>
      <div class="fin-debt-list">${cards}</div>
      <button id="addDebtBtn" class="fin-btn-secondary">+ Schuld hinzufügen</button>
    </div>`;
  },

  // ── Modals ────────────────────────────────────────────────────────────────

  _modalTx() {
    const cats = [
      { v: 'sold',      l: 'Sold'       },
      { v: 'equipment', l: 'Ausrüstung' },
      { v: 'ship',      l: 'Schiff'     },
      { v: 'trade',     l: 'Handel'     },
      { v: 'other',     l: 'Sonstiges'  },
    ];
    return `<div class="fin-modal-overlay" id="txModal">
      <div class="fin-modal">
        <h3 id="txModalTitle">Einnahme</h3>
        <input  id="txAmount" type="number" min="0" placeholder="Betrag (Cr)" class="fin-modal-field">
        <div class="loc-name-wrap">
          <input id="txDesc" type="text" placeholder="Beschreibung (@ verlinkt Personen/Orte/Quests/Journal)" class="fin-modal-field">
          <div id="txDescSuggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
        </div>
        <input  id="txDate"   type="text"   placeholder="Ingame-Datum (z.B. 1105-234)" class="fin-modal-field">
        <select id="txCat"    class="fin-modal-field">
          ${cats.map(c => `<option value="${c.v}">${c.l}</option>`).join('')}
        </select>
        <div class="fin-modal-actions">
          <button id="txSaveBtn"   class="fin-btn-save">Speichern</button>
          <button id="txCancelBtn" class="fin-btn-cancel">Abbrechen</button>
        </div>
      </div>
    </div>`;
  },

  _modalRecurring() {
    return `<div class="fin-modal-overlay" id="recModal">
      <div class="fin-modal">
        <h3>Wiederkehrender Posten</h3>
        <input  id="recDesc"     type="text"   placeholder="Beschreibung" class="fin-modal-field">
        <input  id="recAmount"   type="number" min="0" placeholder="Betrag (Cr)" class="fin-modal-field">
        <select id="recSign"     class="fin-modal-field">
          <option value="1">Einnahme (+)</option>
          <option value="-1">Ausgabe (−)</option>
        </select>
        <select id="recInterval" class="fin-modal-field">
          <option value="monthly">Monatlich</option>
          <option value="bimonthly">Alle 2 Monate</option>
          <option value="semiannual">Alle 6 Monate</option>
          <option value="yearly">Jährlich</option>
          <option value="weekly">Wöchentlich</option>
        </select>
        <div class="fin-modal-actions">
          <button id="recSaveBtn"   class="fin-btn-save">Speichern</button>
          <button id="recCancelBtn" class="fin-btn-cancel">Abbrechen</button>
        </div>
      </div>
    </div>`;
  },

  _modalDebt() {
    return `<div class="fin-modal-overlay" id="debtModal">
      <div class="fin-modal">
        <h3>Schuld hinzufügen</h3>
        <input    id="debtName"     type="text"   placeholder="Name (z.B. Schiffsdarlehen MCr 1,0)" class="fin-modal-field">
        <input    id="debtCreditor" type="text"   placeholder="Gläubiger (optional)"                 class="fin-modal-field">
        <input    id="debtTotal"    type="number" min="0" placeholder="Gesamtbetrag (Cr)"            class="fin-modal-field">
        <input    id="debtMonthly"  type="number" min="0" placeholder="Monatsrate (Cr)"              class="fin-modal-field">
        <div class="loc-name-wrap">
          <textarea id="debtNotes" placeholder="Notizen (optional, @ verlinkt Personen/Orte/Quests/Journal)" class="fin-modal-field fin-modal-textarea"></textarea>
          <div id="debtNotesSuggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
        </div>
        <div class="fin-modal-actions">
          <button id="debtSaveBtn"   class="fin-btn-save">Speichern</button>
          <button id="debtCancelBtn" class="fin-btn-cancel">Abbrechen</button>
        </div>
      </div>
    </div>`;
  },

  // ── Listener ──────────────────────────────────────────────────────────────

  save(character) { /* sofortiges Speichern überall */ },

  attachListeners() {
    const char    = window.currentCharacter;
    const f       = this._f(char);
    const rerender = () => App.renderCurrentPage();
    const showModal = id => document.getElementById(id)?.classList.add('open');
    const hideModal = id => document.getElementById(id)?.classList.remove('open');

    // "@"-Erwähnungen in den Modal-Feldern (Modals liegen immer im DOM, nur
    // per CSS versteckt - Anhängen schadet nicht, solange sie geschlossen sind).
    MentionAutocomplete.attach('txDesc',     'txDescSuggestions',     char);
    MentionAutocomplete.attach('debtNotes',  'debtNotesSuggestions', char);

    // ── Block 1 ──────────────────────────────────────────────────────────
    document.getElementById('finIncomeBtn')?.addEventListener('click', () => {
      this._txSign = 1;
      document.getElementById('txModalTitle').textContent = 'Einnahme';
      showModal('txModal');
    });
    document.getElementById('finExpenseBtn')?.addEventListener('click', () => {
      this._txSign = -1;
      document.getElementById('txModalTitle').textContent = 'Ausgabe';
      showModal('txModal');
    });
    document.querySelector('.fin-pension-edit')?.addEventListener('click', () => {
      const val = window.prompt('Pension pro Monat (Cr):', f.pension || 0);
      if (val === null) return;
      const n = parseFloat(val);
      if (!isNaN(n)) { f.pension = n; Storage.saveCharacter(char); rerender(); }
    });

    // ── Transaktion Modal ─────────────────────────────────────────────────
    document.getElementById('txCancelBtn')?.addEventListener('click', () => hideModal('txModal'));
    document.getElementById('txModal')?.addEventListener('click', e => { if (e.target.id === 'txModal') hideModal('txModal'); });
    document.getElementById('txSaveBtn')?.addEventListener('click', () => {
      const amount = parseFloat(document.getElementById('txAmount').value);
      if (!amount || amount <= 0) return;
      const tx = {
        id:          'tx-' + Date.now(),
        ingameDate:  document.getElementById('txDate').value.trim(),
        description: document.getElementById('txDesc').value.trim(),
        amount:      this._txSign * amount,
        category:    document.getElementById('txCat').value,
        createdAt:   Date.now(),
        updatedAt:   new Date().toISOString(),
      };
      f.transactions.push(tx);
      f.cashCredits += tx.amount;
      Storage.saveCharacter(char);
      hideModal('txModal');
      rerender();
    });

    // ── Filter ────────────────────────────────────────────────────────────
    document.querySelectorAll('.fin-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => { this._filter = btn.dataset.filter; rerender(); });
    });

    // ── Transaktion löschen ───────────────────────────────────────────────
    document.querySelectorAll('.fin-tx-del').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Transaktion löschen und Kassenstand korrigieren?')) return;
        const idx = parseInt(btn.dataset.idx);
        const tx  = f.transactions[idx];
        if (tx) {
          f.cashCredits -= tx.amount;
          const now = new Date().toISOString();
          tx._deleted  = true;
          tx.deletedAt = now;
          tx.updatedAt = now;
        }
        Storage.saveCharacter(char);
        rerender();
      });
    });

    // ── Wiederkehrende: Toggle ────────────────────────────────────────────
    document.querySelectorAll('.fin-rec-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const item = f.recurringItems[parseInt(cb.dataset.idx)];
        item.isActive  = cb.checked;
        item.updatedAt = new Date().toISOString();
        Storage.saveCharacter(char);
      });
    });

    // ── Wiederkehrende: Löschen ───────────────────────────────────────────
    document.querySelectorAll('.fin-rec-del').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Posten löschen?')) return;
        const item = f.recurringItems[parseInt(btn.dataset.idx)];
        if (item) {
          const now = new Date().toISOString();
          item._deleted  = true;
          item.deletedAt = now;
          item.updatedAt = now;
        }
        Storage.saveCharacter(char);
        rerender();
      });
    });

    // ── Wiederkehrende: Modal ─────────────────────────────────────────────
    document.getElementById('addRecurringBtn')?.addEventListener('click', () => showModal('recModal'));
    document.getElementById('recCancelBtn')?.addEventListener('click',   () => hideModal('recModal'));
    document.getElementById('recModal')?.addEventListener('click', e => { if (e.target.id === 'recModal') hideModal('recModal'); });
    document.getElementById('recSaveBtn')?.addEventListener('click', () => {
      const desc   = document.getElementById('recDesc').value.trim();
      const amount = parseFloat(document.getElementById('recAmount').value);
      if (!desc || !amount || amount <= 0) return;
      f.recurringItems.push({
        id:          'rec-' + Date.now(),
        description: desc,
        amount:      parseInt(document.getElementById('recSign').value) * amount,
        interval:    document.getElementById('recInterval').value,
        isActive:    true,
        updatedAt:   new Date().toISOString(),
      });
      Storage.saveCharacter(char);
      hideModal('recModal');
      rerender();
    });

    // ── Abrechnen ─────────────────────────────────────────────────────────
    document.getElementById('monthlySettleBtn')?.addEventListener('click', () => {
      this._showSettleModal(char, f, rerender);
    });

    // ── Schulden: Modal ───────────────────────────────────────────────────
    document.getElementById('addDebtBtn')?.addEventListener('click',    () => showModal('debtModal'));
    document.getElementById('debtCancelBtn')?.addEventListener('click', () => hideModal('debtModal'));
    document.getElementById('debtModal')?.addEventListener('click', e => { if (e.target.id === 'debtModal') hideModal('debtModal'); });
    document.getElementById('debtSaveBtn')?.addEventListener('click', () => {
      const name  = document.getElementById('debtName').value.trim();
      const total = parseFloat(document.getElementById('debtTotal').value);
      if (!name || !total || total <= 0) return;
      f.debts.push({
        id:              'debt-' + Date.now(),
        name,
        creditor:        document.getElementById('debtCreditor').value.trim(),
        totalAmount:     total,
        remainingAmount: total,
        monthlyPayment:  parseFloat(document.getElementById('debtMonthly').value) || 0,
        notes:           document.getElementById('debtNotes').value.trim(),
        updatedAt:       new Date().toISOString(),
      });
      Storage.saveCharacter(char);
      hideModal('debtModal');
      rerender();
    });

    // ── Rate zahlen ───────────────────────────────────────────────────────
    document.querySelectorAll('.fin-debt-pay').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx     = parseInt(btn.dataset.idx);
        const payment = parseFloat(btn.dataset.payment);
        const debt    = f.debts[idx];
        if (!debt) return;
        const actual = Math.min(payment, debt.remainingAmount);
        debt.remainingAmount = Math.max(0, debt.remainingAmount - actual);
        debt.updatedAt = new Date().toISOString();
        f.cashCredits -= actual;
        f.transactions.push({ id: 'tx-' + Date.now(), ingameDate: '', description: `Rate: ${debt.name}`, amount: -actual, category: 'ship', createdAt: Date.now(), updatedAt: new Date().toISOString() });
        Storage.saveCharacter(char);
        rerender();
      });
    });

    // ── Schulden löschen ──────────────────────────────────────────────────
    document.querySelectorAll('.fin-debt-del').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!window.confirm('Schuld löschen?')) return;
        const debt = f.debts[parseInt(btn.dataset.idx)];
        if (debt) {
          const now = new Date().toISOString();
          debt._deleted  = true;
          debt.deletedAt = now;
          debt.updatedAt = now;
        }
        Storage.saveCharacter(char);
        rerender();
      });
    });
  },

  // ── Abrechnungs-Modal (dynamisch) ─────────────────────────────────────────

  _intervalLabel(interval) {
    return { monthly: 'Monatlich', bimonthly: 'Alle 2 Monate', semiannual: 'Alle 6 Monate', weekly: 'Wöchentlich', yearly: 'Jährlich' }[interval] || interval;
  },

  _showSettleModal(char, f, rerender) {
    const activeCount = f.recurringItems.filter(r => !r._deleted).length;
    if (!activeCount) { window.alert('Keine wiederkehrenden Posten vorhanden.'); return; }

    const overlay = document.createElement('div');
    overlay.className = 'fin-settle-overlay';

    const rows = f.recurringItems.map((r, i) => {
      if (r._deleted) return ''; // Index i bleibt roh (siehe data-idx-Nutzung)
      const lbl    = this._intervalLabel(r.interval);
      const amtCls = r.amount >= 0 ? 'fin-pos' : 'fin-neg';
      return `<label class="fin-settle-item${r.isActive ? '' : ' fin-settle-inactive'}">
        <input type="checkbox" class="fin-settle-cb" data-idx="${i}" ${r.isActive ? 'checked' : ''}>
        <span class="fin-settle-desc">${this._esc(r.description)}</span>
        <span class="fin-settle-interval">${lbl}</span>
        <span class="fin-settle-amt ${amtCls}">${this._fmtSigned(r.amount)}</span>
      </label>`;
    }).join('');

    overlay.innerHTML = `
      <div class="fin-settle">
        <h3>Abrechnung</h3>
        <input id="settleDate" type="text" placeholder="Ingame-Datum (z.B. 1105-034)" class="fin-modal-field">
        <div class="fin-settle-list">${rows}</div>
        <div class="fin-settle-total" id="settleTotal"></div>
        <div class="fin-modal-actions">
          <button id="settleConfirmBtn" class="fin-btn-save">Abrechnen</button>
          <button id="settleCancelBtn"  class="fin-btn-cancel">Abbrechen</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const updateTotal = () => {
      let income = 0, expense = 0;
      overlay.querySelectorAll('.fin-settle-cb:checked').forEach(cb => {
        const r = f.recurringItems[parseInt(cb.dataset.idx)];
        if (!r) return;
        if (r.amount >= 0) income += r.amount; else expense += Math.abs(r.amount);
      });
      const saldo = income - expense;
      overlay.querySelector('#settleTotal').innerHTML =
        `<span class="fin-pos">+${this._fmt(income)}</span> Einnahmen &nbsp;|&nbsp; ` +
        `<span class="fin-neg">−${this._fmt(expense)}</span> Ausgaben &nbsp;|&nbsp; ` +
        `Saldo: <strong class="${saldo >= 0 ? 'fin-pos' : 'fin-neg'}">${this._fmtSigned(saldo)}</strong>`;
    };

    updateTotal();
    overlay.querySelectorAll('.fin-settle-cb').forEach(cb => cb.addEventListener('change', updateTotal));

    overlay.querySelector('#settleCancelBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#settleConfirmBtn').addEventListener('click', () => {
      const checked = Array.from(overlay.querySelectorAll('.fin-settle-cb:checked'));
      if (!checked.length) { window.alert('Keine Posten ausgewählt.'); return; }
      const ingameDate = overlay.querySelector('#settleDate').value.trim();
      const now = Date.now();
      checked.forEach(cb => {
        const r = f.recurringItems[parseInt(cb.dataset.idx)];
        if (!r) return;
        f.transactions.push({
          id: 'tx-' + now + Math.random(),
          ingameDate,
          description: r.description,
          amount:      r.amount,
          category:    'other',
          createdAt:   now,
          updatedAt:   new Date(now).toISOString(),
        });
        f.cashCredits += r.amount;
      });
      Storage.saveCharacter(char);
      overlay.remove();
      rerender();
    });
  },
};
