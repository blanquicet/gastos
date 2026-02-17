/**
 * Profile Page
 * 
 * Display of:
 * - User information (name, email)
 * - Household status (none or household name)
 * - Link to household details if household exists
 * - Payment methods management (with edit/delete)
 */

import { API_URL } from '../config.js';
import router from '../router.js';
import * as Navbar from '../components/navbar.js';
import { showConfirmation, showSuccess, showError, showCreateHouseholdModal } from '../utils.js';

let currentUser = null;
let currentHousehold = null;
let accounts = [];
let paymentMethods = [];

// Account type labels in Spanish
const ACCOUNT_TYPES = {
  savings: 'Cuenta de Ahorros',
  cash: 'Efectivo',
  checking: 'Cuenta Corriente'
};

// Payment method type labels in Spanish
const PAYMENT_METHOD_TYPES = {
  credit_card: 'Tarjeta de Crédito',
  debit_card: 'Tarjeta de Débito',
  cash: 'Efectivo',
  other: 'Otro'
};

/**
 * Render profile page
 */
export function render(user) {
  currentUser = user;
  
  return `
    <main class="card">
      <header class="header">
        <div class="header-row">
          <h1>Mi perfil</h1>
          ${Navbar.render(user, '/perfil')}
        </div>
        <p class="subtitle">Información de tu cuenta y hogar.</p>
      </header>

      <div id="profile-content">
        <div class="loading-section">
          <div class="spinner-small"></div>
          <p>Cargando información...</p>
        </div>
      </div>
    </main>
  `;
}

/**
 * Setup profile page
 */
export async function setup() {
  Navbar.setup();
  await loadProfile();
}

/**
 * Load profile data from API
 */
async function loadProfile() {
  const contentEl = document.getElementById('profile-content');
  
  try {
    // Fetch user's households, accounts, and payment methods in parallel
    const [householdsResponse, accountsResponse, paymentMethodsResponse] = await Promise.all([
      fetch(`${API_URL}/households`, { credentials: 'include' }),
      fetch(`${API_URL}/accounts?owner_id=${currentUser.id}`, { credentials: 'include' }),
      fetch(`${API_URL}/payment-methods?own_only=true`, { credentials: 'include' })
    ]);

    if (!householdsResponse.ok) {
      throw new Error('Error al cargar información del hogar');
    }

    const data = await householdsResponse.json();
    const households = data.households || [];
    currentHousehold = households.length > 0 ? households[0] : null;

    // Load accounts if user has household
    if (accountsResponse.ok) {
      const accountsData = await accountsResponse.json();
      accounts = accountsData || [];
    } else {
      accounts = [];
    }

    // Load payment methods if user has household
    if (paymentMethodsResponse.ok) {
      const paymentMethodsData = await paymentMethodsResponse.json();
      paymentMethods = paymentMethodsData || [];
    } else {
      paymentMethods = [];
    }

    // Render profile content
    contentEl.innerHTML = renderProfileContent();
    setupEventListeners();

  } catch (error) {
    console.error('Error loading profile:', error);
    contentEl.innerHTML = `
      <div class="error-box">
        <p>Error al cargar tu perfil. Por favor, intenta de nuevo.</p>
        <button id="retry-btn" class="btn-secondary">Reintentar</button>
      </div>
    `;
    
    document.getElementById('retry-btn')?.addEventListener('click', loadProfile);
  }
}

/**
 * Render profile content
 */
function renderProfileContent() {
  return `
    <div class="profile-section">
      <h2 class="section-title">Información personal</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Nombre</span>
          <span class="info-value">${currentUser.name}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Email</span>
          <span class="info-value">${currentUser.email}</span>
        </div>
      </div>
    </div>

    <div class="profile-section">
      <h2 class="section-title">Mi hogar</h2>
      ${renderHouseholdSection()}
    </div>

    <div class="profile-section">
      <h2 class="section-title">Mis cuentas</h2>
      <p class="section-description">Donde vive tu dinero: cuentas bancarias y efectivo</p>
      ${(accounts && accounts.length > 0) ? `
        <div style="margin-bottom: 16px;">
          <button id="add-account-btn" class="btn-secondary btn-small">+ Agregar cuenta</button>
        </div>
      ` : ''}
      ${renderAccountsList()}
    </div>

    <div class="profile-section">
      <h2 class="section-title">Mis métodos de pago</h2>
      <p class="section-description">Tarjetas y formas de pago que usas para tus gastos</p>
      ${(paymentMethods && paymentMethods.length > 0) ? `
        <div style="margin-bottom: 16px;">
          <button id="add-payment-method-btn" class="btn-secondary btn-small">+ Agregar método</button>
        </div>
      ` : ''}
      ${renderPaymentMethodsList()}
    </div>
  `;
}

/**
 * Render household section
 */
function renderHouseholdSection() {
  if (!currentHousehold) {
    return `
      <div class="no-household">
        <div class="no-household-icon">🏠</div>
        <p class="no-household-text">Aún no tienes un hogar configurado</p>
        <p class="no-household-hint">Crea un hogar para compartir gastos con tu familia</p>
        <button id="create-household-btn" class="btn-primary">Crear hogar</button>
      </div>
    `;
  }

  return `
    <div class="household-card">
      <div class="household-header">
        <div class="household-icon">🏠</div>
        <div class="household-info">
          <h3 class="household-name">${currentHousehold.name}</h3>
          <p class="household-meta">Creado el ${formatDate(currentHousehold.created_at)}</p>
        </div>
      </div>
      <div class="household-actions">
        <button id="view-household-btn" class="btn-secondary">Ver detalles</button>
      </div>
    </div>
  `;
}

/**
 * Render accounts list
 */
function renderAccountsList() {
  if (!accounts || !Array.isArray(accounts)) {
    return `
      <div class="no-household">
        <p class="no-household-text">No tienes cuentas registradas</p>
        <button id="add-account-btn" class="btn-secondary" style="margin-top: 16px;">Agregar cuenta</button>
      </div>
    `;
  }

  const emptyState = accounts.length === 0 ? `
    <div class="no-household">
      <p class="no-household-text">No tienes cuentas registradas</p>
      <button id="add-account-btn" class="btn-secondary" style="margin-top: 16px;">Agregar cuenta</button>
    </div>
  ` : '';

  // Find debit cards linked to accounts
  const getLinkedDebitCard = (accountId) => {
    const debitCard = paymentMethods.find(pm => pm.type === 'debit_card' && pm.account_id === accountId);
    return debitCard ? debitCard.name : null;
  };

  const accountList = accounts.length > 0 ? `
    <div class="contact-list">
      ${accounts.map(account => {
        const linkedDebitCard = getLinkedDebitCard(account.id);
        return `
        <div class="contact-item">
          <div class="contact-avatar">${getAccountIcon(account.type)}</div>
          <div class="contact-info">
            <div class="contact-name">${account.name}</div>
            ${account.institution ? `<div class="contact-details">${account.institution}${account.last4 ? ` • ••• ${account.last4}` : ''}</div>` : ''}
            ${account.current_balance !== undefined ? `<div class="contact-details">Balance: ${formatCurrency(account.current_balance)}</div>` : ''}
            ${linkedDebitCard ? `<div class="contact-details" style="color: #059669;">💳 ${linkedDebitCard}</div>` : ''}
          </div>
          <div class="contact-actions">
            <button class="three-dots-btn" data-account-id="${account.id}">⋮</button>
            <div class="three-dots-menu" id="account-menu-${account.id}">
              <button class="menu-item" data-action="edit-account" data-id="${account.id}">Editar</button>
              <button class="menu-item" data-action="delete-account" data-id="${account.id}">Eliminar</button>
            </div>
          </div>
        </div>
      `}).join('')}
    </div>
  ` : '';

  return `
    ${emptyState}
    ${accountList}
  `;
}

/**
 * Get icon for account type
 */
function getAccountIcon(type) {
  switch(type) {
    case 'savings': return '💰';
    case 'cash': return '💵';
    case 'checking': return '🏦';
    default: return '💳';
  }
}

/**
 * Format currency
 */
function formatCurrency(num) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num || 0);
}

/**
 * Render payment methods list
 */
function renderPaymentMethodsList() {
  if (!paymentMethods || !Array.isArray(paymentMethods)) {
    return `
      <div class="no-household">
        <p class="no-household-text">No tienes métodos de pago configurados</p>
        <button id="add-payment-method-btn" class="btn-secondary" style="margin-top: 16px;">Agregar método de pago</button>
      </div>
    `;
  }

  const emptyState = paymentMethods.length === 0 ? `
    <div class="no-household">
      <p class="no-household-text">No tienes métodos de pago configurados</p>
      <button id="add-payment-method-btn" class="btn-secondary" style="margin-top: 16px;">Agregar método de pago</button>
    </div>
  ` : '';

  // Find account linked to debit card
  const getLinkedAccount = (pm) => {
    if (pm.type !== 'debit_card' || !pm.account_id) return null;
    const account = accounts.find(a => a.id === pm.account_id);
    return account ? account.name : null;
  };

  const paymentList = paymentMethods.length > 0 ? `
    <div class="contacts-list">
      ${paymentMethods.map(pm => {
        const linkedAccount = getLinkedAccount(pm);
        return `
        <div class="contact-item">
          <div class="contact-avatar">${getPaymentMethodIcon(pm.type)}</div>
          <div class="contact-info">
            <div class="contact-name">${pm.name}</div>
            ${pm.last4 ? `<div class="contact-details">••• ${pm.last4}</div>` : ''}
            <div class="contact-details">${PAYMENT_METHOD_TYPES[pm.type] || pm.type}</div>
            ${pm.institution ? `<div class="contact-details">${pm.institution}</div>` : ''}
            ${linkedAccount ? `<div class="contact-details" style="color: #059669;">💰 ${linkedAccount}</div>` : ''}
          </div>
          <div class="contact-badges">
            ${pm.is_shared_with_household ? '<span class="member-role role-owner" title="Compartido con el hogar">Compartido</span>' : ''}
            ${!pm.is_active ? '<span class="inactive-badge">Inactivo</span>' : ''}
          </div>
          <div class="contact-actions-menu">
            <button class="btn-menu" data-menu-id="${pm.id}">⋮</button>
            <div class="actions-dropdown" id="menu-${pm.id}" style="display: none;">
              <button class="dropdown-item" data-action="edit-pm" data-id="${pm.id}">Editar</button>
              <button class="dropdown-item text-danger" data-action="delete-pm" data-id="${pm.id}">Eliminar</button>
            </div>
          </div>
        </div>
      `}).join('')}
    </div>
  ` : '';

  return `
    ${emptyState}
    ${paymentList}
  `;
}

/**
 * Get icon for payment method type
 */
function getPaymentMethodIcon(type) {
  const icons = {
    credit_card: '💳',
    debit_card: '💳',
    cash: '💵',
    other: '💰'
  };
  return icons[type] || '💰';
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  const createBtn = document.getElementById('create-household-btn');
  const viewBtn = document.getElementById('view-household-btn');
  const addAccountBtn = document.getElementById('add-account-btn');
  const addPaymentMethodBtn = document.getElementById('add-payment-method-btn');

  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const household = await showCreateHouseholdModal(API_URL);
      if (household) {
        showSuccess('¡Hogar creado!', `Tu hogar <strong>${household.name}</strong> ha sido creado exitosamente.`);
        // Reload the profile page to show the new household
        router.navigate('/perfil');
      }
    });
  }

  if (viewBtn) {
    viewBtn.addEventListener('click', () => {
      router.navigate('/hogar');
    });
  }

  if (addAccountBtn) {
    addAccountBtn.addEventListener('click', () => {
      showAccountModal();
    });
  }

  if (addPaymentMethodBtn) {
    addPaymentMethodBtn.addEventListener('click', () => {
      showPaymentMethodModal();
    });
  }

  // Menu toggle buttons (for payment methods)
  document.querySelectorAll('[data-menu-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const menuId = e.currentTarget.dataset.menuId;
      const menu = document.getElementById(`menu-${menuId}`);
      const isOpen = menu.style.display === 'block';
      
      // Close all menus
      document.querySelectorAll('.actions-dropdown, .three-dots-menu').forEach(m => m.style.display = 'none');
      
      // Toggle this menu
      if (!isOpen) {
        // Position the menu relative to the button
        const btnRect = btn.getBoundingClientRect();
        menu.style.top = `${btnRect.bottom + 4}px`;
        menu.style.right = `${window.innerWidth - btnRect.right}px`;
        menu.style.left = 'auto';
        menu.style.display = 'block';
      }
    });
  });

  // Account three-dots menu toggle
  document.querySelectorAll('.three-dots-btn[data-account-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const accountId = e.currentTarget.dataset.accountId;
      const menu = document.getElementById(`account-menu-${accountId}`);
      const isOpen = menu.style.display === 'block';
      
      // Close all menus
      document.querySelectorAll('.actions-dropdown, .three-dots-menu').forEach(m => m.style.display = 'none');
      
      // Toggle this menu
      if (!isOpen) {
        menu.style.display = 'block';
      }
    });
  });

  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.contact-actions-menu') && !e.target.closest('.contact-actions')) {
      document.querySelectorAll('.actions-dropdown, .three-dots-menu').forEach(m => m.style.display = 'none');
    }
  });

  // Action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = e.currentTarget.dataset.action;
      const id = e.currentTarget.dataset.id;

      // Close menu
      document.querySelectorAll('.actions-dropdown, .three-dots-menu').forEach(m => m.style.display = 'none');

      if (action === 'edit-account') await handleEditAccount(id);
      else if (action === 'delete-account') await handleDeleteAccount(id);
      else if (action === 'edit-pm') await handleEditPaymentMethod(id);
      else if (action === 'delete-pm') await handleDeletePaymentMethod(id);
    });
  });
}

/**
 * Format date to readable format
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-CO', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

/**
 * Show account modal (create or edit)
 */
function showAccountModal(account = null) {
  const isEdit = !!account;
  const title = isEdit ? 'Editar cuenta' : 'Agregar cuenta';

  document.getElementById('account-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'account-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 420px;">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">${title}</h3>
      <div id="account-error" class="error-message" style="display: none;"></div>
      <form id="account-form" style="display: flex; flex-direction: column; gap: 16px;">
        <label class="field">
          <span>Tipo de cuenta *</span>
          <select id="account-type" required ${isEdit ? 'disabled' : ''}>
            <option value="">Selecciona un tipo</option>
            ${Object.entries(ACCOUNT_TYPES).map(([value, label]) => `
              <option value="${value}" ${account?.type === value ? 'selected' : ''}>
                ${label}
              </option>
            `).join('')}
          </select>
          ${isEdit ? '<small class="hint" style="color: #6b7280; font-size: 12px;">El tipo no se puede cambiar</small>' : ''}
        </label>

        <label class="field">
          <span>Nombre *</span>
          <input type="text" id="account-name" required maxlength="100" 
            value="${account?.name || ''}" 
            placeholder="ej: Cuenta de ahorros Bancolombia">
        </label>
        
        <label class="field">
          <span>Institución</span>
          <input type="text" id="account-institution" maxlength="100" 
            value="${account?.institution || ''}" 
            placeholder="ej: Bancolombia">
        </label>
        
        <label class="field">
          <span>Últimos 4 dígitos</span>
          <input type="text" id="account-last4" maxlength="4" pattern="\\d{4}"
            value="${account?.last4 || ''}" 
            placeholder="1234">
        </label>

        <label class="field">
          <span>Balance inicial</span>
          <input type="number" id="account-balance" step="0.01" min="0"
            value="${account?.initial_balance || 0}" 
            placeholder="0">
          <small class="hint" style="color: #6b7280; font-size: 12px;">El balance con que inicia la cuenta</small>
        </label>

        <label class="field">
          <span>Notas</span>
          <textarea id="account-notes" rows="2" maxlength="500" placeholder="Notas adicionales (opcional)">${account?.notes || ''}</textarea>
        </label>

        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
          <button type="button" class="btn-secondary" id="account-cancel">Cancelar</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Guardar' : 'Agregar'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);

  // Setup form handlers
  const form = document.getElementById('account-form');
  const cancelBtn = document.getElementById('account-cancel');
  const typeSelect = document.getElementById('account-type');
  const institutionInput = document.getElementById('account-institution');
  const nameInput = document.getElementById('account-name');
  const last4Input = document.getElementById('account-last4');

  // Auto-suggest account name based on type and institution
  function suggestName() {
    if (isEdit) return; // Don't auto-suggest when editing
    if (nameInput.value.trim() !== '') return;
    
    const type = typeSelect?.value;
    const institution = institutionInput?.value?.trim();

    if (type === 'savings' && institution) {
      nameInput.value = `Cuenta de ahorros ${institution}`;
    } else if (type === 'cash') {
      nameInput.value = 'Efectivo en Casa';
    } else if (type === 'checking' && institution) {
      nameInput.value = `Cuenta corriente ${institution}`;
    }
  }

  typeSelect?.addEventListener('change', suggestName);
  institutionInput?.addEventListener('blur', suggestName);
  
  // Last4 validation - only digits
  last4Input?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  });

  cancelBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('account-error');
    errorEl.style.display = 'none';

    const accountType = document.getElementById('account-type').value;
    const name = document.getElementById('account-name').value.trim();
    const institution = document.getElementById('account-institution').value.trim() || null;
    const last4 = document.getElementById('account-last4').value.trim() || null;
    const initialBalance = parseFloat(document.getElementById('account-balance').value) || 0;
    const notes = document.getElementById('account-notes').value.trim() || null;

    if (!name || !accountType) {
      errorEl.textContent = 'Por favor completa todos los campos requeridos';
      errorEl.style.display = 'block';
      return;
    }

    const payload = { name, institution, last4, initial_balance: initialBalance, notes };
    if (!isEdit) {
      payload.type = accountType;
      payload.owner_id = currentUser.id;
    }

    try {
      const url = isEdit ? `${API_URL}/accounts/${account.id}` : `${API_URL}/accounts`;
      const method = isEdit ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Error al guardar la cuenta');
      }

      modal.remove();
      showSuccess(isEdit ? 'Cuenta actualizada' : 'Cuenta creada', 'Los cambios se guardaron correctamente');
      await loadProfile();

    } catch (error) {
      console.error('Error saving account:', error);
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
    }
  });
}

/**
 * Show payment method modal (create or edit)
 */
function showPaymentMethodModal(paymentMethod = null) {
  const isEdit = !!paymentMethod;
  const title = isEdit ? 'Editar método de pago' : 'Agregar método de pago';

  document.getElementById('pm-modal')?.remove();

  // Get savings accounts for linking debit cards
  const savingsAccounts = accounts.filter(a => a.type === 'savings' || a.type === 'checking');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'pm-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 420px;">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">${title}</h3>
      <div id="pm-error" class="error-message" style="display: none;"></div>
      <form id="pm-form" style="display: flex; flex-direction: column; gap: 16px;">
        <label class="field">
          <span>Nombre *</span>
          <input type="text" id="pm-name" required maxlength="100" 
            value="${paymentMethod?.name || ''}" 
            placeholder="ej: Tarjeta Débito Bancolombia">
        </label>
        
        <label class="field">
          <span>Tipo *</span>
          <select id="pm-type" required ${isEdit ? 'disabled' : ''}>
            <option value="">Selecciona un tipo</option>
            ${Object.entries(PAYMENT_METHOD_TYPES).map(([value, label]) => `
              <option value="${value}" ${paymentMethod?.type === value ? 'selected' : ''}>
                ${label}
              </option>
            `).join('')}
          </select>
          ${isEdit ? '<small class="hint" style="color: #6b7280; font-size: 12px;">El tipo no se puede cambiar</small>' : ''}
        </label>
        
        <label class="field">
          <span>Institución</span>
          <input type="text" id="pm-institution" maxlength="100" 
            value="${paymentMethod?.institution || ''}" 
            placeholder="ej: Bancolombia, Nequi">
        </label>
        
        <label class="field">
          <span>Últimos 4 dígitos</span>
          <input type="text" id="pm-last4" maxlength="4" pattern="\\d{4}"
            value="${paymentMethod?.last4 || ''}" 
            placeholder="1234">
        </label>

        <div id="pm-account-field" style="${paymentMethod?.type === 'debit_card' || !isEdit ? '' : 'display: none;'}">
          <label class="field">
            <span>Cuenta asociada</span>
            <select id="pm-account">
              <option value="">Sin cuenta asociada</option>
              ${savingsAccounts.map(a => `
                <option value="${a.id}" ${paymentMethod?.account_id === a.id ? 'selected' : ''}>
                  ${a.name}
                </option>
              `).join('')}
            </select>
            <small class="hint" style="color: #6b7280; font-size: 12px;">Los gastos con esta tarjeta se descontarán del balance de la cuenta</small>
          </label>
        </div>
        
        <label class="field">
          <span>Notas</span>
          <textarea id="pm-notes" rows="2" placeholder="Notas adicionales (opcional)">${paymentMethod?.notes || ''}</textarea>
        </label>
        
        <div class="field">
          <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="pm-shared" ${paymentMethod?.is_shared_with_household ? 'checked' : ''}>
            <span>Compartir con el hogar</span>
          </label>
        </div>
        
        ${isEdit ? `
          <div class="field">
            <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="pm-active" ${paymentMethod?.is_active !== false ? 'checked' : ''}>
              <span>Activo (disponible para registrar movimientos)</span>
            </label>
          </div>
        ` : ''}
        
        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
          <button type="button" class="btn-secondary" id="pm-cancel">Cancelar</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Guardar' : 'Agregar'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);

  // Setup form handlers
  const form = document.getElementById('pm-form');
  const cancelBtn = document.getElementById('pm-cancel');
  const typeSelect = document.getElementById('pm-type');
  const accountField = document.getElementById('pm-account-field');
  const last4Input = document.getElementById('pm-last4');

  // Show/hide account field based on type
  typeSelect?.addEventListener('change', (e) => {
    if (e.target.value === 'debit_card') {
      accountField.style.display = '';
    } else {
      accountField.style.display = 'none';
      document.getElementById('pm-account').value = '';
    }
  });
  
  // Last4 validation - only digits
  last4Input?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  });

  cancelBtn.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('pm-error');
    errorEl.style.display = 'none';

    const name = document.getElementById('pm-name').value.trim();
    const type = document.getElementById('pm-type').value;
    const institution = document.getElementById('pm-institution').value.trim() || null;
    const last4 = document.getElementById('pm-last4').value.trim() || null;
    const notes = document.getElementById('pm-notes').value.trim() || null;
    const isShared = document.getElementById('pm-shared').checked;
    const isActive = document.getElementById('pm-active')?.checked;
    const accountId = document.getElementById('pm-account').value || null;

    if (!name || !type) {
      errorEl.textContent = 'Por favor completa los campos requeridos';
      errorEl.style.display = 'block';
      return;
    }

    if (last4 && last4.length !== 4) {
      errorEl.textContent = 'Los últimos 4 dígitos deben ser exactamente 4 números';
      errorEl.style.display = 'block';
      return;
    }

    const data = {
      name,
      is_shared_with_household: isShared,
      last4,
      institution,
      notes,
      account_id: type === 'debit_card' ? accountId : null
    };

    if (isEdit) {
      data.is_active = isActive;
    } else {
      data.type = type;
    }

    try {
      const url = isEdit ? `${API_URL}/payment-methods/${paymentMethod.id}` : `${API_URL}/payment-methods`;
      const method = isEdit ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al guardar');
      }

      modal.remove();
      showSuccess(
        isEdit ? 'Método de pago actualizado' : 'Método de pago creado',
        'Los cambios se guardaron correctamente'
      );
      await loadProfile();

    } catch (error) {
      console.error('Error saving payment method:', error);
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
    }
  });
}

/**
 * Handle edit account
 */
async function handleEditAccount(id) {
  const account = accounts.find(a => a.id === id);
  if (!account) return;
  showAccountModal(account);
}

/**
 * Handle delete account
 */
async function handleDeleteAccount(id) {
  const account = accounts.find(a => a.id === id);
  if (!account) return;

  const confirmed = await showConfirmation(
    '¿Eliminar cuenta?',
    `¿Estás seguro de que quieres eliminar la cuenta "${account.name}"? Esta acción no se puede deshacer.`
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${API_URL}/accounts/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      
      // Handle specific error about income entries
      if (errorData?.error?.includes('income entries')) {
        showError(
          'No se puede eliminar esta cuenta porque tiene ingresos registrados. ' +
          'Para eliminarla, primero debes eliminar todos los ingresos asociados desde la página de inicio.'
        );
        return;
      }
      
      throw new Error(errorData?.error || 'Error al eliminar la cuenta');
    }

    showSuccess('Cuenta eliminada', 'La cuenta se eliminó correctamente');
    await loadProfile();

  } catch (error) {
    console.error('Error deleting account:', error);
    showError('Error al eliminar la cuenta', error.message);
  }
}

/**
 * Handle edit payment method
 */
async function handleEditPaymentMethod(id) {
  const pm = paymentMethods.find(p => p.id === id);
  if (!pm) return;
  showPaymentMethodModal(pm);
}

/**
 * Handle delete payment method
 */
async function handleDeletePaymentMethod(id) {
  const pm = paymentMethods.find(p => p.id === id);
  if (!pm) return;
  
  const confirmed = await showConfirmation(
    '¿Eliminar método de pago?',
    `¿Estás seguro de que deseas eliminar "${pm.name}"? Esta acción no se puede deshacer.`
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_URL}/payment-methods/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Error al eliminar');
    }
    
    showSuccess('Método de pago eliminado', 'El método de pago ha sido eliminado correctamente.');
    await loadProfile();
    
  } catch (error) {
    console.error('Error deleting payment method:', error);
    showError('Error al eliminar el método de pago');
  }
}
