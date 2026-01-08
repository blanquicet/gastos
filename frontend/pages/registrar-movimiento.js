/**
 * Registrar Movimiento Page
 *
 * Handles movement registration form with all business logic:
 * - HOUSEHOLD, SPLIT, DEBT_PAYMENT types
 * - Dynamic form fields based on type
 * - Payment methods, categories, participants loaded from API
 */

import { logout, getMovementsApiUrl } from '../auth-utils.js';
import { API_URL } from '../config.js';
import router from '../router.js';
import * as Navbar from '../components/navbar.js';

// Configuration loaded from API
let users = [];
let usersMap = {}; // Map of name -> user object
let primaryUsers = [];
let paymentMethods = []; // Full payment method objects with owner_id and is_shared
let paymentMethodsMap = {}; // Map of name -> payment method object
let categories = [];
let accounts = []; // Accounts for income registration
let formConfigLoaded = false;

let participants = []; // [{ name, pct }]
let currentUser = null;
let currentEditMovement = null; // Movement being edited (if in edit mode)

/**
 * Helper: Format number with Spanish/Colombian format (e.g., 71.033,90)
 */
function formatNumber(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Helper: Parse number from Spanish formatted string (remove dots, replace comma with dot)
 */
function parseNumber(str) {
  const cleaned = String(str).replace(/\./g, '').replace(/,/g, '.');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Helper: Convert number to editable Spanish format (use comma for decimals, no thousands separator)
 */
function toEditableNumber(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

/**
 * Helper: get today's date as YYYY-MM-DD in local timezone
 */
function getTodayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Render registrar movimiento page
 */
export function render(user) {
  currentUser = user;

  // Check if we're in edit mode or have tipo pre-selection
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('edit');
  const tipoParam = urlParams.get('tipo');
  
  // If editing or pre-selecting tipo, show loading state immediately
  if (editId || tipoParam) {
    const title = editId ? 'Editar Movimiento' : 'Registrar movimiento';
    const message = editId ? 'Cargando movimiento...' : 'Cargando formulario...';
    
    return `
      <main class="card">
        <header class="header">
          <div class="header-row">
            <h1 id="pageTitle">${title}</h1>
            ${Navbar.render(user, '/registrar-movimiento')}
          </div>
          <p class="subtitle">Registra ingresos, gastos o préstamos</p>
        </header>

        <div id="fullScreenLoading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; gap: 16px;">
          <div class="spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
          <p style="color: #6b7280; font-size: 16px;">${message}</p>
        </div>

        <form id="movForm" novalidate style="display: none;">
        <div class="grid">
          <div class="field col-span-2">
            <span>¿Qué deseas registrar?</span>
            <div class="tipo-selector">
              <button type="button" class="tipo-btn" data-tipo="HOUSEHOLD">
                <div class="tipo-icon">🏠</div>
                <div class="tipo-label">Gasto del hogar</div>
              </button>
              <button type="button" class="tipo-btn" data-tipo="SPLIT">
                <div class="tipo-icon split-icon">⇄</div>
                <div class="tipo-label">Dividir gasto</div>
              </button>
              <button type="button" class="tipo-btn" data-tipo="DEBT_PAYMENT">
                <div class="tipo-icon">💸</div>
                <div class="tipo-label">Pago de deuda</div>
              </button>
              <button type="button" class="tipo-btn" data-tipo="INGRESO">
                <div class="tipo-icon">💰</div>
                <div class="tipo-label">Ingreso</div>
              </button>
            </div>
            <input type="hidden" name="tipo" id="tipo" required />
            
          </div>

          <label class="field">
            <span>Fecha</span>
            <input name="fecha" id="fecha" type="date" value="${getTodayLocal()}" required />
            
          </label>

          <label class="field col-span-2">
            <span>Nota</span>
            <input name="descripcion" id="descripcion" type="text" placeholder="Ej: Almuerzo, Uber a casa, Guaritos…" required />
            
          </label>

          <label class="field col-span-2 hidden" id="categoriaWrap">
            <span>Categoría</span>
            <select name="categoria" id="categoria" required>
              <option value="" selected disabled>Seleccionar</option>
            </select>
            
          </label>

          <label class="field col-span-2">
            <span>Monto total</span>
            <div class="input-wrapper" id="valorWrapper" style="display: flex; align-items: center; border: 1px solid #e5e7eb; border-radius: 12px; padding: 0; background-color: white;">
              <span style="color: #9ca3af; padding-left: 14px; padding-right: 4px; user-select: none; font-size: 14px; flex-shrink: 0; font-weight: 500;">COP</span>
              <input name="valor" id="valor" type="text" inputmode="decimal" placeholder="0" required style="border: none; outline: none; flex: 1; padding: 12px 14px 12px 2px; background-color: transparent; text-align: right; min-width: 0;" />
            </div>
            
          </label>

          <!-- Income-specific fields -->
          <label class="field hidden" id="ingresoMiembroWrap">
            <span>Quien recibe</span>
            <select name="ingresoMiembro" id="ingresoMiembro">
              <option value="" selected>Seleccionar</option>
            </select>
            <small class="hint">Solo miembros del hogar</small>
          </label>

          <label class="field col-span-2 hidden" id="ingresoTipoWrap">
            <span>Tipo de Ingreso</span>
            <select name="ingresoTipo" id="ingresoTipo">
              <option value="" selected disabled>Seleccionar</option>
              <optgroup label="INGRESO REAL">
                <option value="salary">Sueldo</option>
                <option value="bonus">Bono / Prima</option>
                <option value="reimbursement">Reembolso de Gastos</option>
                <option value="other_income">Otro Ingreso</option>
              </optgroup>
              <optgroup label="MOVIMIENTO INTERNO">
                <option value="savings_withdrawal">Retiro de Ahorros</option>
                <option value="previous_balance">Sobrante Mes Anterior</option>
                <option value="adjustment">Ajuste Contable</option>
              </optgroup>
            </select>
            
          </label>

          <label class="field col-span-2 hidden" id="ingresoCuentaWrap">
            <span>Cuenta destino</span>
            <select name="ingresoCuenta" id="ingresoCuenta">
              <option value="" selected>Seleccionar</option>
            </select>
            <small class="hint">Solo cuentas tipo savings o cash</small>
          </label>

          <!-- Pagador y Tomador en fila (para DEBT_PAYMENT) -->
          <div class="field-row col-span-2 hidden" id="pagadorTomadorRow">
            <label class="field">
              <span id="pagadorLabel">¿Quién pagó?</span>
              <select name="pagador" id="pagador"></select>
            </label>
            <label class="field">
              <span>¿Quién recibió?</span>
              <select name="tomador" id="tomador"></select>
            </label>
          </div>

          <!-- Pagador solo (para SPLIT) -->
          <label class="field hidden" id="pagadorWrap">
            <span>¿Quién pagó?</span>
            <select name="pagadorCompartido" id="pagadorCompartido"></select>
            
          </label>

          <!-- Método de pago -->
          <div class="field col-span-2 hidden" id="metodoWrap">
            <span>Método de pago</span>
            <select name="metodo" id="metodo">
              <option value="" selected>Seleccionar</option>
            </select>
          </div>

          <!-- Participantes: solo para SPLIT -->
          <section class="section col-span-2 hidden" id="participantesWrap">
            <div class="sectionHeader">
              <h2>Participantes</h2>
              <div style="display: flex; gap: 16px;">
                <label class="checkbox">
                  <input type="checkbox" id="equitable" checked />
                  <span>Dividir equitativamente</span>
                </label>
                <label class="checkbox">
                  <input type="checkbox" id="showAsValue" />
                  <span>Mostrar como valor</span>
                </label>
              </div>
            </div>

            <div id="participantsList" class="participantsList"></div>

            <div class="actionsRow">
              <button type="button" class="secondary" id="addParticipantBtn">Agregar participante</button>
            </div>

            <p class="note">
              Si no es equitativo, puedes editar los porcentajes. La suma debe ser 100%.
            </p>
          </section>
        </div>

        <div class="footer">
          <div class="footer-buttons">
            <button type="button" id="cancelBtn" class="secondary hidden">Cancelar</button>
            <button type="submit" id="submitBtn">Registrar</button>
          </div>
          <p id="status" class="status" role="status" aria-live="polite"></p>
        </div>
      </form>
    </main>
  `;
  }
  
  // Normal render without loading (when navigating directly without params)
  return `
    <main class="card">
      <header class="header">
        <div class="header-row">
          <h1 id="pageTitle">Registrar movimiento</h1>
          ${Navbar.render(user, '/registrar-movimiento')}
        </div>
        <p class="subtitle">Registra ingresos, gastos o préstamos</p>
      </header>

      <form id="movForm" novalidate>

/**
 * Load form configuration from API
 */
async function loadFormConfig() {
  // Note: formConfigLoaded is reset in setup() to ensure fresh data on each page visit
  if (formConfigLoaded) return;
  
  try {
    const response = await fetch(`${API_URL}/movement-form-config`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Error loading form configuration');
    }
    
    const config = await response.json();
    
    // Process users: create map and lists
    users = config.users.map(u => u.name);
    usersMap = {};
    config.users.forEach(u => {
      usersMap[u.name] = u;
    });
    primaryUsers = config.users.filter(u => u.type === 'member').map(u => u.name);
    
    // Store full payment method objects and create map
    paymentMethods = config.payment_methods || [];
    paymentMethodsMap = {};
    paymentMethods.forEach(pm => {
      paymentMethodsMap[pm.name] = pm;
    });
    
    // Use categories from API
    categories = config.categories || [];
    
    // Load accounts for income registration
    await loadAccounts();
    
    formConfigLoaded = true;
    
  } catch (error) {
    console.error('Error loading form config:', error);
    // Fallback to empty arrays if API fails
    users = [];
    usersMap = {};
    primaryUsers = [];
    paymentMethods = [];
    paymentMethodsMap = {};
    categories = [];
    accounts = [];
  }
}

/**
 * Load accounts from API (for income registration)
 */
async function loadAccounts() {
  try {
    const response = await fetch(`${API_URL}/accounts`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Error loading accounts');
    }
    
    const accountsData = await response.json();
    // Filter to only savings and cash accounts (can receive income)
    accounts = (accountsData || []).filter(a => a.type === 'savings' || a.type === 'cash');
    
  } catch (error) {
    console.error('Error loading accounts:', error);
    accounts = [];
  }
}

/**
 * Render payment method select
 */
function renderPaymentMethodSelect() {
  const metodoEl = document.getElementById('metodo');
  if (!metodoEl) return;
  
  metodoEl.innerHTML = `
    <option value="">Selecciona...</option>
    ${paymentMethods.map(pm => `<option value="${pm.name}">${pm.name}</option>`).join('')}
  `;
}

/**
 * Setup event listeners and initialize form
 */
export async function setup() {
  const form = document.getElementById('movForm');
  const tipoEl = document.getElementById('tipo');
  const pagadorEl = document.getElementById('pagador');
  const pagadorCompartidoEl = document.getElementById('pagadorCompartido');
  const equitableEl = document.getElementById('equitable');
  const showAsValueEl = document.getElementById('showAsValue');
  const addParticipantBtn = document.getElementById('addParticipantBtn');
  const valorEl = document.getElementById('valor');

  // Initialize navbar
  Navbar.setup();

  // Reset config loaded flag to force fresh data on each page visit
  formConfigLoaded = false;

  // Check URL params for edit mode and tipo pre-selection
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('edit');
  const isEditMode = !!editId;
  const tipoParam = urlParams.get('tipo');

  // Load form configuration from API
  await loadFormConfig();

  // Initialize selects
  renderUserSelect(pagadorEl, users, true);
  renderUserSelect(pagadorCompartidoEl, users, true);
  renderUserSelect(document.getElementById('tomador'), users, true);
  renderCategorySelect();
  renderPaymentMethodSelect();
  renderIngresoMiembroSelect();
  renderIngresoCuentaSelect();

  // Reset participants for SPLIT
  resetParticipants();

  // If edit mode, load movement data
  if (isEditMode) {
    await loadMovementForEdit(editId);
  }

  // Setup tipo button listeners
  const tipoBtns = document.querySelectorAll('.tipo-btn');
  tipoBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tipo = btn.dataset.tipo;
      
      // Remove active class from all buttons
      tipoBtns.forEach(b => b.classList.remove('active'));
      
      // Add active class to clicked button
      btn.classList.add('active');
      
      // Set hidden input value
      tipoEl.value = tipo;
      
      // Trigger tipo change event
      onTipoChange();
    });
  });

  // Check URL params for tipo pre-selection
  if (tipoParam && !isEditMode) {
    const targetBtn = document.querySelector(`.tipo-btn[data-tipo="${tipoParam}"]`);
    if (targetBtn) {
      targetBtn.click();
    }
    // Hide loading screen after tipo is selected
    hideFullScreenLoading();
  }
  pagadorEl.addEventListener('change', onPagadorChange);
  pagadorCompartidoEl.addEventListener('change', onPagadorChange);
  equitableEl.addEventListener('change', onEquitableChange);
  showAsValueEl.addEventListener('change', () => renderParticipants());
  
  // Format valor field on input and blur
  valorEl.addEventListener('input', (e) => {
    const tipo = document.getElementById('tipo').value;
    if (tipo === 'SPLIT' && document.getElementById('showAsValue').checked) {
      renderParticipants();
    }
  });
  
  valorEl.addEventListener('blur', (e) => {
    const rawValue = parseNumber(e.target.value);
    e.target.value = formatNumber(rawValue);
  });
  
  valorEl.addEventListener('focus', (e) => {
    const rawValue = parseNumber(e.target.value);
    if (rawValue === 0) {
      e.target.value = '';
    } else {
      e.target.value = toEditableNumber(rawValue);
    }
  });
  
  // Event listener for income member selector to filter accounts
  const ingresoMiembroEl = document.getElementById('ingresoMiembro');
  if (ingresoMiembroEl) {
    ingresoMiembroEl.addEventListener('change', (e) => {
      const selectedMemberId = e.target.value;
      renderIngresoCuentaSelect(selectedMemberId || null);
    });
  }
  
  addParticipantBtn.addEventListener('click', onAddParticipant);
  form.addEventListener('submit', onSubmit);
  
  // Cancel button event listener
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      router.navigate('/');
    });
  }

  // Initial UI
  onTipoChange();
  onPagadorChange();
}

/**
 * Get current payer based on movement type
 */
function getCurrentPayer() {
  const tipo = document.getElementById('tipo').value;
  if (tipo === 'DEBT_PAYMENT') return document.getElementById('pagador').value || '';
  if (tipo === 'SPLIT') return document.getElementById('pagadorCompartido').value || '';
  return '';
}

/**
 * Render user select dropdown
 */
function renderUserSelect(selectEl, list, includePlaceholder) {
  const current = selectEl.value;
  selectEl.innerHTML = '';

  if (includePlaceholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Seleccionar';
    opt.disabled = true;
    opt.selected = true;
    selectEl.appendChild(opt);
  }

  for (const u of list) {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    selectEl.appendChild(opt);
  }

  if (list.includes(current)) selectEl.value = current;
  if (!includePlaceholder && list.length > 0 && !selectEl.value) {
    selectEl.value = list[0];
  }
  if (includePlaceholder && !selectEl.value) {
    selectEl.selectedIndex = 0;
  }
}

/**
 * Render category select
 */
function renderCategorySelect() {
  const categoriaEl = document.getElementById('categoria');
  categoriaEl.innerHTML = '';
  
  const base = document.createElement('option');
  base.value = '';
  base.textContent = 'Seleccionar';
  base.disabled = true;
  base.selected = true;
  categoriaEl.appendChild(base);

  for (const c of categories) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categoriaEl.appendChild(opt);
  }
}

/**
 * Render income member select (only primary users/members)
 */
function renderIngresoMiembroSelect() {
  const miembroEl = document.getElementById('ingresoMiembro');
  if (!miembroEl) return;
  
  miembroEl.innerHTML = '';
  
  const base = document.createElement('option');
  base.value = '';
  base.textContent = 'Seleccionar';
  base.selected = true;
  miembroEl.appendChild(base);

  for (const userName of primaryUsers) {
    const user = usersMap[userName];
    if (user) {
      const opt = document.createElement('option');
      opt.value = user.id;  // Use user ID
      opt.textContent = userName;
      miembroEl.appendChild(opt);
    }
  }
}

/**
 * Render accounts select (only savings and cash, filtered by owner)
 */
function renderIngresoCuentaSelect(ownerId = null) {
  const cuentaEl = document.getElementById('ingresoCuenta');
  if (!cuentaEl) return;
  
  cuentaEl.innerHTML = '';
  
  const base = document.createElement('option');
  base.value = '';
  base.selected = true;
  base.textContent = 'Seleccionar';
  cuentaEl.appendChild(base);

  // Only show accounts if an owner is selected
  if (!ownerId) {
    return;
  }

  // Filter accounts by owner
  const filteredAccounts = accounts.filter(account => account.owner_id === ownerId);

  if (filteredAccounts.length === 0) {
    base.textContent = 'Este miembro no tiene cuentas';
    return;
  }

  for (const account of filteredAccounts) {
    const opt = document.createElement('option');
    opt.value = account.id;
    opt.textContent = account.name;
    cuentaEl.appendChild(opt);
  }
}

/**
 * Update submit button state
 */
function updateSubmitButton(isCompartido) {
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = false;
  // Keep "Actualizar" text in edit mode, otherwise use "Registrar"
  if (!currentEditMovement) {
    submitBtn.textContent = 'Registrar';
  }
  submitBtn.style.opacity = '1';
  submitBtn.style.cursor = 'pointer';
}

/**
 * Handle tipo change
 */
function onTipoChange() {
  const tipo = document.getElementById('tipo').value;
  const isFamiliar = tipo === 'HOUSEHOLD';
  const isPagoDeuda = tipo === 'DEBT_PAYMENT';
  const isCompartido = tipo === 'SPLIT';
  const isIngreso = tipo === 'INGRESO';

  // Show/hide sections based on tipo
  document.getElementById('pagadorTomadorRow').classList.toggle('hidden', !isPagoDeuda);
  document.getElementById('pagadorWrap').classList.toggle('hidden', !isCompartido);
  document.getElementById('participantesWrap').classList.toggle('hidden', !isCompartido);
  
  // Income-specific fields
  document.getElementById('ingresoMiembroWrap').classList.toggle('hidden', !isIngreso);
  document.getElementById('ingresoTipoWrap').classList.toggle('hidden', !isIngreso);
  document.getElementById('ingresoCuentaWrap').classList.toggle('hidden', !isIngreso);

  // Reset income fields when switching to/from INGRESO
  if (isIngreso) {
    // When switching TO income, reset account dropdown to empty (no owner selected yet)
    renderIngresoCuentaSelect(null);
  } else {
    // When switching away from INGRESO, reset all fields
    document.getElementById('ingresoMiembro').value = '';
    document.getElementById('ingresoTipo').value = '';
    document.getElementById('ingresoCuenta').value = '';
    renderIngresoCuentaSelect(null);
  }

  // Show/hide category field
  // Hidden when: no tipo selected, INGRESO, or DEBT_PAYMENT (until payer is selected)
  // For DEBT_PAYMENT: category visibility is controlled by onPagadorChange()
  const categoriaWrap = document.getElementById('categoriaWrap');
  if (categoriaWrap) {
    const shouldHideCategoria = !tipo || isIngreso || isPagoDeuda;
    categoriaWrap.classList.toggle('hidden', shouldHideCategoria);
  }

  updateSubmitButton(isCompartido);

  if (isFamiliar) {
    // For HOUSEHOLD type, show payment methods for current user
    showPaymentMethods(currentUser ? currentUser.name : '', true);
  } else if (!isIngreso) {
    onPagadorChange();
  }

  if (!isPagoDeuda) {
    document.getElementById('pagador').value = '';
    document.getElementById('tomador').value = '';
  }
  if (!isCompartido) {
    document.getElementById('pagadorCompartido').value = '';
  }

  if (isCompartido) {
    participants = dedupeParticipants(participants);
    computeEquitablePcts();
    renderParticipants();
  }
}

/**
 * Get payment methods available for a specific payer
 * Returns methods owned by the payer OR shared with household
 */
function getPaymentMethodsForPayer(payerName) {
  if (!payerName || !usersMap[payerName]) return [];
  
  const payer = usersMap[payerName];
  
  return paymentMethods.filter(pm => {
    // Include if: (1) owned by payer, OR (2) shared with household
    return pm.owner_id === payer.id || pm.is_shared;
  });
}

/**
 * Show payment methods dropdown filtered by payer
 */
function showPaymentMethods(payerName, required) {
  const metodoEl = document.getElementById('metodo');
  const metodoWrap = document.getElementById('metodoWrap');

  metodoEl.innerHTML = '';
  const base = document.createElement('option');
  base.value = '';
  base.textContent = 'Seleccionar';
  base.selected = true;
  metodoEl.appendChild(base);

  const availableMethods = getPaymentMethodsForPayer(payerName);
  for (const pm of availableMethods) {
    const opt = document.createElement('option');
    opt.value = pm.name;
    opt.textContent = pm.name;
    metodoEl.appendChild(opt);
  }

  metodoWrap.classList.remove('hidden');
  metodoEl.required = required;
}

/**
 * Handle pagador change
 */
function onPagadorChange() {
  const tipo = document.getElementById('tipo').value;
  const payer = getCurrentPayer();

  if (tipo !== 'HOUSEHOLD') {
    const isMember = primaryUsers.includes(payer);
    const metodoWrap = document.getElementById('metodoWrap');
    const metodoEl = document.getElementById('metodo');

    // Only show payment methods for members (even if empty, so validation works)
    // Don't show for contacts
    if (isMember) {
      showPaymentMethods(payer, true);
    } else {
      metodoWrap.classList.add('hidden');
      metodoEl.required = false;
      metodoEl.value = '';
    }
    
    // For DEBT_PAYMENT: category required only when payer is household member
    if (tipo === 'DEBT_PAYMENT') {
      const categoriaWrap = document.getElementById('categoriaWrap');
      const categoriaEl = document.getElementById('categoria');
      
      if (isMember) {
        // Payer is member: category required
        categoriaWrap.classList.remove('hidden');
        categoriaEl.required = true;
      } else {
        // Payer is contact: category not required, hide field
        categoriaWrap.classList.add('hidden');
        categoriaEl.required = false;
        categoriaEl.value = '';
      }
    }
  }

  if (tipo === 'SPLIT') {
    resetParticipants();
  }
}

/**
 * Handle equitable checkbox change
 */
function onEquitableChange() {
  const equitableEl = document.getElementById('equitable');
  if (equitableEl.checked) {
    computeEquitablePcts();
  }
  renderParticipants();
}

/**
 * Remove duplicate participants
 */
function dedupeParticipants(list) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const key = p.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/**
 * Reset participants to default (payer only)
 */
function resetParticipants() {
  const payer = document.getElementById('pagadorCompartido').value || '';
  participants = [];
  if (payer) participants.push({ name: payer, pct: 0 });
  computeEquitablePcts();
  renderParticipants();
}

/**
 * Compute equitable percentages
 */
function computeEquitablePcts() {
  if (!participants.length) return;
  const n = participants.length;
  const base = Math.floor(10000 / n) / 100;
  let total = 0;

  for (let i = 0; i < participants.length; i++) {
    let pct = base;
    total += pct;
    participants[i].pct = pct;
  }

  const diff = Math.round((100 - total) * 100) / 100;
  participants[participants.length - 1].pct = 
    Math.round((participants[participants.length - 1].pct + diff) * 100) / 100;
}

/**
 * Render participants list
 */
function renderParticipants() {
  const participantsListEl = document.getElementById('participantsList');
  participantsListEl.innerHTML = '';

  const tipo = document.getElementById('tipo').value;
  if (tipo !== 'SPLIT') return;

  const editable = !document.getElementById('equitable').checked;
  const showAsValue = document.getElementById('showAsValue').checked;
  const totalValue = parseNumber(document.getElementById('valor').value) || 0;

  // Adjust grid columns based on view mode
  participantsListEl.style.display = 'grid';
  participantsListEl.style.gap = '12px';

  participants.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'participantRow';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = showAsValue ? 'minmax(80px, 1fr) 160px 40px' : 'minmax(120px, 1fr) 95px 40px';
    row.style.gap = '10px';
    row.style.alignItems = 'center';

    const nameSel = document.createElement('select');
    for (const u of users) {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u;
      if (u === p.name) opt.selected = true;
      nameSel.appendChild(opt);
    }
    nameSel.addEventListener('change', () => {
      participants[idx].name = nameSel.value;
      participants = dedupeParticipants(participants);
      if (document.getElementById('equitable').checked) computeEquitablePcts();
      renderParticipants();
    });

    const pctWrap = document.createElement('div');
    pctWrap.className = 'pctWrap';
    pctWrap.style.display = 'flex';
    pctWrap.style.alignItems = 'center';

    const pctInput = document.createElement('input');
    pctInput.disabled = !editable;

    if (showAsValue) {
      // Show as COP value
      pctInput.type = 'text';
      pctInput.inputMode = 'decimal';
      const value = ((p.pct / 100) * totalValue);
      pctInput.value = formatNumber(value);

      pctInput.addEventListener('input', (e) => {
        // Filtrar caracteres no numéricos (permitir solo dígitos, punto y comas)
        const cursorPos = e.target.selectionStart;
        const oldValue = e.target.value;
        const newValue = oldValue.replace(/[^0-9.,]/g, '');
        
        if (newValue !== oldValue) {
          e.target.value = newValue;
          e.target.setSelectionRange(cursorPos - 1, cursorPos - 1);
        }
        
        const v = parseNumber(e.target.value);
        if (Number.isFinite(v) && totalValue > 0) {
          participants[idx].pct = (v / totalValue) * 100;
        } else {
          participants[idx].pct = 0;
        }
        validatePctSum();
      });
      
      pctInput.addEventListener('blur', () => {
        const v = parseNumber(pctInput.value);
        pctInput.value = formatNumber(v);
      });
      
      pctInput.addEventListener('focus', () => {
        const v = parseNumber(pctInput.value);
        if (v === 0) {
          pctInput.value = '';
        } else {
          pctInput.value = toEditableNumber(v);
        }
      });
    } else {
      // Show as percentage
      pctInput.type = 'number';
      pctInput.inputMode = 'decimal';
      pctInput.min = '0';
      pctInput.max = '100';
      pctInput.step = '0.01';
      pctInput.value = String(p.pct ?? 0);

      pctInput.addEventListener('input', () => {
        const v = Number(pctInput.value);
        participants[idx].pct = Number.isFinite(v) ? v : 0;
        validatePctSum();
      });
    }

    // Create input wrapper with suffix
    const inputWrapper = document.createElement('div');
    inputWrapper.style.display = 'flex';
    inputWrapper.style.alignItems = 'center';
    inputWrapper.style.border = '1px solid #e5e7eb';
    inputWrapper.style.borderRadius = '12px';
    inputWrapper.style.padding = '0';
    inputWrapper.style.backgroundColor = pctInput.disabled ? '#f9fafb' : 'white';
    inputWrapper.style.maxWidth = '100%';
    inputWrapper.style.boxSizing = 'border-box';

    // Style the input to fit inside wrapper
    pctInput.style.border = 'none';
    pctInput.style.outline = 'none';
    pctInput.style.flex = '1';
    pctInput.style.backgroundColor = 'transparent';
    pctInput.style.textAlign = 'right';
    pctInput.style.minWidth = '0';
    pctInput.style.fontSize = showAsValue ? '13px' : '14px';
    pctInput.style.padding = showAsValue ? '12px 14px 12px 2px' : '12px 2px 12px 14px';

    // Add prefix/suffix label inside
    const label = document.createElement('span');
    label.textContent = showAsValue ? 'COP' : '%';
    label.style.color = '#9ca3af';
    label.style.userSelect = 'none';
    label.style.fontSize = '14px';
    label.style.flexShrink = '0';
    label.style.fontWeight = '500';
    
    if (showAsValue) {
      // COP prefix (left side)
      label.style.paddingLeft = '14px';
      label.style.paddingRight = '4px';
      inputWrapper.appendChild(label);
      inputWrapper.appendChild(pctInput);
    } else {
      // % suffix (right side)
      label.style.paddingLeft = '2px';
      label.style.paddingRight = '14px';
      inputWrapper.appendChild(pctInput);
      inputWrapper.appendChild(label);
    }
    
    pctWrap.appendChild(inputWrapper);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'ghost';
    delBtn.textContent = '×';
    delBtn.title = 'Quitar';
    delBtn.addEventListener('click', () => {
      participants.splice(idx, 1);
      participants = dedupeParticipants(participants);
      if (document.getElementById('equitable').checked) computeEquitablePcts();
      renderParticipants();
    });

    row.appendChild(nameSel);
    row.appendChild(pctWrap);
    row.appendChild(delBtn);

    participantsListEl.appendChild(row);
  });

  validatePctSum();
}

/**
 * Validate percentage sum
 */
function validatePctSum() {
  const tipo = document.getElementById('tipo').value;
  if (tipo !== 'SPLIT') return true;
  if (document.getElementById('equitable').checked) return true;

  const sum = participants.reduce((acc, p) => acc + Number(p.pct || 0), 0);
  const ok = Math.abs(sum - 100) < 0.01;

  if (!ok) {
    const showAsValue = document.getElementById('showAsValue').checked;
    const totalValue = parseNumber(document.getElementById('valor').value) || 0;
    
    if (showAsValue && totalValue > 0) {
      // Modo valor: mostrar solo valores en COP
      const expectedCOP = formatNumber(totalValue);
      const currentCOP = formatNumber((sum / 100) * totalValue);
      const diffCOP = formatNumber(totalValue - (sum / 100) * totalValue);
      const action = sum < 100 ? 'Faltan' : 'Sobran';
      setStatus(`La suma debe ser ${expectedCOP}. Actualmente: ${currentCOP} (${action} ${diffCOP}).`, 'err');
    } else {
      // Modo porcentaje: mostrar solo porcentajes
      const diff = Math.abs(100 - sum).toFixed(2);
      const action = sum < 100 ? 'Faltan' : 'Sobran';
      setStatus(`La suma de porcentajes debe ser 100%. Actualmente: ${sum.toFixed(2)}% (${action} ${diff}%).`, 'err');
    }
  } else {
    setStatus('', '');
  }
  return ok;
}

/**
 * Add participant
 */
function onAddParticipant() {
  const used = new Set(participants.map(p => p.name));
  const candidate = users.find(u => !used.has(u)) || users[0];
  if (!candidate) return;

  participants.push({ name: candidate, pct: 0 });
  participants = dedupeParticipants(participants);

  if (document.getElementById('equitable').checked) computeEquitablePcts();
  renderParticipants();
}

/**
 * Read form data
 */
function readForm() {
  const tipo = document.getElementById('tipo').value;
  const fecha = (document.getElementById('fecha').value || '').slice(0, 10);
  const descripcion = (document.getElementById('descripcion').value || '').trim();
  const valor = parseNumber(document.getElementById('valor').value);

  if (!fecha) throw new Error('Fecha es obligatoria.');
  if (!tipo) throw new Error('Tipo de movimiento es obligatorio.');
  if (!Number.isFinite(valor) || valor <= 0) throw new Error('Monto total debe ser un número mayor a 0.');
  if (!descripcion) throw new Error('Nota es obligatoria.');

  // Handle INGRESO separately
  if (tipo === 'INGRESO') {
    const ingresoMiembro = document.getElementById('ingresoMiembro').value || '';
    const ingresoTipo = document.getElementById('ingresoTipo').value || '';
    const ingresoCuenta = document.getElementById('ingresoCuenta').value || '';

    if (!ingresoMiembro) throw new Error('Debes seleccionar para quién es el ingreso.');
    if (!ingresoTipo) throw new Error('Debes seleccionar el tipo de ingreso.');
    if (!ingresoCuenta) throw new Error('Debes seleccionar la cuenta destino.');

    return {
      tipo: 'INGRESO',
      member_id: ingresoMiembro,
      account_id: ingresoCuenta,
      type: ingresoTipo,
      amount: valor,
      description: descripcion,
      income_date: fecha
    };
  }

  // Handle regular movements (gastos, prestamos)
  const pagador = getCurrentPayer();
  const metodo = document.getElementById('metodo').value || '';
  const tomador = document.getElementById('tomador').value || '';
  const categoria = document.getElementById('categoria').value || '';

  // Skip some validations in edit mode
  const isEditMode = !!currentEditMovement;

  if (!isEditMode && tipo !== 'HOUSEHOLD' && !pagador) throw new Error('Pagador es obligatorio.');

  // Categoria is required for HOUSEHOLD and SPLIT only (not for DEBT_PAYMENT)
  if ((tipo === 'HOUSEHOLD' || tipo === 'SPLIT') && !categoria) {
    throw new Error('Categoría es obligatoria.');
  }

  const requiresMethod = !isEditMode && (tipo === 'HOUSEHOLD' || primaryUsers.includes(pagador));
  if (requiresMethod && !metodo) throw new Error('Método de pago es obligatorio.');

  // Validate that the payment method is valid for the payer (skip in edit mode)
  if (!isEditMode && metodo) {
    const effectivePayer = tipo === 'HOUSEHOLD' ? (currentUser ? currentUser.name : '') : pagador;
    const availableMethods = getPaymentMethodsForPayer(effectivePayer);
    const isValidMethod = availableMethods.some(pm => pm.name === metodo);
    
    if (!isValidMethod) {
      const paymentMethod = paymentMethods.find(pm => pm.name === metodo);
      const ownerName = paymentMethod ? paymentMethod.owner_name : 'otro miembro';
      throw new Error(`${effectivePayer} no puede usar el método "${metodo}" porque pertenece a ${ownerName} y no ha sido compartido con el hogar.`);
    }
  }

  if (!isEditMode && tipo === 'DEBT_PAYMENT') {
    if (!tomador) throw new Error('Para pago de deuda debes seleccionar quién recibió (Tomador).');
    if (tomador === pagador) throw new Error('Pagador y Tomador no pueden ser la misma persona.');
  }

  if (!isEditMode && tipo === 'SPLIT') {
    if (!participants.length) throw new Error('Debes tener al menos 1 participante.');
    if (!validatePctSum()) throw new Error('Los porcentajes de participantes deben sumar 100%.');

    const lower = participants.map(p => p.name.toLowerCase());
    if (new Set(lower).size !== lower.length) throw new Error('No puedes repetir participantes.');
  }

  // Build new API payload with IDs
  const payload = {
    type: tipo, // Already in backend format (HOUSEHOLD, SPLIT, DEBT_PAYMENT)
    description: descripcion,
    amount: valor,
    movement_date: fecha,
    currency: 'COP'
  };

  // Add category (required for HOUSEHOLD, optional for DEBT_PAYMENT if payer is member)
  if (categoria) {
    payload.category = categoria;
  }

  // Add payer (user_id or contact_id)
  if (tipo === 'HOUSEHOLD') {
    // For HOUSEHOLD, payer is always the current user
    if (currentUser && currentUser.id) {
      payload.payer_user_id = currentUser.id;
    }
  } else if (pagador) {
    // Check if pagador is a member or contact
    const payerUser = usersMap[pagador];
    if (payerUser) {
      if (payerUser.type === 'member') {
        payload.payer_user_id = payerUser.id;
      } else if (payerUser.type === 'contact') {
        payload.payer_contact_id = payerUser.id;
      }
    }
  }

  // Add payment method ID
  if (metodo) {
    const pm = paymentMethodsMap[metodo];
    if (pm && pm.id) {
      payload.payment_method_id = pm.id;
    }
  }

  // Add counterparty for DEBT_PAYMENT
  if (tipo === 'DEBT_PAYMENT' && tomador) {
    const tomadorUser = usersMap[tomador];
    if (tomadorUser) {
      if (tomadorUser.type === 'member') {
        payload.counterparty_user_id = tomadorUser.id;
      } else if (tomadorUser.type === 'contact') {
        payload.counterparty_contact_id = tomadorUser.id;
      }
    }
  }

  // Add participants for SPLIT
  if (tipo === 'SPLIT' && participants.length > 0) {
    payload.participants = participants.map(p => {
      const participantUser = usersMap[p.name];
      const participant = {
        percentage: Number(p.pct || 0) / 100
      };
      
      if (participantUser) {
        if (participantUser.type === 'member') {
          participant.participant_user_id = participantUser.id;
        } else if (participantUser.type === 'contact') {
          participant.participant_contact_id = participantUser.id;
        }
      }
      
      return participant;
    });
  }

  return payload;
}

/**
 * Show full-screen loading overlay (only updates message if already rendered)
 */
function showFullScreenLoading(message = 'Cargando movimiento...') {
  const loadingDiv = document.getElementById('fullScreenLoading');
  if (loadingDiv) {
    // Already rendered, just update message if needed
    const messageEl = loadingDiv.querySelector('p');
    if (messageEl) {
      messageEl.textContent = message;
    }
    loadingDiv.style.display = 'flex';
  } else {
    // Create loading div if not already rendered (shouldn't happen with new flow)
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle && message === 'Cargando movimiento...') {
      pageTitle.textContent = 'Editar Movimiento';
    }
    
    const form = document.getElementById('movForm');
    if (form) {
      form.style.display = 'none';
    }
    
    const main = document.querySelector('main.card');
    if (main) {
      const div = document.createElement('div');
      div.id = 'fullScreenLoading';
      div.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 400px;
        gap: 16px;
      `;
      div.innerHTML = `
        <div class="spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
        <p style="color: #6b7280; font-size: 16px;">${message}</p>
      `;
      main.appendChild(div);
    }
  }
}

/**
 * Hide full-screen loading overlay
 */
function hideFullScreenLoading() {
  const loadingDiv = document.getElementById('fullScreenLoading');
  if (loadingDiv) {
    loadingDiv.style.display = 'none';
  }
  
  const form = document.getElementById('movForm');
  if (form) {
    form.style.display = '';
  }
}

/**
 * Load movement data for editing
 */
async function loadMovementForEdit(movementId) {
  try {
    
    const response = await fetch(`${API_URL}/movements/${movementId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Error al cargar el movimiento');
    }
    
    const movement = await response.json();
    currentEditMovement = movement;
    
    // Hide loading overlay
    hideFullScreenLoading();
    
    // Pre-fill form fields
    const descripcionEl = document.getElementById('descripcion');
    const valorEl = document.getElementById('valor');
    const categoriaEl = document.getElementById('categoria');
    const fechaEl = document.getElementById('fecha');
    
    if (descripcionEl) descripcionEl.value = movement.description || '';
    if (valorEl) valorEl.value = formatNumber(movement.amount);
    if (categoriaEl) categoriaEl.value = movement.category || '';
    
    if (fechaEl && movement.movement_date) {
      // Convert to YYYY-MM-DD format
      const date = new Date(movement.movement_date);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      fechaEl.value = `${yyyy}-${mm}-${dd}`;
    }
    
    // Update buttons and title for edit mode
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    if (submitBtn) {
      submitBtn.textContent = 'Actualizar';
    }
    if (cancelBtn) {
      cancelBtn.classList.remove('hidden');
    }
    
    // Select the current tipo and set it in the form (no mapping needed, types match)
    const currentTipoBtn = document.querySelector(`.tipo-btn[data-tipo="${movement.type}"]`);
    if (currentTipoBtn) {
      currentTipoBtn.classList.add('active');
      document.getElementById('tipo').value = movement.type;
      onTipoChange();
    }
    
    // Disable tipo selector buttons after selection
    const tipoBtns = document.querySelectorAll('.tipo-btn');
    tipoBtns.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      btn.title = 'No se puede cambiar el tipo de movimiento';
    });
    
    // But keep the active one visually clear
    if (currentTipoBtn) {
      currentTipoBtn.style.opacity = '1';
    }
    
    // For HOUSEHOLD movements, we need to show payment methods for the actual payer
    // (not currentUser, which is who's logged in)
    if (movement.type === 'HOUSEHOLD' && movement.payer_user_id) {
      const payerUser = Object.values(usersMap).find(u => u.id === movement.payer_user_id);
      if (payerUser) {
        showPaymentMethods(payerUser.name, true);
      }
    }
    
    // Pre-select current payment method (now editable!)
    // Note: showPaymentMethods() above repopulated the select options for the correct payer
    // We need to find the payment method by ID and set its name
    const metodoEl = document.getElementById('metodo');
    let selectedPaymentMethodName = null;
    
    if (metodoEl && movement.payment_method_id) {
      const paymentMethod = paymentMethods.find(pm => pm.id === movement.payment_method_id);
      if (paymentMethod) {
        selectedPaymentMethodName = paymentMethod.name;
      }
    }
    
    // Set the payment method value (now editable!)
    // Use setTimeout to ensure the select is properly rendered before setting value
    if (metodoEl && selectedPaymentMethodName) {
      setTimeout(() => {
        const optionIndex = Array.from(metodoEl.options).findIndex(opt => opt.value === selectedPaymentMethodName);
        
        if (optionIndex >= 0) {
          metodoEl.selectedIndex = optionIndex;
        } else {
          console.warn('Payment method option not found:', selectedPaymentMethodName);
        }
      }, 0);
    }
    
  } catch (error) {
    console.error('Error loading movement:', error);
    hideFullScreenLoading();
    setStatus('Error al cargar el movimiento para editar', 'err');
    
    setTimeout(() => {
      router.navigate('/');
    }, 2000);
  }
}

/**
 * Handle form submission
 */
async function onSubmit(e) {
  e.preventDefault();
  setStatus('', '');

  const submitBtn = document.getElementById('submitBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const originalText = submitBtn.textContent;

  try {
    const payload = readForm();
    
    // Show loading state - disable both buttons
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';
    if (cancelBtn) {
      cancelBtn.disabled = true;
    }
    
    // Handle INGRESO separately - submit to income API
    if (payload.tipo === 'INGRESO') {
      setStatus('Registrando ingreso...', 'loading');
      
      const res = await fetch(`${API_URL}/income`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const text = await res.text();
      if (!res.ok) {
        // Check if it's a n8n service unavailable (503)
        if (res.status === 503) {
          // For income, data is saved to DB but not synced to Sheets
          setStatus('⚠️ Ingreso guardado en base de datos pero no sincronizado con Google Sheets. Por favor contacta al administrador.', 'warning');
          
          // Reset form after 3 seconds
          setTimeout(() => {
            document.getElementById('movForm').reset();
            document.getElementById('fecha').value = getTodayLocal();
            document.getElementById('tipo').value = '';
            onTipoChange();
            setStatus('', '');
          }, 3000);
          
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          if (cancelBtn) {
            cancelBtn.disabled = false;
          }
          return;
        }
        throw new Error(`HTTP ${res.status} - ${text}`);
      }

      setStatus('Ingreso registrado correctamente.', 'ok');
    } else {
      // Handle regular movements (gastos) - now using new backend API
      const isEditMode = !!currentEditMovement;
      setStatus(isEditMode ? 'Actualizando movimiento...' : 'Registrando movimiento...', 'loading');

      let res;
      if (isEditMode) {
        // PATCH /movements/{id} for update
        // Only send fields that can be updated
        const updatePayload = {
          description: payload.description,
          amount: payload.amount,
          category: payload.category,
          movement_date: payload.movement_date + 'T00:00:00Z' // Add time component for RFC3339
        };
        
        // Add payment method ID if it was selected
        if (payload.payment_method_id) {
          updatePayload.payment_method_id = payload.payment_method_id;
        }

        res = await fetch(`${API_URL}/movements/${currentEditMovement.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(updatePayload)
        });
      } else {
        // POST /movements for create
        res = await fetch(`${API_URL}/movements`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        // Parse error response
        let errorMsg = `HTTP ${res.status}`;
        try {
          const errorText = await res.text();
          if (errorText) {
            errorMsg = errorText;
          }
        } catch (e) {
          // Ignore parse errors
        }
        
        // Check if it's a n8n service unavailable (503)
        if (res.status === 503 && !isEditMode) {
          // For movements with new backend, data IS saved to PostgreSQL even if n8n fails
          setStatus('⚠️ Movimiento guardado en PostgreSQL pero no sincronizado con Google Sheets. La sincronización se realizará más tarde.', 'warning');
          
          // Reset form after 3 seconds
          setTimeout(() => {
            document.getElementById('movForm').reset();
            document.getElementById('fecha').value = getTodayLocal();
            document.getElementById('tipo').value = '';
            onTipoChange();
            setStatus('', '');
          }, 3000);
          
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
          if (cancelBtn) {
            cancelBtn.disabled = false;
          }
          return;
        }
        
        throw new Error(errorMsg);
      }

      // Success - movement created or updated
      const response = await res.json();
      setStatus(isEditMode ? 'Movimiento actualizado correctamente.' : 'Movimiento registrado correctamente.', 'ok');
    }

    // If in edit mode, navigate back to home instead of resetting form
    if (currentEditMovement) {
      currentEditMovement = null;
      setTimeout(() => {
        router.navigate('/');
      }, 1500);
      return;
    }

    document.getElementById('movForm').reset();

    // Restore defaults
    document.getElementById('fecha').value = getTodayLocal();
    document.getElementById('pagador').value = '';
    document.getElementById('pagadorCompartido').value = '';
    document.getElementById('tipo').value = '';
    document.getElementById('tomador').value = '';
    document.getElementById('metodo').value = '';
    document.getElementById('categoria').value = '';
    document.getElementById('ingresoMiembro').value = '';
    document.getElementById('ingresoTipo').value = '';
    document.getElementById('ingresoCuenta').value = '';
    document.getElementById('equitable').checked = true;
    resetParticipants();

    onTipoChange();
  } catch (err) {
    // Handle network/connection errors
    if (err instanceof TypeError && err.message.includes('fetch')) {
      setStatus('No se pudo conectar al backend', 'err');
    } else {
      setStatus(`Error: ${err.message}`, 'err');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    if (cancelBtn) {
      cancelBtn.disabled = false;
    }
  }
}

/**
 * Set status message
 */
function setStatus(msg, kind) {
  const statusEl = document.getElementById('status');
  statusEl.className = `status ${kind || ''}`.trim();
  
  if (kind === 'loading' && msg) {
    // Add spinner for loading state
    statusEl.innerHTML = `<span class="spinner"></span> ${msg}`;
  } else {
    statusEl.textContent = msg || '';
  }
}
