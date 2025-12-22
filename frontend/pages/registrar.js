/**
 * Registrar Movimiento Page
 * 
 * Handles movement registration form with all business logic:
 * - FAMILIAR, COMPARTIDO, PAGO_DEUDA types
 * - Dynamic form fields based on type
 * - Payment methods, categories, participants
 */

import { logout, getMovementsApiUrl } from '../auth-utils.js';
import router from '../router.js';

// Configuration from app.js
const DEFAULT_USERS = [
  "Caro", "Jose", "Maria Isabel", "Papá Caro", "Mamá Caro",
  "Daniel", "Yury", "Prebby", "Kelly Carolina"
];

const PRIMARY_USERS = ["Jose", "Caro"];

const PAYMENT_METHODS = [
  "Débito Jose", "AMEX Jose", "MasterCard Oro Jose",
  "Débito Caro", "Nu Caro"
];

const CATEGORIES = [
  "Pago de SOAT/impuestos/mantenimiento", "Carro - Seguro",
  "Uber/Gasolina/Peajes/Parqueaderos", "Casa - Gastos fijos",
  "Casa - Cositas para casa", "Casa - Provisionar mes entrante",
  "Kellys", "Mercado", "Ahorros para SOAT/impuestos/mantenimiento",
  "Ahorros para cosas de la casa", "Ahorros para vacaciones",
  "Ahorros para regalos", "Salidas juntos", "Vacaciones",
  "Inversiones Caro", "Inversiones Jose", "Inversiones Juntos",
  "Regalos", "Caro - Gastos fijos", "Caro - Vida cotidiana",
  "Jose - Gastos fijos", "Jose - Vida cotidiana", "Gastos médicos",
  "Caro - Imprevistos", "Jose - Imprevistos", "Casa - Imprevistos",
  "Carro - Imprevistos", "Préstamo"
];

let users = [...DEFAULT_USERS];
let participants = []; // [{ name, pct }]
let currentUser = null;

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
  
  return `
    <main class="card">
      <header class="header">
        <div class="header-row">
          <h1>Registrar movimiento</h1>
          <div class="user-info">
            <span class="user-email">${user.name}</span>
            <button type="button" id="logoutBtn" class="logout-btn">Salir</button>
          </div>
        </div>
        <p class="subtitle">Gasto del hogar, dividir gasto o pago de deuda.</p>
      </header>

      <form id="movForm" novalidate>
        <div class="grid">
          <label class="field">
            <span>Fecha</span>
            <input name="fecha" id="fecha" type="date" value="${getTodayLocal()}" required />
            <small class="hint">Obligatorio</small>
          </label>

          <label class="field">
            <span>Tipo de movimiento</span>
            <select name="tipo" id="tipo" required>
              <option value="" selected disabled>Seleccionar</option>
              <option value="FAMILIAR">Gasto del hogar</option>
              <option value="COMPARTIDO">Dividir gasto</option>
              <option value="PAGO_DEUDA">Pago de deuda</option>
            </select>
            <small class="hint">Obligatorio</small>
          </label>

          <label class="field col-span-2">
            <span>Descripción</span>
            <input name="descripcion" id="descripcion" type="text" placeholder="Ej: Almuerzo, Uber a casa, Guaritos…" required />
            <small class="hint">Opcional</small>
          </label>

          <label class="field col-span-2">
            <span>Categoría</span>
            <select name="categoria" id="categoria" required>
              <option value="" selected disabled>Seleccionar</option>
            </select>
            <small class="hint">Obligatorio</small>
          </label>

          <label class="field col-span-2">
            <span>Monto total (COP)</span>
            <input name="valor" id="valor" type="number" min="0" step="1" inputmode="numeric" placeholder="0" required />
            <small class="hint">Obligatorio</small>
          </label>

          <!-- Pagador y Tomador en fila (para PAGO_DEUDA) -->
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

          <!-- Pagador solo (para COMPARTIDO) -->
          <label class="field hidden" id="pagadorWrap">
            <span>¿Quién pagó?</span>
            <select name="pagadorCompartido" id="pagadorCompartido"></select>
            <small class="hint">Obligatorio</small>
          </label>

          <!-- Método de pago -->
          <div class="field col-span-2 hidden" id="metodoWrap">
            <span>Método de pago</span>
            <select name="metodo" id="metodo">
              <option value="" selected>Seleccionar</option>
            </select>
          </div>

          <!-- Participantes: solo para COMPARTIDO -->
          <section class="section col-span-2 hidden" id="participantesWrap">
            <div class="sectionHeader">
              <h2>Participantes</h2>
              <label class="checkbox">
                <input type="checkbox" id="equitable" checked />
                <span>Dividir equitativamente</span>
              </label>
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
          <button type="submit" id="submitBtn">Registrar</button>
          <p id="status" class="status" role="status" aria-live="polite"></p>
        </div>
      </form>
    </main>
  `;
}

/**
 * Setup event listeners and initialize form
 */
export function setup() {
  const form = document.getElementById('movForm');
  const tipoEl = document.getElementById('tipo');
  const pagadorEl = document.getElementById('pagador');
  const pagadorCompartidoEl = document.getElementById('pagadorCompartido');
  const equitableEl = document.getElementById('equitable');
  const addParticipantBtn = document.getElementById('addParticipantBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // Initialize selects
  renderUserSelect(pagadorEl, users, true);
  renderUserSelect(pagadorCompartidoEl, users, true);
  renderUserSelect(document.getElementById('tomador'), users, true);
  renderCategorySelect();

  // Reset participants for COMPARTIDO
  resetParticipants();

  // Event listeners
  tipoEl.addEventListener('change', onTipoChange);
  pagadorEl.addEventListener('change', onPagadorChange);
  pagadorCompartidoEl.addEventListener('change', onPagadorChange);
  equitableEl.addEventListener('change', onEquitableChange);
  addParticipantBtn.addEventListener('click', onAddParticipant);
  form.addEventListener('submit', onSubmit);
  logoutBtn.addEventListener('click', handleLogout);

  // Initial UI
  onTipoChange();
  onPagadorChange();
}

/**
 * Handle logout button
 */
async function handleLogout() {
  await logout();
  router.navigate('/login');
}

/**
 * Get current payer based on movement type
 */
function getCurrentPayer() {
  const tipo = document.getElementById('tipo').value;
  if (tipo === 'PAGO_DEUDA') return document.getElementById('pagador').value || '';
  if (tipo === 'COMPARTIDO') return document.getElementById('pagadorCompartido').value || '';
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

  for (const c of CATEGORIES) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categoriaEl.appendChild(opt);
  }
}

/**
 * Update submit button state
 */
function updateSubmitButton(isCompartido) {
  const submitBtn = document.getElementById('submitBtn');
  if (isCompartido) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Dividir gasto próximamente...';
    submitBtn.style.opacity = '0.5';
    submitBtn.style.cursor = 'not-allowed';
  } else {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrar';
    submitBtn.style.opacity = '1';
    submitBtn.style.cursor = 'pointer';
  }
}

/**
 * Handle tipo change
 */
function onTipoChange() {
  const tipo = document.getElementById('tipo').value;
  const isFamiliar = tipo === 'FAMILIAR';
  const isPagoDeuda = tipo === 'PAGO_DEUDA';
  const isCompartido = tipo === 'COMPARTIDO';

  document.getElementById('pagadorTomadorRow').classList.toggle('hidden', !isPagoDeuda);
  document.getElementById('pagadorWrap').classList.toggle('hidden', !isCompartido);
  document.getElementById('participantesWrap').classList.toggle('hidden', !isCompartido);

  updateSubmitButton(isCompartido);

  if (isFamiliar) {
    showPaymentMethods(true);
  } else {
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
    ensurePayerInParticipants();
    computeEquitablePcts();
    renderParticipants();
  }
}

/**
 * Show payment methods dropdown
 */
function showPaymentMethods(required) {
  const metodoEl = document.getElementById('metodo');
  const metodoWrap = document.getElementById('metodoWrap');
  
  metodoEl.innerHTML = '';
  const base = document.createElement('option');
  base.value = '';
  base.textContent = 'Seleccionar';
  base.selected = true;
  metodoEl.appendChild(base);

  for (const m of PAYMENT_METHODS) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
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

  if (tipo !== 'FAMILIAR') {
    const requiresMethod = PRIMARY_USERS.includes(payer);
    const metodoWrap = document.getElementById('metodoWrap');
    const metodoEl = document.getElementById('metodo');

    if (requiresMethod) {
      showPaymentMethods(true);
    } else {
      metodoWrap.classList.add('hidden');
      metodoEl.required = false;
      metodoEl.value = '';
    }
  }

  if (tipo === 'COMPARTIDO') {
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
 * Ensure payer is in participants list
 */
function ensurePayerInParticipants() {
  const payer = getCurrentPayer();
  if (!payer) return;
  if (!participants.some(p => p.name === payer)) {
    participants.unshift({ name: payer, pct: 0 });
  }
  participants = dedupeParticipants(participants);
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
  if (tipo !== 'COMPARTIDO') return;

  const editable = !document.getElementById('equitable').checked;

  participants.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'participantRow';

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

    const pctInput = document.createElement('input');
    pctInput.type = 'number';
    pctInput.min = '0';
    pctInput.max = '100';
    pctInput.step = '0.01';
    pctInput.value = String(p.pct ?? 0);
    pctInput.disabled = !editable;

    pctInput.addEventListener('input', () => {
      const v = Number(pctInput.value);
      participants[idx].pct = Number.isFinite(v) ? v : 0;
      validatePctSum();
    });

    pctWrap.appendChild(pctInput);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'ghost';
    delBtn.textContent = '×';
    delBtn.title = 'Quitar';
    delBtn.addEventListener('click', () => {
      participants.splice(idx, 1);
      ensurePayerInParticipants();
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
  if (tipo !== 'COMPARTIDO') return true;
  if (document.getElementById('equitable').checked) return true;

  const sum = participants.reduce((acc, p) => acc + Number(p.pct || 0), 0);
  const ok = Math.abs(sum - 100) < 0.01;

  if (!ok) {
    setStatus(`La suma de porcentajes debe ser 100%. Actualmente: ${sum.toFixed(2)}%.`, 'err');
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
  const valor = Number(document.getElementById('valor').value);
  const pagador = getCurrentPayer();
  const metodo = document.getElementById('metodo').value || '';
  const tomador = document.getElementById('tomador').value || '';
  const categoria = document.getElementById('categoria').value || '';

  if (!fecha) throw new Error('Fecha es obligatoria.');
  if (!tipo) throw new Error('Tipo de movimiento es obligatorio.');
  if (!Number.isFinite(valor) || valor <= 0) throw new Error('Monto total debe ser un número mayor a 0.');

  if (tipo !== 'FAMILIAR' && !pagador) throw new Error('Pagador es obligatorio.');

  const requiresCategory = tipo === 'FAMILIAR' || (tipo === 'PAGO_DEUDA' && PRIMARY_USERS.includes(pagador));
  if (requiresCategory && !categoria) throw new Error('Categoría es obligatoria.');

  const requiresMethod = tipo === 'FAMILIAR' || PRIMARY_USERS.includes(pagador);
  if (requiresMethod && !metodo) throw new Error('Método de pago es obligatorio.');

  if (tipo === 'COMPARTIDO') {
    throw new Error('Dividir gasto aún no está implementado. Próximamente...');
  }

  if (tipo === 'PAGO_DEUDA') {
    if (!tomador) throw new Error('Para PAGO_DEUDA debes seleccionar quién recibió (Tomador).');
    if (tomador === pagador) throw new Error('Pagador y Tomador no pueden ser la misma persona.');
  }

  if (tipo === 'COMPARTIDO') {
    if (!participants.length) throw new Error('Debes tener al menos 1 participante.');
    ensurePayerInParticipants();
    if (!validatePctSum()) throw new Error('Los porcentajes de participantes deben sumar 100%.');

    const lower = participants.map(p => p.name.toLowerCase());
    if (new Set(lower).size !== lower.length) throw new Error('No puedes repetir participantes.');
  }

  const contraparte =
    tipo === 'PAGO_DEUDA' ? tomador :
    tipo === 'COMPARTIDO' ? participants.map(p => p.name).filter(n => n !== pagador).join(', ') :
    '';

  return {
    fecha,
    tipo,
    descripcion,
    categoria,
    valor,
    pagador,
    contraparte,
    metodo_pago: metodo,
    participantes: tipo === 'COMPARTIDO' ? participants.map(p => ({ nombre: p.name, porcentaje: Number(p.pct || 0) })) : [],
    dividir_equitativamente: tipo === 'COMPARTIDO' ? Boolean(document.getElementById('equitable').checked) : false
  };
}

/**
 * Handle form submission
 */
async function onSubmit(e) {
  e.preventDefault();
  setStatus('', '');

  try {
    const payload = readForm();
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;

    const res = await fetch(getMovementsApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${text}`);

    setStatus('Movimiento registrado correctamente.', 'ok');
    document.getElementById('movForm').reset();

    // Restore defaults
    document.getElementById('fecha').value = getTodayLocal();
    document.getElementById('pagador').value = '';
    document.getElementById('pagadorCompartido').value = '';
    document.getElementById('tipo').value = '';
    document.getElementById('tomador').value = '';
    document.getElementById('metodo').value = '';
    document.getElementById('categoria').value = '';
    document.getElementById('equitable').checked = true;
    resetParticipants();

    onTipoChange();
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'err');
  } finally {
    document.getElementById('submitBtn').disabled = false;
  }
}

/**
 * Set status message
 */
function setStatus(msg, kind) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = msg || '';
  statusEl.className = `status ${kind || ''}`.trim();
}
