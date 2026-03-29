/**
 * Ahorros / Bolsillos Page
 *
 * Pocket-based savings management with:
 * - List view: summary card, pocket grid, create pocket modal
 * - Detail view: pocket info, deposits, withdrawals, transactions, config
 * - Internal navigation via pushState (same pathname /ahorros)
 */

import { API_URL } from '../config.js';
import router from '../router.js';
import * as Navbar from '../components/navbar.js';

// ── Module-level state ──────────────────────────────────────────────
let currentUser = null;
let currentPocketId = null; // null = list view, set = detail view
let summaryData = null;
let accountsData = null;
let categoryGroupsData = null;
let pocketDetailData = null;
let transactionsData = null;
let popstateHandler = null;
let fabMenuOpen = false;

// ── Presets ─────────────────────────────────────────────────────────
const ICON_PRESETS = ['💰','🏖️','🏠','🎓','🚗','💊','🎁','🛡️','🎯','✈️','🏋️','💻','📱','🎮','🐶','👶','🎵','📚','🔧','💍'];

// ── Helpers ─────────────────────────────────────────────────────────

function formatCurrency(num) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
}

function formatDate(dateString) {
  if (!dateString) return '';
  const datePart = dateString.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return '';
  const monthLong = date.toLocaleDateString('es-CO', { month: 'short' });
  const monthName = monthLong.replace('.', '').charAt(0).toUpperCase() + monthLong.replace('.', '').slice(1);
  return `${day} ${monthName} ${year}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Known backend error messages → user-friendly Spanish translations
const ERROR_MESSAGES = {
  'insufficient pocket balance': 'Saldo insuficiente en el bolsillo',
  'pocket not found': 'Bolsillo no encontrado',
  'pocket name already exists in household': 'Ya existe un bolsillo con ese nombre',
  'pocket is not active': 'Este bolsillo ya no está activo',
  'not authorized': 'No tienes permiso para esta acción',
  'maximum number of pockets reached (20)': 'Máximo 20 bolsillos permitidos',
  'pocket has remaining balance': 'El bolsillo aún tiene saldo',
  'pocket transaction not found': 'Transacción no encontrada',
  'deleting this deposit would cause negative balance': 'Eliminar este depósito dejaría el saldo en negativo',
  'amount must be positive': 'El monto debe ser positivo',
  'pocket name is required': 'El nombre del bolsillo es requerido',
  'pocket name cannot be empty': 'El nombre del bolsillo no puede estar vacío',
  'source account is required': 'Selecciona una cuenta origen',
  'destination account is required': 'Selecciona una cuenta destino',
};

function friendlyError(raw) {
  try {
    const parsed = JSON.parse(raw);
    const msg = parsed.error || parsed.message || raw;
    return ERROR_MESSAGES[msg] || msg;
  } catch {
    return ERROR_MESSAGES[raw] || raw;
  }
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API_URL + path, { credentials: 'include', ...opts });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(friendlyError(body || `HTTP ${res.status}`));
  }
  if (res.status === 204) return null;
  return res.json();
}

function showErrorModal(message) {
  const overlay = document.createElement('div');
  overlay.className = 'pocket-modal-overlay';
  overlay.innerHTML = `
    <div class="pocket-modal pocket-modal-sm">
      <h2>Error</h2>
      <p>${escapeHTML(message)}</p>
      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-primary" id="pocket-err-ok">Aceptar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#pocket-err-ok').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ── Render / Setup (called by app.js) ───────────────────────────────

export function render(user) {
  currentUser = user;
  return `
    <main class="card">
      <header class="header">
        <div class="header-row header-bordered" id="ahorros-header-row">
          <h1><span class="header-back-btn" id="header-back-btn" style="display:none">‹</span><span id="header-title"> Ahorros</span></h1>
          <span id="header-navbar">${Navbar.render(user, '/ahorros')}</span>
        </div>
      </header>
      <div id="pockets-content"></div>
    </main>
  `;
}

export async function setup() {
  Navbar.setup();

  // Read URL to decide list vs detail
  const params = new URLSearchParams(window.location.search);
  currentPocketId = params.get('pocket');

  // Fetch supporting data in parallel
  const [accounts, catGroups] = await Promise.all([
    apiFetch('/accounts').catch(() => []),
    apiFetch('/category-groups').catch(() => [])
  ]);
  accountsData = accounts || [];
  categoryGroupsData = catGroups || [];

  // Listen for browser back/forward that stay on /ahorros
  if (popstateHandler) window.removeEventListener('popstate', popstateHandler);
  popstateHandler = () => {
    if (window.location.pathname !== '/ahorros') return; // let router handle
    const p = new URLSearchParams(window.location.search);
    currentPocketId = p.get('pocket');
    renderCurrentView();
  };
  window.addEventListener('popstate', popstateHandler);

  await renderCurrentView();
}

// ── Internal navigation ─────────────────────────────────────────────

async function renderCurrentView() {
  const container = document.getElementById('pockets-content');
  if (!container) return;

  const backBtn = document.getElementById('header-back-btn');
  const title = document.getElementById('header-title');
  const navbar = document.getElementById('header-navbar');
  const headerRow = document.getElementById('ahorros-header-row');

  if (currentPocketId) {
    if (backBtn) { backBtn.style.display = 'inline'; backBtn.onclick = () => navigateToList(); }
    if (title) title.style.display = 'none';
    if (navbar) navbar.style.display = 'none';
    if (headerRow) headerRow.classList.remove('header-bordered');
    await renderDetailView(container);
  } else {
    if (backBtn) backBtn.style.display = 'none';
    if (title) title.style.display = 'inline';
    if (navbar) navbar.style.display = 'inline';
    if (headerRow) headerRow.classList.add('header-bordered');
    await renderListView(container);
  }
}

function navigateToPocket(pocketId) {
  currentPocketId = pocketId;
  window.history.pushState({}, '', `/ahorros?pocket=${pocketId}`);
  renderCurrentView();
}

function navigateToList() {
  currentPocketId = null;
  window.history.pushState({}, '', '/ahorros');
  renderCurrentView();
}

// ═══════════════════════════════════════════════════════════════════
//  LIST VIEW
// ═══════════════════════════════════════════════════════════════════

async function renderListView(container) {
  container.innerHTML = '<div class="pockets-loading">Cargando...</div>';

  try {
    summaryData = await apiFetch('/api/pockets/summary');
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444;text-align:center;padding:40px;">Error al cargar bolsillos: ${e.message}</p>`;
    return;
  }

  const { total_balance, pocket_count, pockets } = summaryData;

  let html = `
    <div class="pockets-list-wrapper">
      <div class="pockets-total-card">
        <div class="pockets-total-label">Total ahorrado</div>
        <div class="pockets-total-amount">${formatCurrency(total_balance)}</div>
      </div>
  `;

  if (pocket_count === 0) {
    html += `
      <div class="pocket-empty-state">
        <div class="pocket-empty-icon">💰</div>
        <h2>Crea tu primer bolsillo</h2>
        <p>Organiza tus metas de ahorro creando bolsillos dedicados</p>
        <button class="pocket-empty-btn" id="pocket-empty-create-btn">Crear bolsillo</button>
      </div>
    `;
  } else {
    html += '<div class="pockets-grid">';
    for (const p of pockets) {
      const rawPct = p.goal_amount > 0 ? (p.balance / p.goal_amount) * 100 : null;
      const pct = rawPct !== null ? Math.round(rawPct) : null;
      const pctDisplay = rawPct !== null ? Math.max(Math.min(rawPct, 100), p.balance > 0 ? 1 : 0) : null;
      const pctLabel = rawPct !== null ? (rawPct > 0 && pct === 0 ? '<1' : String(pct)) : null;
      html += `
        <div class="pocket-card" data-pocket-id="${p.id}">
          <div class="pocket-card-header">
            <span class="pocket-card-icon">${p.icon || '💰'}</span>
            <span class="pocket-card-name">${escapeHTML(p.name)}</span>
          </div>
          <div class="pocket-card-balance">${formatCurrency(p.balance)}</div>
          ${rawPct !== null ? `
            <div class="pocket-card-progress">
              <div class="pocket-progress-bar">
                <div class="pocket-progress-fill" style="width:${pctDisplay}%"></div>
              </div>
              <span class="pocket-card-pct">${pctLabel}%</span>
            </div>
          ` : ''}
        </div>
      `;
    }
    html += '</div>';
  }

  html += '</div>'; // close wrapper

  // FAB
  html += '<div class="floating-actions">';
  html += '  <button class="btn-add-floating" id="pocket-fab-btn" title="Crear bolsillo">+</button>';
  html += '</div>';

  container.innerHTML = html;

  // Event listeners
  container.querySelectorAll('.pocket-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.pocketId;
      navigateToPocket(id);
    });
  });

  const fabBtn = document.getElementById('pocket-fab-btn');
  if (fabBtn) fabBtn.addEventListener('click', () => openCreatePocketModal());

  const emptyBtn = document.getElementById('pocket-empty-create-btn');
  if (emptyBtn) emptyBtn.addEventListener('click', () => openCreatePocketModal());
}

// ── Create Pocket Modal ─────────────────────────────────────────────

function openCreatePocketModal() {
  let selectedIcon = ICON_PRESETS[0];

  const overlay = document.createElement('div');
  overlay.className = 'pocket-modal-overlay';
  overlay.innerHTML = `
    <div class="pocket-modal">
      <h2>Nuevo bolsillo</h2>
      <div class="pocket-modal-field">
        <label>Nombre <span class="pocket-required">*</span></label>
        <input type="text" id="pocket-create-name" maxlength="100" placeholder="Ej: Vacaciones" />
      </div>
      <div class="pocket-modal-field">
        <label>Nota (opcional)</label>
        <input type="text" id="pocket-create-note" maxlength="200" placeholder="Ej: Cajita Nu - Casa, Fiducuenta, etc." />
      </div>
      <div class="pocket-modal-field">
        <label>Meta de ahorro (opcional)</label>
        <input type="number" id="pocket-create-goal" min="0" placeholder="Ej: 5000000" />
      </div>
      <div class="pocket-modal-field">
        <label>Ícono</label>
        <div class="pocket-icon-grid">
          ${ICON_PRESETS.map(ic => `<button type="button" class="pocket-icon-btn${ic === selectedIcon ? ' selected' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
        </div>
      </div>
      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-cancel" id="pocket-create-cancel">Cancelar</button>
        <button type="button" class="pocket-btn-primary" id="pocket-create-submit">Crear</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Icon picker
  overlay.querySelectorAll('.pocket-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.pocket-icon-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedIcon = btn.dataset.icon;
    });
  });

  // Cancel
  overlay.querySelector('#pocket-create-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Submit
  overlay.querySelector('#pocket-create-submit').addEventListener('click', async () => {
    const name = overlay.querySelector('#pocket-create-name').value.trim();
    if (!name) {
      overlay.querySelector('#pocket-create-name').classList.add('invalid');
      return;
    }
    const goalStr = overlay.querySelector('#pocket-create-goal').value;
    const goal = goalStr ? parseFloat(goalStr) : null;
    const note = overlay.querySelector('#pocket-create-note').value.trim();

    const submitBtn = overlay.querySelector('#pocket-create-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando...';

    try {
      const body = { name, icon: selectedIcon, owner_id: currentUser.id };
      if (goal !== null && goal > 0) body.goal_amount = goal;
      if (note) body.note = note;
      await apiFetch('/api/pockets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      overlay.remove();
      await renderCurrentView();
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear';
      showErrorModal(e.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════

async function renderDetailView(container) {
  container.innerHTML = '<div class="pockets-loading">Cargando...</div>';

  try {
    [pocketDetailData, transactionsData] = await Promise.all([
      apiFetch(`/api/pockets/${currentPocketId}`),
      apiFetch(`/api/pockets/${currentPocketId}/transactions`)
    ]);
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444;text-align:center;padding:40px;">Error: ${e.message}</p>`;
    return;
  }

  if (!transactionsData) transactionsData = [];

  const p = pocketDetailData;
  const rawPct = p.goal_amount > 0 ? (p.balance / p.goal_amount) * 100 : null;
  const pct = rawPct !== null ? Math.round(rawPct) : null;
  const pctDisplay = rawPct !== null ? Math.max(Math.min(rawPct, 100), p.balance > 0 ? 1 : 0) : null;
  const pctLabel = rawPct !== null ? (rawPct > 0 && pct === 0 ? '<1' : String(pct)) : null;
  const hasAccounts = accountsData && accountsData.length > 0;

  let html = `
    <div class="pocket-detail-wrapper">
      <div class="pocket-detail-card">
        <div class="pocket-detail-header">
          <span class="pocket-detail-icon">${p.icon || '💰'}</span>
          <div class="pocket-detail-info">
            <h1 class="pocket-detail-name">${escapeHTML(p.name)}</h1>
            ${p.note ? `<div class="pocket-detail-note">${escapeHTML(p.note)}</div>` : ''}
            <div class="pocket-detail-balance">${formatCurrency(p.balance)}</div>
          </div>
        </div>
        ${rawPct !== null ? `
          <div class="pocket-progress-section">
            <div class="pocket-progress-bar pocket-progress-bar-lg">
              <div class="pocket-progress-fill" style="width:${pctDisplay}%"></div>
            </div>
            <div class="pocket-progress-info">
              <span>${pctLabel}% de ${formatCurrency(p.goal_amount)}</span>
              ${pct >= 100 ? '<span class="pocket-goal-badge">🎉 ¡Meta alcanzada!</span>' : ''}
            </div>
          </div>
        ` : ''}
      </div>

      ${!hasAccounts ? '<p class="pocket-no-accounts-msg">Primero crea una cuenta bancaria</p>' : ''}

      ${renderTransactionsTab()}

      <div class="floating-actions">
        <button class="btn-config-floating" id="pocket-fab-config" title="Configuración">⚙️</button>
        <div class="pocket-fab-add-wrapper">
          <div class="pocket-fab-menu" id="pocket-fab-menu">
            <button class="pocket-fab-menu-item pocket-fab-menu-deposit" id="pocket-fab-deposit">↓ Depositar</button>
            <button class="pocket-fab-menu-item pocket-fab-menu-withdraw" id="pocket-fab-withdraw">↑ Retirar</button>
          </div>
          <button class="btn-add-floating" id="pocket-fab-add" title="Depositar o retirar" ${!hasAccounts ? 'disabled' : ''}>+</button>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  setupDetailListeners(container);
}

function renderTransactionsTab() {
  if (!transactionsData || transactionsData.length === 0) {
    return '<div class="pocket-empty-tx">Sin transacciones aún</div>';
  }

  let html = '<div class="pocket-tx-list">';
  for (const tx of transactionsData) {
    const isDeposit = tx.type === 'DEPOSIT';
    const sign = isDeposit ? '+' : '-';
    const colorClass = isDeposit ? 'pocket-tx-positive' : 'pocket-tx-negative';
    const typeLabel = isDeposit ? 'Depósito' : 'Retiro';
    const txIcon = isDeposit ? '↓' : '↑';
    const iconClass = isDeposit ? 'pocket-tx-icon-deposit' : 'pocket-tx-icon-withdraw';

    html += `
      <div class="movement-detail-entry" data-tx-id="${tx.id}">
        <div class="pocket-tx-icon-container ${iconClass}">
          <span class="pocket-tx-icon">${txIcon}</span>
        </div>
        <div class="entry-info">
          <span class="entry-description">${escapeHTML(tx.description || typeLabel)}</span>
          <span class="entry-amount ${colorClass}">${sign}${formatCurrency(tx.amount)}</span>
          <div class="entry-date">${formatDate(tx.transaction_date)}</div>
        </div>
        <div class="entry-actions">
          <button class="three-dots-btn" data-tx-id="${tx.id}">⋮</button>
          <div class="three-dots-menu" id="tx-menu-${tx.id}">
            <button class="menu-item" data-action="edit" data-tx-id="${tx.id}">Editar</button>
            <button class="menu-item" data-action="delete" data-tx-id="${tx.id}">Eliminar</button>
          </div>
        </div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function setupDetailListeners(container) {
  // FAB "+" toggle menu
  const fabAdd = document.getElementById('pocket-fab-add');
  const fabMenu = document.getElementById('pocket-fab-menu');
  if (fabAdd && fabMenu) {
    fabAdd.addEventListener('click', e => {
      e.stopPropagation();
      fabMenuOpen = !fabMenuOpen;
      fabMenu.classList.toggle('open', fabMenuOpen);
      fabAdd.classList.toggle('open', fabMenuOpen);
    });
  }

  // FAB menu: Deposit
  document.getElementById('pocket-fab-deposit')?.addEventListener('click', () => {
    closeFabMenu();
    openDepositModal();
  });

  // FAB menu: Withdraw
  document.getElementById('pocket-fab-withdraw')?.addEventListener('click', () => {
    closeFabMenu();
    openWithdrawModal();
  });

  // FAB config: open config modal
  document.getElementById('pocket-fab-config')?.addEventListener('click', () => {
    openConfigModal();
  });

  // Close FAB menu when clicking outside
  document.addEventListener('click', e => {
    if (fabMenuOpen && !e.target.closest('.floating-actions')) {
      closeFabMenu();
    }
  });

  // Transaction listeners
  setupTransactionListeners();
}

function closeFabMenu() {
  fabMenuOpen = false;
  const fabMenu = document.getElementById('pocket-fab-menu');
  const fabAdd = document.getElementById('pocket-fab-add');
  if (fabMenu) fabMenu.classList.remove('open');
  if (fabAdd) fabAdd.classList.remove('open');
}

function setupTransactionListeners() {
  // Three-dots menu toggle
  document.querySelectorAll('.three-dots-btn[data-tx-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const txId = btn.dataset.txId;
      const menu = document.getElementById(`tx-menu-${txId}`);
      const isVisible = menu?.style.display === 'block';

      // Close all menus first
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');

      if (!isVisible && menu) {
        menu.style.display = 'block';
      }
    });
  });

  // Menu action items
  document.querySelectorAll('.three-dots-menu .menu-item[data-tx-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const txId = btn.dataset.txId;
      const action = btn.dataset.action;
      const tx = transactionsData.find(t => String(t.id) === txId);

      // Close menu
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');

      if (!tx) return;
      if (action === 'edit') openEditTransactionModal(tx);
      if (action === 'delete') confirmDeleteTransaction(tx);
    });
  });

  // Close menus when clicking outside
  document.addEventListener('click', function closeTxMenus(e) {
    if (!e.target.closest('.entry-actions') && !e.target.closest('.three-dots-menu')) {
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
    }
  }, { once: false });
}

// ── Config Modal ─────────────────────────────────────────────────

function openConfigModal() {
  const p = pocketDetailData;
  const hasGoal = p.goal_amount > 0;
  let selectedIcon = p.icon || '💰';

  const overlay = document.createElement('div');
  overlay.className = 'pocket-modal-overlay';
  overlay.innerHTML = `
    <div class="pocket-modal">
      <h2>Configuración</h2>
      <div class="pocket-modal-field">
        <label>Nombre <span class="pocket-required">*</span></label>
        <input type="text" id="pocket-cfg-name" maxlength="100" value="${escapeAttr(p.name)}" />
      </div>
      <div class="pocket-modal-field">
        <label>Nota (opcional)</label>
        <input type="text" id="pocket-cfg-note" maxlength="200" value="${escapeAttr(p.note || '')}" placeholder="Ej: Cajita Nu - Casa, Fiducuenta, etc." />
      </div>
      <div class="pocket-modal-field">
        <label>Meta de ahorro (opcional)</label>
        <input type="number" id="pocket-cfg-goal" min="0" value="${hasGoal ? p.goal_amount : ''}" placeholder="Dejar vacío para sin meta" />
      </div>
      <div class="pocket-modal-field">
        <label>Ícono</label>
        <div class="pocket-icon-grid" id="pocket-cfg-icons">
          ${ICON_PRESETS.map(ic => `<button type="button" class="pocket-icon-btn${ic === p.icon ? ' selected' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
        </div>
      </div>
      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-cancel" id="pocket-cfg-cancel">Cancelar</button>
        <button type="button" class="pocket-btn-primary" id="pocket-cfg-save">Guardar cambios</button>
      </div>

      <div class="pocket-danger-zone">
        <h3>Zona peligrosa</h3>
        <p>Eliminar este bolsillo de manera permanente.</p>
        <button class="pocket-btn-danger" id="pocket-delete-btn">Eliminar bolsillo</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close
  overlay.querySelector('#pocket-cfg-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Icon picker
  overlay.querySelectorAll('#pocket-cfg-icons .pocket-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('#pocket-cfg-icons .pocket-icon-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedIcon = btn.dataset.icon;
    });
  });

  // Save
  overlay.querySelector('#pocket-cfg-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#pocket-cfg-name')?.value.trim();
    if (!name) return;

    const goalStr = overlay.querySelector('#pocket-cfg-goal')?.value;
    const goal = goalStr ? parseFloat(goalStr) : 0;
    const note = overlay.querySelector('#pocket-cfg-note')?.value.trim();

    const body = { name, icon: selectedIcon };
    if (goal > 0) {
      body.goal_amount = goal;
    } else {
      body.clear_goal = true;
    }
    if (note) {
      body.note = note;
    } else {
      body.clear_note = true;
    }

    const saveBtn = overlay.querySelector('#pocket-cfg-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
      await apiFetch(`/api/pockets/${currentPocketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      overlay.remove();
      const container = document.getElementById('pockets-content');
      await renderDetailView(container);
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar cambios';
      showErrorModal(e.message);
    }
  });

  // Delete pocket
  overlay.querySelector('#pocket-delete-btn')?.addEventListener('click', () => {
    overlay.remove();
    confirmDeletePocket();
  });
}

// ── Deposit Modal ───────────────────────────────────────────────────

function openDepositModal() {
  const overlay = document.createElement('div');
  overlay.className = 'pocket-modal-overlay';
  overlay.innerHTML = `
    <div class="pocket-modal">
      <h2>Depositar</h2>
      <div class="pocket-modal-field">
        <label>Fecha <span class="pocket-required">*</span></label>
        <input type="date" id="pocket-dep-date" value="${todayISO()}" />
      </div>
      <div class="pocket-modal-field">
        <label>Monto <span class="pocket-required">*</span></label>
        <input type="number" id="pocket-dep-amount" min="1" placeholder="Ej: 100000" />
      </div>
      <div class="pocket-modal-field">
        <label>Cuenta origen <span class="pocket-required">*</span></label>
        <select id="pocket-dep-account">
          <option value="">Seleccionar...</option>
          ${accountsData.map(a => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('')}
        </select>
      </div>
      <div class="pocket-modal-field">
        <label>Descripción (opcional)</label>
        <input type="text" id="pocket-dep-desc" placeholder="Ej: Ahorro mensual" />
      </div>
      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-cancel" id="pocket-dep-cancel">Cancelar</button>
        <button type="button" class="pocket-btn-primary" id="pocket-dep-submit">Depositar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#pocket-dep-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#pocket-dep-submit').addEventListener('click', async () => {
    const amount = parseFloat(overlay.querySelector('#pocket-dep-amount').value);
    const accountId = overlay.querySelector('#pocket-dep-account').value;
    const date = overlay.querySelector('#pocket-dep-date').value;
    const desc = overlay.querySelector('#pocket-dep-desc').value.trim();

    if (!amount || amount <= 0 || !accountId || !date) {
      showErrorModal('Completa los campos obligatorios');
      return;
    }

    const submitBtn = overlay.querySelector('#pocket-dep-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Depositando...';

    try {
      const body = {
        amount,
        description: desc || 'Depósito',
        transaction_date: date,
        source_account_id: accountId
      };
      const result = await apiFetch(`/api/pockets/${currentPocketId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      overlay.remove();

      // Show notification if a new category was auto-created
      if (result && result.category_created) {
        showCategoryCreatedNotification(pocketDetailData?.name || '');
      }

      const container = document.getElementById('pockets-content');
      await renderDetailView(container);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Depositar';
      showErrorModal(e.message);
    }
  });
}

// ── Withdraw Modal ──────────────────────────────────────────────────

function openWithdrawModal() {
  const maxBalance = pocketDetailData?.balance || 0;
  const overlay = document.createElement('div');
  overlay.className = 'pocket-modal-overlay';
  overlay.innerHTML = `
    <div class="pocket-modal">
      <h2>Retirar</h2>
      <div class="pocket-modal-field">
        <label>Fecha <span class="pocket-required">*</span></label>
        <input type="date" id="pocket-wdr-date" value="${todayISO()}" />
      </div>
      <div class="pocket-modal-field">
        <label>Monto <span class="pocket-required">*</span></label>
        <input type="number" id="pocket-wdr-amount" min="1" max="${maxBalance}" placeholder="Ej: 50000" />
        <span class="pocket-field-hint">Máximo: ${formatCurrency(maxBalance)}</span>
      </div>
      <div class="pocket-modal-field">
        <label>Cuenta destino <span class="pocket-required">*</span></label>
        <select id="pocket-wdr-account">
          <option value="">Seleccionar...</option>
          ${accountsData.map(a => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join('')}
        </select>
      </div>
      <div class="pocket-modal-field">
        <label>Descripción (opcional)</label>
        <input type="text" id="pocket-wdr-desc" placeholder="Ej: Retiro para compra" />
      </div>
      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-cancel" id="pocket-wdr-cancel">Cancelar</button>
        <button type="button" class="pocket-btn-primary" id="pocket-wdr-submit">Retirar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#pocket-wdr-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#pocket-wdr-submit').addEventListener('click', async () => {
    const amount = parseFloat(overlay.querySelector('#pocket-wdr-amount').value);
    const accountId = overlay.querySelector('#pocket-wdr-account').value;
    const date = overlay.querySelector('#pocket-wdr-date').value;
    const desc = overlay.querySelector('#pocket-wdr-desc').value.trim();

    if (!amount || amount <= 0 || !accountId || !date) {
      showErrorModal('Completa los campos obligatorios');
      return;
    }

    const submitBtn = overlay.querySelector('#pocket-wdr-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Retirando...';

    try {
      const body = {
        amount,
        description: desc || 'Retiro',
        transaction_date: date,
        destination_account_id: accountId
      };
      await apiFetch(`/api/pockets/${currentPocketId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      overlay.remove();
      const container = document.getElementById('pockets-content');
      await renderDetailView(container);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Retirar';
      showErrorModal(e.message);
    }
  });
}

// ── Edit Transaction Modal ──────────────────────────────────────────

function openEditTransactionModal(tx) {
  const isDeposit = tx.type === 'DEPOSIT';
  const txDate = tx.transaction_date ? tx.transaction_date.split('T')[0] : todayISO();

  const overlay = document.createElement('div');
  overlay.className = 'pocket-modal-overlay';
  overlay.innerHTML = `
    <div class="pocket-modal">
      <h2>Editar ${isDeposit ? 'depósito' : 'retiro'}</h2>
      <div class="pocket-modal-field">
        <label>Fecha <span class="pocket-required">*</span></label>
        <input type="date" id="pocket-edit-date" value="${txDate}" />
      </div>
      <div class="pocket-modal-field">
        <label>Monto <span class="pocket-required">*</span></label>
        <input type="number" id="pocket-edit-amount" min="1" value="${tx.amount}" />
      </div>

      ${isDeposit ? `
        <div class="pocket-modal-field">
          <label>Cuenta origen <span class="pocket-required">*</span></label>
          <select id="pocket-edit-source-account">
            <option value="">Seleccionar...</option>
            ${accountsData.map(a => `<option value="${a.id}" ${a.name === tx.source_account_name ? 'selected' : ''}>${escapeHTML(a.name)}</option>`).join('')}
          </select>
        </div>
      ` : `
        <div class="pocket-modal-field">
          <label>Cuenta destino <span class="pocket-required">*</span></label>
          <select id="pocket-edit-dest-account">
            <option value="">Seleccionar...</option>
            ${accountsData.map(a => `<option value="${a.id}" ${a.name === tx.destination_account_name ? 'selected' : ''}>${escapeHTML(a.name)}</option>`).join('')}
          </select>
        </div>
      `}

      <div class="pocket-modal-field">
        <label>Descripción (opcional)</label>
        <input type="text" id="pocket-edit-desc" value="${escapeAttr(tx.description || '')}" />
      </div>

      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-cancel" id="pocket-edit-cancel">Cancelar</button>
        <button type="button" class="pocket-btn-primary" id="pocket-edit-submit">Guardar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#pocket-edit-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#pocket-edit-submit').addEventListener('click', async () => {
    const amount = parseFloat(overlay.querySelector('#pocket-edit-amount').value);
    const desc = overlay.querySelector('#pocket-edit-desc').value.trim();
    const date = overlay.querySelector('#pocket-edit-date').value;

    if (!amount || amount <= 0 || !date) {
      showErrorModal('Completa los campos obligatorios');
      return;
    }

    const body = {
      amount,
      description: desc,
      transaction_date: date
    };

    if (isDeposit) {
      const srcAccId = overlay.querySelector('#pocket-edit-source-account')?.value;
      if (srcAccId) body.source_account_id = srcAccId;
    } else {
      const destAccId = overlay.querySelector('#pocket-edit-dest-account')?.value;
      if (destAccId) body.destination_account_id = destAccId;
    }

    const submitBtn = overlay.querySelector('#pocket-edit-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    try {
      await apiFetch(`/api/pocket-transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      overlay.remove();
      const container = document.getElementById('pockets-content');
      await renderDetailView(container);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar';
      showErrorModal(e.message);
    }
  });
}

// ── Delete Transaction Confirmation ─────────────────────────────────

function confirmDeleteTransaction(tx) {
  const isDeposit = tx.type === 'DEPOSIT';
  const message = isDeposit
    ? 'Al eliminar este depósito, también se eliminará el gasto asociado en Gastos. ¿Continuar?'
    : '¿Eliminar este retiro?';

  const overlay = document.createElement('div');
  overlay.className = 'pocket-modal-overlay';
  overlay.innerHTML = `
    <div class="pocket-modal pocket-modal-sm">
      <h2>Confirmar eliminación</h2>
      <p>${message}</p>
      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-cancel" id="pocket-del-tx-cancel">Cancelar</button>
        <button type="button" class="pocket-btn-danger" id="pocket-del-tx-confirm">Eliminar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#pocket-del-tx-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#pocket-del-tx-confirm').addEventListener('click', async () => {
    const btn = overlay.querySelector('#pocket-del-tx-confirm');
    btn.disabled = true;
    btn.textContent = 'Eliminando...';

    try {
      await apiFetch(`/api/pocket-transactions/${tx.id}`, { method: 'DELETE' });
      overlay.remove();
      const container = document.getElementById('pockets-content');
      await renderDetailView(container);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Eliminar';
      showErrorModal(e.message);
    }
  });
}

// ── Delete Pocket Confirmation ──────────────────────────────────────

function confirmDeletePocket() {
  const balance = pocketDetailData?.balance || 0;
  const message = balance > 0
    ? `Este bolsillo tiene saldo de ${formatCurrency(balance)}. ¿Deseas eliminarlo de todos modos?`
    : '¿Eliminar este bolsillo?';

  const overlay = document.createElement('div');
  overlay.className = 'pocket-modal-overlay';
  overlay.innerHTML = `
    <div class="pocket-modal pocket-modal-sm">
      <h2>Eliminar bolsillo</h2>
      <p>${message}</p>
      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-cancel" id="pocket-del-cancel">Cancelar</button>
        <button type="button" class="pocket-btn-danger" id="pocket-del-confirm">Eliminar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#pocket-del-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#pocket-del-confirm').addEventListener('click', async () => {
    const btn = overlay.querySelector('#pocket-del-confirm');
    btn.disabled = true;
    btn.textContent = 'Eliminando...';

    try {
      await apiFetch(`/api/pockets/${currentPocketId}?force=true`, { method: 'DELETE' });
      overlay.remove();
      navigateToList();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Eliminar';
      showErrorModal(e.message);
    }
  });
}

// ── Category Created Notification ────────────────────────────────────

function showCategoryCreatedNotification(pocketName) {
  const toast = document.createElement('div');
  toast.className = 'pocket-toast';
  toast.innerHTML = `
    <span class="pocket-toast-icon">📂</span>
    <span>Se ha creado la categoría <strong>${escapeHTML(pocketName)}</strong> en el grupo <strong>Ahorros</strong> para rastrear los depósitos de este bolsillo en los gastos del mes.</span>
  `;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('visible'));

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 6000);

  // Dismiss on click
  toast.addEventListener('click', () => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  });
}

// ── Utility ─────────────────────────────────────────────────────────

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
