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
let activeTab = 'movimientos'; // 'movimientos' | 'configuracion'

// ── Presets ─────────────────────────────────────────────────────────
const ICON_PRESETS = ['💰','🏖️','🏠','🎓','🚗','💊','🎁','🛡️','🎯','✈️','🏋️','💻','📱','🎮','🐶','👶','🎵','📚','🔧','💍'];
const COLOR_PRESETS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#a855f7'];

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

async function apiFetch(path, opts = {}) {
  const res = await fetch(API_URL + path, { credentials: 'include', ...opts });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Render / Setup (called by app.js) ───────────────────────────────

export function render(user) {
  currentUser = user;
  return `
    <div class="pockets-page">
      ${Navbar.render(user, '/ahorros')}
      <div id="pockets-content"></div>
    </div>
  `;
}

export async function setup() {
  Navbar.setup();

  // Read URL to decide list vs detail
  const params = new URLSearchParams(window.location.search);
  currentPocketId = params.get('pocket');
  activeTab = 'movimientos';

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
    activeTab = 'movimientos';
    renderCurrentView();
  };
  window.addEventListener('popstate', popstateHandler);

  await renderCurrentView();
}

// ── Internal navigation ─────────────────────────────────────────────

async function renderCurrentView() {
  const container = document.getElementById('pockets-content');
  if (!container) return;
  if (currentPocketId) {
    await renderDetailView(container);
  } else {
    await renderListView(container);
  }
}

function navigateToPocket(pocketId) {
  currentPocketId = pocketId;
  activeTab = 'movimientos';
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

  const { total_balance, total_goal, pocket_count, pockets } = summaryData;

  // Progress percentage for total
  const totalPct = total_goal > 0 ? Math.round((total_balance / total_goal) * 100) : null;
  const totalPctDisplay = totalPct !== null ? Math.min(totalPct, 100) : null;

  let html = `
    <div class="pockets-list-wrapper">
      <h1 class="pockets-title">Ahorros</h1>

      <div class="pockets-total-card">
        <div class="pockets-total-label">Total ahorrado</div>
        <div class="pockets-total-amount">${formatCurrency(total_balance)}</div>
        ${totalPct !== null ? `
          <div class="pockets-total-progress">
            <div class="pocket-progress-bar">
              <div class="pocket-progress-fill" style="width:${totalPctDisplay}%;background:rgba(255,255,255,0.4)"></div>
            </div>
            <span class="pockets-total-pct">${totalPct}% de ${formatCurrency(total_goal)}</span>
          </div>
        ` : ''}
        <div class="pockets-total-count">${pocket_count} bolsillo${pocket_count !== 1 ? 's' : ''}</div>
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
      const pct = p.goal_amount > 0 ? Math.round((p.balance / p.goal_amount) * 100) : null;
      const pctDisplay = pct !== null ? Math.min(pct, 100) : null;
      html += `
        <div class="pocket-card" data-pocket-id="${p.id}" style="border-left-color:${p.color || '#6366f1'}">
          <div class="pocket-card-header">
            <span class="pocket-card-icon">${p.icon || '💰'}</span>
            <span class="pocket-card-name">${escapeHTML(p.name)}</span>
          </div>
          <div class="pocket-card-balance">${formatCurrency(p.balance)}</div>
          ${pct !== null ? `
            <div class="pocket-card-progress">
              <div class="pocket-progress-bar">
                <div class="pocket-progress-fill" style="width:${pctDisplay}%;background:${p.color || '#6366f1'}"></div>
              </div>
              <span class="pocket-card-pct">${pct}%</span>
            </div>
          ` : ''}
          <div class="pocket-card-owner">${escapeHTML(p.owner_name || '')}</div>
        </div>
      `;
    }
    html += '</div>';
  }

  html += '</div>'; // close wrapper

  // FAB
  html += '<button class="pocket-fab" id="pocket-fab-btn" title="Crear bolsillo">+</button>';

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
  let selectedColor = COLOR_PRESETS[0];

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
        <label>Ícono</label>
        <div class="pocket-icon-grid">
          ${ICON_PRESETS.map(ic => `<button type="button" class="pocket-icon-btn${ic === selectedIcon ? ' selected' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
        </div>
      </div>
      <div class="pocket-modal-field">
        <label>Color</label>
        <div class="pocket-color-row">
          ${COLOR_PRESETS.map(c => `<button type="button" class="pocket-color-btn${c === selectedColor ? ' selected' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        </div>
      </div>
      <div class="pocket-modal-field">
        <label>Meta de ahorro (opcional)</label>
        <input type="number" id="pocket-create-goal" min="0" placeholder="Ej: 5000000" />
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

  // Color picker
  overlay.querySelectorAll('.pocket-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.pocket-color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedColor = btn.dataset.color;
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

    const submitBtn = overlay.querySelector('#pocket-create-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando...';

    try {
      const body = { name, icon: selectedIcon, color: selectedColor, owner_id: currentUser.id };
      if (goal !== null && goal > 0) body.goal_amount = goal;
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
      alert('Error al crear bolsillo: ' + e.message);
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
  const pct = p.goal_amount > 0 ? Math.round((p.balance / p.goal_amount) * 100) : null;
  const pctDisplay = pct !== null ? Math.min(pct, 100) : null;
  const hasAccounts = accountsData && accountsData.length > 0;

  let html = `
    <div class="pocket-detail-wrapper">
      <button class="pocket-back-btn" id="pocket-back-btn">← Ahorros</button>

      <div class="pocket-detail-header" style="--pocket-color:${p.color || '#6366f1'}">
        <span class="pocket-detail-icon">${p.icon || '💰'}</span>
        <div class="pocket-detail-info">
          <h1 class="pocket-detail-name">${escapeHTML(p.name)}</h1>
          <div class="pocket-detail-balance">${formatCurrency(p.balance)}</div>
        </div>
      </div>

      ${pct !== null ? `
        <div class="pocket-progress-card">
          <div class="pocket-progress-bar pocket-progress-bar-lg">
            <div class="pocket-progress-fill" style="width:${pctDisplay}%;background:${p.color || '#6366f1'}"></div>
          </div>
          <div class="pocket-progress-info">
            <span>${pct}% de ${formatCurrency(p.goal_amount)}</span>
            ${pct >= 100 ? '<span class="pocket-goal-badge">🎉 ¡Meta alcanzada!</span>' : ''}
          </div>
        </div>
      ` : ''}

      <div class="pocket-actions">
        <button class="pocket-btn-deposit" id="pocket-deposit-btn" ${!hasAccounts ? 'disabled' : ''}>Depositar</button>
        <button class="pocket-btn-withdraw" id="pocket-withdraw-btn" ${!hasAccounts ? 'disabled' : ''}>Retirar</button>
      </div>
      ${!hasAccounts ? '<p class="pocket-no-accounts-msg">Primero crea una cuenta bancaria</p>' : ''}

      <div class="pocket-tabs">
        <button class="pocket-tab ${activeTab === 'movimientos' ? 'active' : ''}" data-tab="movimientos">Movimientos</button>
        <button class="pocket-tab ${activeTab === 'configuracion' ? 'active' : ''}" data-tab="configuracion">Configuración</button>
      </div>

      <div id="pocket-tab-content">
        ${activeTab === 'movimientos' ? renderTransactionsTab() : renderConfigTab()}
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
    const icon = isDeposit ? '⬆️' : '⬇️';
    const sign = isDeposit ? '+' : '-';
    const colorClass = isDeposit ? 'pocket-tx-positive' : 'pocket-tx-negative';

    html += `
      <div class="pocket-tx-item" data-tx-id="${tx.id}">
        <div class="pocket-tx-main">
          <span class="pocket-tx-icon">${icon}</span>
          <div class="pocket-tx-details">
            <span class="pocket-tx-desc">${escapeHTML(tx.description || (isDeposit ? 'Depósito' : 'Retiro'))}</span>
            <span class="pocket-tx-date">${formatDate(tx.transaction_date)}</span>
          </div>
          <span class="pocket-tx-amount ${colorClass}">${sign}${formatCurrency(tx.amount)}</span>
        </div>
        <div class="pocket-tx-actions">
          <button class="pocket-tx-edit-btn" data-tx-id="${tx.id}" title="Editar">✏️</button>
          <button class="pocket-tx-delete-btn" data-tx-id="${tx.id}" title="Eliminar">🗑️</button>
        </div>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function renderConfigTab() {
  const p = pocketDetailData;
  const hasGoal = p.goal_amount > 0;

  return `
    <div class="pocket-config-form">
      <div class="pocket-modal-field">
        <label>Nombre</label>
        <input type="text" id="pocket-cfg-name" maxlength="100" value="${escapeAttr(p.name)}" />
      </div>
      <div class="pocket-modal-field">
        <label>Ícono</label>
        <div class="pocket-icon-grid" id="pocket-cfg-icons">
          ${ICON_PRESETS.map(ic => `<button type="button" class="pocket-icon-btn${ic === p.icon ? ' selected' : ''}" data-icon="${ic}">${ic}</button>`).join('')}
        </div>
      </div>
      <div class="pocket-modal-field">
        <label>Color</label>
        <div class="pocket-color-row" id="pocket-cfg-colors">
          ${COLOR_PRESETS.map(c => `<button type="button" class="pocket-color-btn${c === p.color ? ' selected' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        </div>
      </div>
      <div class="pocket-modal-field">
        <label>Meta de ahorro</label>
        <input type="number" id="pocket-cfg-goal" min="0" value="${hasGoal ? p.goal_amount : ''}" placeholder="Ej: 5000000" />
        <label class="pocket-checkbox-label">
          <input type="checkbox" id="pocket-cfg-no-goal" ${!hasGoal ? 'checked' : ''} />
          <span>Sin meta</span>
        </label>
      </div>
      <button class="pocket-btn-primary pocket-save-cfg" id="pocket-cfg-save">Guardar cambios</button>

      <div class="pocket-danger-zone">
        <h3>Zona peligrosa</h3>
        <p>Eliminar este bolsillo de manera permanente.</p>
        <button class="pocket-btn-danger" id="pocket-delete-btn">Eliminar bolsillo</button>
      </div>
    </div>
  `;
}

function setupDetailListeners(container) {
  // Back
  container.querySelector('#pocket-back-btn')?.addEventListener('click', () => navigateToList());

  // Deposit / Withdraw
  container.querySelector('#pocket-deposit-btn')?.addEventListener('click', () => openDepositModal());
  container.querySelector('#pocket-withdraw-btn')?.addEventListener('click', () => openWithdrawModal());

  // Tabs
  container.querySelectorAll('.pocket-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      container.querySelectorAll('.pocket-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
      const tabContent = document.getElementById('pocket-tab-content');
      if (tabContent) {
        tabContent.innerHTML = activeTab === 'movimientos' ? renderTransactionsTab() : renderConfigTab();
        if (activeTab === 'movimientos') setupTransactionListeners();
        else setupConfigListeners();
      }
    });
  });

  // Initial tab listeners
  if (activeTab === 'movimientos') setupTransactionListeners();
  else setupConfigListeners();
}

function setupTransactionListeners() {
  document.querySelectorAll('.pocket-tx-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const txId = btn.dataset.txId;
      const tx = transactionsData.find(t => String(t.id) === txId);
      if (tx) openEditTransactionModal(tx);
    });
  });

  document.querySelectorAll('.pocket-tx-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const txId = btn.dataset.txId;
      const tx = transactionsData.find(t => String(t.id) === txId);
      if (tx) confirmDeleteTransaction(tx);
    });
  });
}

function setupConfigListeners() {
  // Icon picker
  const iconsContainer = document.getElementById('pocket-cfg-icons');
  if (iconsContainer) {
    iconsContainer.querySelectorAll('.pocket-icon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        iconsContainer.querySelectorAll('.pocket-icon-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  // Color picker
  const colorsContainer = document.getElementById('pocket-cfg-colors');
  if (colorsContainer) {
    colorsContainer.querySelectorAll('.pocket-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        colorsContainer.querySelectorAll('.pocket-color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  // No goal checkbox
  const noGoalCb = document.getElementById('pocket-cfg-no-goal');
  const goalInput = document.getElementById('pocket-cfg-goal');
  if (noGoalCb && goalInput) {
    noGoalCb.addEventListener('change', () => {
      goalInput.disabled = noGoalCb.checked;
      if (noGoalCb.checked) goalInput.value = '';
    });
    goalInput.disabled = noGoalCb.checked;
  }

  // Save config
  document.getElementById('pocket-cfg-save')?.addEventListener('click', async () => {
    const name = document.getElementById('pocket-cfg-name')?.value.trim();
    if (!name) return;

    const selectedIcon = document.querySelector('#pocket-cfg-icons .pocket-icon-btn.selected')?.dataset.icon || pocketDetailData.icon;
    const selectedColor = document.querySelector('#pocket-cfg-colors .pocket-color-btn.selected')?.dataset.color || pocketDetailData.color;
    const noGoal = document.getElementById('pocket-cfg-no-goal')?.checked;
    const goalStr = document.getElementById('pocket-cfg-goal')?.value;

    const body = { name, icon: selectedIcon, color: selectedColor };
    if (noGoal) {
      body.clear_goal = true;
    } else if (goalStr) {
      body.goal_amount = parseFloat(goalStr);
    }

    const saveBtn = document.getElementById('pocket-cfg-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    try {
      await apiFetch(`/api/pockets/${currentPocketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      // Re-render detail to show updated data
      const container = document.getElementById('pockets-content');
      activeTab = 'configuracion';
      await renderDetailView(container);
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar cambios';
      alert('Error: ' + e.message);
    }
  });

  // Delete pocket
  document.getElementById('pocket-delete-btn')?.addEventListener('click', () => confirmDeletePocket());
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
        <label>Categoría <span class="pocket-required">*</span></label>
        <select id="pocket-dep-category">
          <option value="">Seleccionar...</option>
          ${categoryGroupsData.map(g => `
            <optgroup label="${escapeHTML(g.name)}">
              ${(g.categories || []).map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('')}
            </optgroup>
          `).join('')}
        </select>
      </div>
      <div class="pocket-modal-field">
        <label>Descripción</label>
        <input type="text" id="pocket-dep-desc" placeholder="Ej: Ahorro mensual" />
      </div>
      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-cancel" id="pocket-dep-cancel">Cancelar</button>
        <button type="button" class="pocket-btn-deposit" id="pocket-dep-submit">Depositar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#pocket-dep-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#pocket-dep-submit').addEventListener('click', async () => {
    const amount = parseFloat(overlay.querySelector('#pocket-dep-amount').value);
    const accountId = overlay.querySelector('#pocket-dep-account').value;
    const categoryId = overlay.querySelector('#pocket-dep-category').value;
    const date = overlay.querySelector('#pocket-dep-date').value;
    const desc = overlay.querySelector('#pocket-dep-desc').value.trim();

    if (!amount || amount <= 0 || !accountId || !categoryId || !date) {
      alert('Completa los campos obligatorios');
      return;
    }

    const submitBtn = overlay.querySelector('#pocket-dep-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Depositando...';

    try {
      const body = {
        amount,
        description: desc || 'Depósito',
        transaction_date: date + 'T00:00:00Z',
        category_id: categoryId,
        source_account_id: accountId
      };
      await apiFetch(`/api/pockets/${currentPocketId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      overlay.remove();
      const container = document.getElementById('pockets-content');
      activeTab = 'movimientos';
      await renderDetailView(container);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Depositar';
      alert('Error: ' + e.message);
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
        <label>Descripción</label>
        <input type="text" id="pocket-wdr-desc" placeholder="Ej: Retiro para compra" />
      </div>
      <div class="pocket-modal-actions">
        <button type="button" class="pocket-btn-cancel" id="pocket-wdr-cancel">Cancelar</button>
        <button type="button" class="pocket-btn-withdraw-submit" id="pocket-wdr-submit">Retirar</button>
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
      alert('Completa los campos obligatorios');
      return;
    }

    const submitBtn = overlay.querySelector('#pocket-wdr-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Retirando...';

    try {
      const body = {
        amount,
        description: desc || 'Retiro',
        transaction_date: date + 'T00:00:00Z',
        destination_account_id: accountId
      };
      await apiFetch(`/api/pockets/${currentPocketId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      overlay.remove();
      const container = document.getElementById('pockets-content');
      activeTab = 'movimientos';
      await renderDetailView(container);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Retirar';
      alert('Error: ' + e.message);
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
        <label>Monto <span class="pocket-required">*</span></label>
        <input type="number" id="pocket-edit-amount" min="1" value="${tx.amount}" />
      </div>
      <div class="pocket-modal-field">
        <label>Descripción</label>
        <input type="text" id="pocket-edit-desc" value="${escapeAttr(tx.description || '')}" />
      </div>
      <div class="pocket-modal-field">
        <label>Fecha <span class="pocket-required">*</span></label>
        <input type="date" id="pocket-edit-date" value="${txDate}" />
      </div>
      ${isDeposit ? `
        <div class="pocket-modal-field">
          <label>Categoría</label>
          <select id="pocket-edit-category">
            <option value="">Seleccionar...</option>
            ${categoryGroupsData.map(g => `
              <optgroup label="${escapeHTML(g.name)}">
                ${(g.categories || []).map(c => `<option value="${c.id}" ${c.name === tx.category_name ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
              </optgroup>
            `).join('')}
          </select>
        </div>
        <div class="pocket-modal-field">
          <label>Cuenta origen</label>
          <select id="pocket-edit-source-account">
            <option value="">Seleccionar...</option>
            ${accountsData.map(a => `<option value="${a.id}" ${a.name === tx.source_account_name ? 'selected' : ''}>${escapeHTML(a.name)}</option>`).join('')}
          </select>
        </div>
      ` : `
        <div class="pocket-modal-field">
          <label>Cuenta destino</label>
          <select id="pocket-edit-dest-account">
            <option value="">Seleccionar...</option>
            ${accountsData.map(a => `<option value="${a.id}" ${a.name === tx.destination_account_name ? 'selected' : ''}>${escapeHTML(a.name)}</option>`).join('')}
          </select>
        </div>
      `}
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
      alert('Completa los campos obligatorios');
      return;
    }

    const body = {
      amount,
      description: desc,
      transaction_date: date + 'T00:00:00Z'
    };

    if (isDeposit) {
      const catId = overlay.querySelector('#pocket-edit-category')?.value;
      const srcAccId = overlay.querySelector('#pocket-edit-source-account')?.value;
      if (catId) body.category_id = catId;
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
      activeTab = 'movimientos';
      await renderDetailView(container);
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar';
      alert('Error: ' + e.message);
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
      activeTab = 'movimientos';
      await renderDetailView(container);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Eliminar';
      alert('Error: ' + e.message);
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
      alert('Error: ' + e.message);
    }
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
