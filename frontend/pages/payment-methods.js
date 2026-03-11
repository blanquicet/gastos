/**
 * Payment Methods Page
 * 
 * Manage payment methods (credit cards, bank accounts, cash, etc.)
 * - List all payment methods (own + shared)
 * - Create new payment methods
 * - Edit existing payment methods
 * - Delete payment methods
 * - Toggle sharing with household
 */

import { API_URL } from '../config.js';
import router from '../router.js';
import * as Navbar from '../components/navbar.js';
import { showConfirmation, showSuccess, showError } from '../utils.js';

let currentUser = null;
let paymentMethods = [];
let editingPaymentMethod = null;

// Payment method type labels in Spanish
const PAYMENT_METHOD_TYPES = {
  credit_card: 'Tarjeta de Crédito',
  debit_card: 'Tarjeta de Débito',
  cash: 'Efectivo',
  other: 'Otro'
};

/**
 * Render payment methods page
 */
export function render(user) {
  currentUser = user;
  
  return `
    <main class="card">
      <header class="header">
        <a href="/perfil" class="back-link" id="back-to-profile">
          ← Volver al perfil
        </a>
        <div class="header-row">
          <h1>Métodos de Pago</h1>
          ${Navbar.render(user, '/metodos-pago')}
        </div>
        <p class="subtitle">Administra tus tarjetas, cuentas bancarias y otros métodos de pago.</p>
      </header>

      <div id="payment-methods-content">
        <div class="loading-section">
          <div class="spinner-small"></div>
          <p>Cargando métodos de pago...</p>
        </div>
      </div>
    </main>
  `;
}

/**
 * Setup payment methods page
 */
export async function setup() {
  Navbar.setup();
  
  // Setup back link
  const backLink = document.getElementById('back-to-profile');
  backLink?.addEventListener('click', (e) => {
    e.preventDefault();
    router.navigate('/perfil');
  });
  
  await loadPaymentMethods();
}

/**
 * Load payment methods from API
 */
async function loadPaymentMethods() {
  const contentEl = document.getElementById('payment-methods-content');
  
  try {
    const response = await fetch(`${API_URL}/payment-methods?own_only=true`, {
      credentials: 'include'
    });

    if (response.status === 404) {
      // User has no household
      contentEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏠</div>
          <h3>Necesitas un hogar primero</h3>
          <p>Para gestionar métodos de pago, primero debes crear o unirte a un hogar.</p>
          <button id="go-to-profile-btn" class="btn-primary">Ir a mi perfil</button>
        </div>
      `;
      document.getElementById('go-to-profile-btn')?.addEventListener('click', () => {
        router.navigate('/perfil');
      });
      return;
    }

    if (!response.ok) {
      throw new Error('Error al cargar métodos de pago');
    }

    paymentMethods = await response.json();

    // Render content
    contentEl.innerHTML = renderPaymentMethodsContent();
    setupEventHandlers();

  } catch (error) {
    console.error('Error loading payment methods:', error);
    contentEl.innerHTML = `
      <div class="error-box">
        <p>Error al cargar tus métodos de pago. Por favor, intenta de nuevo.</p>
        <button id="retry-btn" class="btn-secondary">Reintentar</button>
      </div>
    `;
    
    document.getElementById('retry-btn')?.addEventListener('click', loadPaymentMethods);
  }
}

/**
 * Render payment methods content
 */
function renderPaymentMethodsContent() {
  return `
    <div class="household-section">
      <div class="section-header">
        <h3 class="section-title">Mis Métodos de Pago (${paymentMethods.length})</h3>
        <button id="add-payment-method-btn" class="btn-secondary btn-small">+ Agregar método</button>
      </div>
      <p class="section-description">
        Agrega tus tarjetas, cuentas bancarias y otros métodos de pago. 
        Puedes marcarlos como compartidos para que todos los miembros del hogar puedan usarlos.
      </p>
      
      <div id="payment-method-form-container" style="display: none;">
        ${renderPaymentMethodForm()}
      </div>
      
      ${renderPaymentMethodsList()}
    </div>
  `;
}

/**
 * Render payment methods list
 */
function renderPaymentMethodsList() {
  if (paymentMethods.length === 0) {
    return `
      <div class="empty-state">
        <p>No tienes métodos de pago registrados todavía.</p>
        <p class="hint">Agrega tu primer método de pago para comenzar a registrar movimientos.</p>
      </div>
    `;
  }

  return `
    <div class="contacts-list">
      ${paymentMethods.map(pm => `
        <div class="contact-item">
          <div class="contact-avatar">${getPaymentMethodIcon(pm.type)}</div>
          <div class="contact-info">
            <div class="contact-name">
              ${pm.name}
              ${!pm.is_active ? '<span class="inactive-badge">❌ Inactivo</span>' : ''}
            </div>
            ${pm.last4 ? `<div class="contact-details">••• ${pm.last4}</div>` : ''}
            <div class="contact-details">${PAYMENT_METHOD_TYPES[pm.type] || pm.type}</div>
            ${pm.institution ? `<div class="contact-details">${pm.institution}</div>` : ''}
          </div>
          ${pm.is_shared_with_household ? '<div class="member-role role-owner" title="Compartido">C</div>' : ''}
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
  `;
}

/**
 * Get icon for payment method type
 */
function getPaymentMethodIcon(type) {
  const icons = {
    credit_card: '💳',
    debit_card: '💳',
    bank_account: '🏦',
    cash: '💵',
    digital_wallet: '📱',
    other: '💰'
  };
  return icons[type] || '💰';
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
 * Setup event handlers
 */
function setupEventHandlers() {
  // Add payment method button
  const addBtn = document.getElementById('add-payment-method-btn');
  addBtn?.addEventListener('click', () => {
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

  // Menu toggle buttons
  document.querySelectorAll('[data-menu-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const menuId = e.currentTarget.dataset.menuId;
      const menu = document.getElementById(`menu-${menuId}`);
      const isOpen = menu.style.display === 'block';
      
      // Close all menus
      document.querySelectorAll('.actions-dropdown').forEach(m => m.style.display = 'none');
      
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

  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.contact-actions-menu')) {
      document.querySelectorAll('.actions-dropdown').forEach(m => m.style.display = 'none');
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
      document.querySelectorAll('.actions-dropdown').forEach(m => m.style.display = 'none');

      if (action === 'edit') await handleEdit(id);
      else if (action === 'delete') await handleDelete(id);
    });
  });
}

/**
 * Setup form handlers
 */
function setupFormHandlers() {
  const form = document.getElementById('payment-method-form');
  const cancelBtn = document.getElementById('cancel-pm-btn');
  
  form?.addEventListener('submit', handleSubmit);
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
async function handleSubmit(e) {
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
    await loadPaymentMethods();
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
async function handleEdit(id) {
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
async function handleDelete(id) {
  const pm = paymentMethods.find(p => p.id === id);
  if (!pm) return;
  
  const confirmed = await showConfirmation(
    '¿Eliminar método de pago?',
    `¿Estás seguro de que deseas eliminar "${pm.name}"? No aparecerá más como opción al registrar movimientos.`
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_URL}/payment-methods/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Solo el dueño del método de pago puede eliminarlo.');
      } else if (response.status === 404) {
        throw new Error('El método de pago no fue encontrado. Es posible que ya haya sido eliminado.');
      }
      const body = await response.text().catch(() => '');
      throw new Error(body || 'Ocurrió un error inesperado al eliminar el método de pago.');
    }
    
    showSuccess('Método de pago eliminado', `"${pm.name}" ya no aparecerá como opción.`);
    await loadPaymentMethods();
    
  } catch (error) {
    console.error('Error deleting payment method:', error);
    showError(error.message);
  }
}
