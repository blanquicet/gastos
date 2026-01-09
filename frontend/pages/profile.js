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
import { showConfirmation, showSuccess, showError } from '../utils.js';

let currentUser = null;
let currentHousehold = null;
let accounts = [];
let paymentMethods = [];
let editingAccount = null;
let editingPaymentMethod = null;

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
      <div class="empty-state">
        <p class="empty-state-text">No tienes cuentas registradas</p>
        <button id="add-account-btn" class="btn-secondary" style="margin-top: 16px;">Agregar cuenta</button>
      </div>
    `;
  }

  const emptyState = accounts.length === 0 ? `
    <div class="empty-state">
      <p class="empty-state-text">No tienes cuentas registradas</p>
      <button id="add-account-btn" class="btn-secondary" style="margin-top: 16px;">Agregar cuenta</button>
    </div>
  ` : '';

  const accountList = accounts.length > 0 ? `
    <div class="contact-list">
      ${accounts.map(account => `
        <div class="contact-item">
          <div class="contact-avatar">${getAccountIcon(account.type)}</div>
          <div class="contact-info">
            <div class="contact-name">${account.name}</div>
            ${account.institution ? `<div class="contact-details">${account.institution}${account.last4 ? ` • ••• ${account.last4}` : ''}</div>` : ''}
            ${account.current_balance !== undefined ? `<div class="contact-details">Balance: ${formatCurrency(account.current_balance)}</div>` : ''}
          </div>
          <div class="contact-actions">
            <button class="three-dots-btn" data-account-id="${account.id}">⋮</button>
            <div class="three-dots-menu" id="account-menu-${account.id}">
              <button class="menu-item" data-action="edit" data-id="${account.id}">Editar</button>
              <button class="menu-item" data-action="delete" data-id="${account.id}">Eliminar</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  return `
    ${emptyState}
    ${accountList}
    <div id="account-form-container" style="display: none;">
      ${renderAccountForm()}
    </div>
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

  const paymentList = paymentMethods.length > 0 ? `
    <div class="contacts-list">
      ${paymentMethods.map(pm => `
        <div class="contact-item">
          <div class="contact-avatar">${getPaymentMethodIcon(pm.type)}</div>
          <div class="contact-info">
            <div class="contact-name">${pm.name}</div>
            ${pm.last4 ? `<div class="contact-details">••• ${pm.last4}</div>` : ''}
            <div class="contact-details">${PAYMENT_METHOD_TYPES[pm.type] || pm.type}</div>
            ${pm.institution ? `<div class="contact-details">${pm.institution}</div>` : ''}
          </div>
          <div class="contact-badges">
            ${pm.is_shared_with_household ? '<span class="member-role role-owner" title="Compartido con el hogar">Compartido</span>' : ''}
            ${!pm.is_active ? '<span class="inactive-badge">Inactivo</span>' : ''}
          </div>
          <div class="contact-actions-menu">
            <button class="btn-menu" data-menu-id="${pm.id}">⋮</button>
            <div class="actions-dropdown" id="menu-${pm.id}" style="display: none;">
              <button class="dropdown-item" data-action="edit" data-id="${pm.id}">Editar</button>
              <button class="dropdown-item text-danger" data-action="delete" data-id="${pm.id}">Eliminar</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  return `
    <div id="payment-method-form-container" style="display: none;">
      ${renderPaymentMethodForm()}
    </div>
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
    createBtn.addEventListener('click', () => {
      router.navigate('/hogar/crear');
    });
  }

  if (viewBtn) {
    viewBtn.addEventListener('click', () => {
      router.navigate('/hogar');
    });
  }

  if (addAccountBtn) {
    addAccountBtn.addEventListener('click', () => {
      editingAccount = null;
      const container = document.getElementById('account-form-container');
      if (container.style.display === 'block') {
        container.style.display = 'none';
      } else {
        container.innerHTML = renderAccountForm();
        container.style.display = 'block';
        setupAccountFormHandlers();
      }
    });
  }

  if (addPaymentMethodBtn) {
    addPaymentMethodBtn.addEventListener('click', () => {
      editingPaymentMethod = null;
      const container = document.getElementById('payment-method-form-container');
      if (container.style.display === 'block') {
        container.style.display = 'none';
      } else {
        container.innerHTML = renderPaymentMethodForm();
        container.style.display = 'block';
        setupFormHandlers();
      }
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

      // Check if it's in a three-dots-menu (account) or not (payment method)
      const isAccount = e.currentTarget.closest('.three-dots-menu');
      
      if (isAccount) {
        if (action === 'edit') await handleEditAccount(id);
        else if (action === 'delete') await handleDeleteAccount(id);
      } else {
        if (action === 'edit') await handleEditPaymentMethod(id);
        else if (action === 'delete') await handleDeletePaymentMethod(id);
      }
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
 * Render account form (create or edit)
 */
function renderAccountForm(account = null) {
  const isEdit = account !== null;
  
  return `
    <div class="form-card">
      <h4>${isEdit ? 'Editar cuenta' : 'Agregar cuenta'}</h4>
      <form id="account-form" class="grid">
        <label class="field col-span-2">
          <span>Tipo de cuenta *</span>
          <select id="account-type" required ${isEdit ? 'disabled' : ''}>
            <option value="">Selecciona un tipo</option>
            ${Object.entries(ACCOUNT_TYPES).map(([value, label]) => `
              <option value="${value}" ${account?.type === value ? 'selected' : ''}>
                ${label}
              </option>
            `).join('')}
          </select>
          ${isEdit ? '<small class="hint">El tipo no se puede cambiar después de crear la cuenta</small>' : ''}
        </label>

        <label class="field col-span-2">
          <span>Nombre *</span>
          <input type="text" id="account-name" required maxlength="100" 
            value="${account?.name || ''}" 
            placeholder="ej: Cuenta de ahorros Bancolombia" />
        </label>
        
        <div class="field-row col-span-2">
          <label class="field">
            <span>Institución</span>
            <input type="text" id="account-institution" maxlength="100" 
              value="${account?.institution || ''}" 
              placeholder="ej: Bancolombia (opcional)" />
          </label>
          
          <label class="field">
            <span>Últimos 4 dígitos</span>
            <input type="text" id="account-last4" maxlength="4" pattern="\\d{4}"
              value="${account?.last4 || ''}" 
              placeholder="1234 (opcional)" />
          </label>
        </div>

        <label class="field col-span-2">
          <span>Balance inicial</span>
          <input type="number" id="account-balance" step="0.01" min="0"
            value="${account?.initial_balance || 0}" 
            placeholder="0 (opcional)" />
          <small class="hint">El balance con que inicia la cuenta</small>
        </label>

        <label class="field col-span-2">
          <span>Notas</span>
          <textarea id="account-notes" rows="2" maxlength="500" placeholder="Notas adicionales (opcional)">${account?.notes || ''}</textarea>
        </label>

        <div class="field-row col-span-2">
          <button type="button" id="cancel-account-btn" class="btn-secondary">Cancelar</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Actualizar' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  `;
}

/**
 * Render payment method form (create or edit)
 */
function renderPaymentMethodForm(paymentMethod = null) {
  const isEdit = paymentMethod !== null;
  
  return `
    <div class="form-card">
      <h4>${isEdit ? 'Editar método de pago' : 'Agregar método de pago'}</h4>
      <form id="payment-method-form" class="grid">
        <div class="field-row col-span-2">
          <label class="field">
            <span>Nombre *</span>
            <input type="text" id="pm-name" required maxlength="100" 
              value="${paymentMethod?.name || ''}" 
              placeholder="ej: Tarjeta Débito Bancolombia" />
          </label>
          
          <label class="field">
            <span>Tipo *</span>
            <select id="pm-type" required>
              <option value="">Selecciona un tipo</option>
              ${Object.entries(PAYMENT_METHOD_TYPES).map(([value, label]) => `
                <option value="${value}" ${paymentMethod?.type === value ? 'selected' : ''}>
                  ${label}
                </option>
              `).join('')}
            </select>
          </label>
        </div>
        
        <div class="field-row col-span-2">
          <label class="field">
            <span>Institución</span>
            <input type="text" id="pm-institution" maxlength="100" 
              value="${paymentMethod?.institution || ''}" 
              placeholder="ej: Bancolombia, Nequi (opcional)" />
          </label>
          
          <label class="field">
            <span>Últimos 4 dígitos</span>
            <input type="text" id="pm-last4" maxlength="4" pattern="\\d{4}"
              value="${paymentMethod?.last4 || ''}" 
              placeholder="ej: 1234 (opcional)" />
            <small class="hint">Solo números, 4 dígitos</small>
          </label>
        </div>
        
        <label class="field col-span-2">
          <span>Notas</span>
          <textarea id="pm-notes" rows="2" placeholder="Notas adicionales (opcional)">${paymentMethod?.notes || ''}</textarea>
        </label>
        
        <div class="field col-span-2">
          <label class="checkbox-label">
            <input type="checkbox" id="pm-shared" ${paymentMethod?.is_shared_with_household ? 'checked' : ''} />
            <span>Compartir con el hogar (todos los miembros pueden usar este método)</span>
          </label>
        </div>
        
        ${isEdit ? `
          <div class="field col-span-2">
            <label class="checkbox-label">
              <input type="checkbox" id="pm-active" ${paymentMethod?.is_active !== false ? 'checked' : ''} />
              <span>Activo (disponible para registrar movimientos)</span>
            </label>
          </div>
        ` : ''}
        
        <div class="form-actions col-span-2">
          <button type="submit" class="btn-primary">${isEdit ? 'Guardar cambios' : 'Agregar'}</button>
          <button type="button" id="cancel-pm-btn" class="btn-secondary">Cancelar</button>
        </div>
      </form>
    </div>
  `;
}

/**
 * Setup form handlers
 */
/**
 * Setup account form handlers
 */
function setupAccountFormHandlers() {
  const form = document.getElementById('account-form');
  const cancelBtn = document.getElementById('cancel-account-btn');

  form?.addEventListener('submit', handleSubmitAccount);
  cancelBtn?.addEventListener('click', () => {
    document.getElementById('account-form-container').style.display = 'none';
    editingAccount = null;
  });

  // Auto-suggest account name based on type and institution
  const typeSelect = document.getElementById('account-type');
  const institutionInput = document.getElementById('account-institution');
  const nameInput = document.getElementById('account-name');

  function suggestName() {
    if (editingAccount) return; // Don't auto-suggest when editing
    
    // Only auto-suggest if name field is empty
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
}

/**
 * Handle account form submission
 */
async function handleSubmitAccount(e) {
  e.preventDefault();

  const accountType = document.getElementById('account-type').value;
  const name = document.getElementById('account-name').value.trim();
  const institution = document.getElementById('account-institution').value.trim() || null;
  const last4 = document.getElementById('account-last4').value.trim() || null;
  const initialBalance = parseFloat(document.getElementById('account-balance').value) || 0;
  const notes = document.getElementById('account-notes').value.trim() || null;

  if (!name || !accountType) {
    showError('Por favor completa todos los campos requeridos');
    return;
  }

  const payload = {
    name,
    institution,
    last4,
    initial_balance: initialBalance,
    notes
  };

  // Only include type and owner_id when creating (not editing)
  if (!editingAccount) {
    payload.type = accountType;
    payload.owner_id = currentUser.id;
  }

  try {
    const url = editingAccount 
      ? `${API_URL}/accounts/${editingAccount.id}`
      : `${API_URL}/accounts`;

    const method = editingAccount ? 'PATCH' : 'POST';

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

    showSuccess(
      editingAccount ? 'Cuenta actualizada' : 'Cuenta creada',
      editingAccount ? 'La cuenta se actualizó correctamente' : 'La cuenta se creó correctamente'
    );

    document.getElementById('account-form-container').style.display = 'none';
    editingAccount = null;
    await loadProfile();

  } catch (error) {
    console.error('Error saving account:', error);
    showError('Error al guardar la cuenta', error.message);
  }
}

/**
 * Handle edit account
 */
async function handleEditAccount(id) {
  const account = accounts.find(a => a.id === id);
  if (!account) return;

  editingAccount = account;
  const container = document.getElementById('account-form-container');
  container.innerHTML = renderAccountForm(account);
  container.style.display = 'block';
  setupAccountFormHandlers();
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

function setupFormHandlers() {
  const form = document.getElementById('payment-method-form');
  const cancelBtn = document.getElementById('cancel-pm-btn');
  
  form?.addEventListener('submit', handleSubmitPaymentMethod);
  cancelBtn?.addEventListener('click', () => {
    document.getElementById('payment-method-form-container').style.display = 'none';
    editingPaymentMethod = null;
  });
  
  // Last4 validation - only digits
  const last4Input = document.getElementById('pm-last4');
  last4Input?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  });
}

/**
 * Handle form submit
 */
async function handleSubmitPaymentMethod(e) {
  e.preventDefault();
  
  const name = document.getElementById('pm-name').value.trim();
  const type = document.getElementById('pm-type').value;
  const institution = document.getElementById('pm-institution').value.trim();
  const last4 = document.getElementById('pm-last4').value.trim();
  const notes = document.getElementById('pm-notes').value.trim();
  const isShared = document.getElementById('pm-shared').checked;
  const isActive = document.getElementById('pm-active')?.checked;
  
  if (!name || !type) {
    showError('Por favor completa los campos requeridos');
    return;
  }
  
  if (last4 && last4.length !== 4) {
    showError('Los últimos 4 dígitos deben ser exactamente 4 números');
    return;
  }
  
  const data = {
    name,
    is_shared_with_household: isShared,
    last4: last4 || null,
    institution: institution || null,
    notes: notes || null
  };
  
  if (editingPaymentMethod) {
    data.is_active = isActive;
  } else {
    // Type is only sent when creating a new payment method
    data.type = type;
  }
  
  try {
    const url = editingPaymentMethod 
      ? `${API_URL}/payment-methods/${editingPaymentMethod.id}`
      : `${API_URL}/payment-methods`;
    
    const method = editingPaymentMethod ? 'PATCH' : 'POST';
    
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
    
    showSuccess(
      editingPaymentMethod ? 'Método de pago actualizado' : 'Método de pago creado',
      'Tus cambios han sido guardados correctamente.'
    );
    await loadProfile();
    document.getElementById('payment-method-form-container').style.display = 'none';
    editingPaymentMethod = null;
    
  } catch (error) {
    console.error('Error saving payment method:', error);
    showError(error.message);
  }
}

/**
 * Handle edit payment method
 */
async function handleEditPaymentMethod(id) {
  const pm = paymentMethods.find(p => p.id === id);
  if (!pm) return;
  
  editingPaymentMethod = pm;
  const container = document.getElementById('payment-method-form-container');
  container.innerHTML = renderPaymentMethodForm(pm);
  container.style.display = 'block';
  setupFormHandlers();
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
