const N8N_CREATE_URL = "https://n8n.blanquicet.com.co/webhook/movimientos/reportar";
const X_API_KEY = "__X_API_KEY__";

const DEFAULT_USERS = [
  "Caro",
  "Jose",
  "Maria Isabel",
  "Papá Caro",
  "Mamá Caro",
  "Daniel",
  "Yury",
  "Prebby",
  "Kelly Carolina"
];
const STORAGE_KEY_USERS = "gastos_users_v1";

// Usuarios que requieren método de pago
const PRIMARY_USERS = ["Jose", "Caro"];

// Métodos de pago disponibles para Jose y Caro
const PAYMENT_METHODS = [
  "Débito Jose",
  "AMEX Jose",
  "MasterCard Oro Jose",
  "Débito Caro",
  "Nu Caro"
];

const CATEGORIES = [
  "Pago de SOAT/impuestos/mantenimiento",
  "Carro - Seguro",
  "Uber/Gasolina/Peajes/Parqueaderos",
  "Casa - Gastos fijos",
  "Casa - Cositas para casa",
  "Casa - Provisionar mes entrante",
  "Kellys",
  "Mercado",
  "Ahorros para SOAT/impuestos/mantenimiento",
  "Ahorros para cosas de la casa",
  "Ahorros para vacaciones",
  "Ahorros para regalos",
  "Salidas juntos",
  "Vacaciones",
  "Inversiones Caro",
  "Inversiones Jose",
  "Inversiones Juntos",
  "Regalos",
  "Caro - Gastos fijos",
  "Caro - Vida cotidiana",
  "Jose - Gastos fijos",
  "Jose - Vida cotidiana",
  "Gastos médicos",
  "Caro - Imprevistos",
  "Jose - Imprevistos",
  "Casa - Imprevistos",
  "Carro - Imprevistos",
  "Préstamo"
];

// DOM
const form = document.getElementById("movForm");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");

const fechaEl = document.getElementById("fecha");
const tipoEl = document.getElementById("tipo");
const descEl = document.getElementById("descripcion");
const valorEl = document.getElementById("valor");

// PAGO_DEUDA: pagador + tomador en fila
const pagadorTomadorRow = document.getElementById("pagadorTomadorRow");
const pagadorEl = document.getElementById("pagador");
const tomadorEl = document.getElementById("tomador");

// COMPARTIDO: pagador solo
const pagadorWrap = document.getElementById("pagadorWrap");
const pagadorCompartidoEl = document.getElementById("pagadorCompartido");
const pagadorLabel = document.getElementById("pagadorLabel");

const metodoWrap = document.getElementById("metodoWrap");
const metodoEl = document.getElementById("metodo");

const participantesWrap = document.getElementById("participantesWrap");
const equitableEl = document.getElementById("equitable");
const participantsListEl = document.getElementById("participantsList");
const addParticipantBtn = document.getElementById("addParticipantBtn");
const categoriaEl = document.getElementById("categoria");

// State
let users = loadUsers();
let participants = []; // [{ name, pct }]

// Helper: get today's date as YYYY-MM-DD in local timezone
function getTodayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: get current payer based on movement type
function getCurrentPayer() {
  const tipo = tipoEl.value;
  if (tipo === "PAGO_DEUDA") return pagadorEl.value || "";
  if (tipo === "COMPARTIDO") return pagadorCompartidoEl.value || "";
  return ""; // FAMILIAR no tiene pagador
}

init();

function init() {
  // default date = today (local timezone)
  fechaEl.value = getTodayLocal();

  renderUserSelect(pagadorEl, users, true);
  renderUserSelect(pagadorCompartidoEl, users, true);
  renderUserSelect(tomadorEl, users, true);
  renderCategorySelect();

  // Default participants for COMPARTIDO: pagador + 1 (si hay)
  resetParticipants();

  tipoEl.addEventListener("change", onTipoChange);
  pagadorEl.addEventListener("change", onPagadorChange);
  pagadorCompartidoEl.addEventListener("change", onPagadorChange);
  equitableEl.addEventListener("change", onEquitableChange);

  addParticipantBtn.addEventListener("click", onAddParticipant);

  form.addEventListener("submit", onSubmit);

  // Initial UI
  onTipoChange();
  onPagadorChange();
}

function setStatus(msg, kind) {
  statusEl.textContent = msg || "";
  statusEl.className = `status ${kind || ""}`.trim();
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    if (!raw) return [...DEFAULT_USERS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_USERS];
    return dedupe(parsed.map(x => String(x).trim()).filter(Boolean));
  } catch {
    return [...DEFAULT_USERS];
  }
}

function saveUsers(list) {
  localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(list));
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const key = x.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(x);
    }
  }
  return out;
}

function renderUserSelect(selectEl, list, includePlaceholder) {
  const current = selectEl.value;
  selectEl.innerHTML = "";

  if (includePlaceholder) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Seleccionar";
    opt.disabled = true;
    opt.selected = true;
    selectEl.appendChild(opt);
  }

  for (const u of list) {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    selectEl.appendChild(opt);
  }

  // restore previous selection if possible
  if (list.includes(current)) selectEl.value = current;

  // ensure something selected when no placeholder
  if (!includePlaceholder && list.length > 0 && !selectEl.value) {
    selectEl.value = list[0];
  }

  // if includePlaceholder, don't pre-select anyone
  if (includePlaceholder && !selectEl.value) {
    selectEl.selectedIndex = 0;
  }
}

function renderCategorySelect() {
  categoriaEl.innerHTML = "";
  const base = document.createElement("option");
  base.value = "";
  base.textContent = "Seleccionar";
  base.disabled = true;
  base.selected = true;
  categoriaEl.appendChild(base);

  for (const c of CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    categoriaEl.appendChild(opt);
  }
}


function onTipoChange() {
  const tipo = tipoEl.value;

  // FAMILIAR: hide all pagador fields, show payment method
  const isFamiliar = tipo === "FAMILIAR";
  
  // PAGO_DEUDA: show pagador + tomador row
  const isPagoDeuda = tipo === "PAGO_DEUDA";
  pagadorTomadorRow.classList.toggle("hidden", !isPagoDeuda);
  
  // COMPARTIDO: show pagador solo
  const isCompartido = tipo === "COMPARTIDO";
  pagadorWrap.classList.toggle("hidden", !isCompartido);
  participantesWrap.classList.toggle("hidden", !isCompartido);

  // Payment method
  if (isFamiliar) {
    showPaymentMethods(true);
  } else {
    onPagadorChange();
  }

  // Clear selections when hidden
  if (!isPagoDeuda) {
    pagadorEl.value = "";
    tomadorEl.value = "";
  }
  if (!isCompartido) {
    pagadorCompartidoEl.value = "";
  }

  // If switched to COMPARTIDO ensure participants have payer
  if (isCompartido) {
    ensurePayerInParticipants();
    computeEquitablePcts();
    renderParticipants();
  }
}

function showPaymentMethods(required) {
  metodoEl.innerHTML = "";
  const base = document.createElement("option");
  base.value = "";
  base.textContent = "Seleccionar";
  base.selected = true;
  metodoEl.appendChild(base);

  for (const m of PAYMENT_METHODS) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    metodoEl.appendChild(opt);
  }

  metodoWrap.classList.remove("hidden");
  metodoEl.required = required;
}

function onPagadorChange() {
  const tipo = tipoEl.value;
  const payer = getCurrentPayer();

  // For FAMILIAR, payment method is always shown (handled in onTipoChange)
  // For other types, only show if payer is Jose or Caro
  if (tipo !== "FAMILIAR") {
    const requiresMethod = PRIMARY_USERS.includes(payer);

    if (requiresMethod) {
      showPaymentMethods(true);
    } else {
      metodoWrap.classList.add("hidden");
      metodoEl.required = false;
      metodoEl.value = "";
    }
  }

  // Reset participants if COMPARTIDO (when payer changes)
  if (tipo === "COMPARTIDO") {
    resetParticipants();
  }
}

function onEquitableChange() {
  if (equitableEl.checked) {
    computeEquitablePcts();
  }
  renderParticipants();
}

function ensurePayerInParticipants() {
  const payer = getCurrentPayer();
  if (!payer) return;
  if (!participants.some(p => p.name === payer)) {
    participants.unshift({ name: payer, pct: 0 });
  }
  // remove duplicates
  participants = dedupeParticipants(participants);
}

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

function resetParticipants() {
  // Default: payer
  const payer = pagadorCompartidoEl.value || "";

  participants = [];
  if (payer) participants.push({ name: payer, pct: 0 });

  computeEquitablePcts();
  renderParticipants();
}

function computeEquitablePcts() {
  if (!participants.length) return;
  const n = participants.length;
  const base = Math.floor(10000 / n) / 100; // 2 decimals
  let total = 0;

  for (let i = 0; i < participants.length; i++) {
    let pct = base;
    total += pct;
    participants[i].pct = pct;
  }

  // adjust last to sum to 100.00
  const diff = Math.round((100 - total) * 100) / 100;
  participants[participants.length - 1].pct = Math.round((participants[participants.length - 1].pct + diff) * 100) / 100;
}

function renderParticipants() {
  participantsListEl.innerHTML = "";

  // only relevant if COMPARTIDO
  if (tipoEl.value !== "COMPARTIDO") return;

  const editable = !equitableEl.checked;

  participants.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = "participantRow";

    // name select
    const nameSel = document.createElement("select");
    for (const u of users) {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      if (u === p.name) opt.selected = true;
      nameSel.appendChild(opt);
    }
    nameSel.addEventListener("change", () => {
      participants[idx].name = nameSel.value;
      participants = dedupeParticipants(participants);
      if (equitableEl.checked) computeEquitablePcts();
      renderParticipants();
    });

    // pct input
    const pctWrap = document.createElement("div");
    pctWrap.className = "pctWrap";

    const pctInput = document.createElement("input");
    pctInput.type = "number";
    pctInput.min = "0";
    pctInput.max = "100";
    pctInput.step = "0.01";
    pctInput.value = String(p.pct ?? 0);
    pctInput.disabled = !editable;

    pctInput.addEventListener("input", () => {
      const v = Number(pctInput.value);
      participants[idx].pct = Number.isFinite(v) ? v : 0;
      validatePctSum();
    });

    const pctHint = document.createElement("span");
    pctHint.className = "pill";
    pctHint.textContent = "%";

    pctWrap.appendChild(pctInput);

    // delete
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "ghost";
    delBtn.textContent = "×";
    delBtn.title = "Quitar";
    delBtn.addEventListener("click", () => {
      participants.splice(idx, 1);
      ensurePayerInParticipants();
      if (equitableEl.checked) computeEquitablePcts();
      renderParticipants();
    });

    row.appendChild(nameSel);
    row.appendChild(pctWrap);
    row.appendChild(delBtn);

    participantsListEl.appendChild(row);
  });

  validatePctSum();
}

function validatePctSum() {
  if (tipoEl.value !== "COMPARTIDO") return true;
  if (equitableEl.checked) return true;

  const sum = participants.reduce((acc, p) => acc + Number(p.pct || 0), 0);
  const ok = Math.abs(sum - 100) < 0.01;

  if (!ok) {
    setStatus(`La suma de porcentajes debe ser 100%. Actualmente: ${sum.toFixed(2)}%.`, "err");
  } else {
    setStatus("", "");
  }
  return ok;
}

function onAddParticipant() {
  // add next available user not in list, else add first
  const used = new Set(participants.map(p => p.name));
  const candidate = users.find(u => !used.has(u)) || users[0];
  if (!candidate) return;

  participants.push({ name: candidate, pct: 0 });
  participants = dedupeParticipants(participants);

  if (equitableEl.checked) computeEquitablePcts();
  renderParticipants();
}

function readForm() {
  const tipo = tipoEl.value;
  const fecha = (fechaEl.value || "").slice(0, 10);
  const descripcion = (descEl.value || "").trim();
  const valor = Number(valorEl.value);
  const pagador = getCurrentPayer();
  const metodo = metodoEl.value || "";
  const tomador = tomadorEl.value || "";
  const categoria = categoriaEl.value || "";

  if (!fecha) throw new Error("Fecha es obligatoria.");
  if (!tipo) throw new Error("Tipo de movimiento es obligatorio.");
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("Monto total debe ser un número mayor a 0.");

  // Pagador es obligatorio solo para tipos que no son FAMILIAR
  if (tipo !== "FAMILIAR" && !pagador) throw new Error("Pagador es obligatorio.");

  // Categoría es obligatoria para FAMILIAR, o para PAGO_DEUDA si pagador es Jose/Caro
  const requiresCategory = tipo === "FAMILIAR" || (tipo === "PAGO_DEUDA" && PRIMARY_USERS.includes(pagador));
  if (requiresCategory && !categoria) throw new Error("Categoría es obligatoria.");

  // Método de pago: obligatorio para FAMILIAR o si pagador es Jose/Caro
  const requiresMethod = tipo === "FAMILIAR" || PRIMARY_USERS.includes(pagador);
  if (requiresMethod && !metodo) {
    throw new Error("Método de pago es obligatorio.");
  }

  if (tipo === "PAGO_DEUDA") {
    if (!tomador) throw new Error("Para PAGO_DEUDA debes seleccionar quién recibió (Tomador).");
    if (tomador === pagador) throw new Error("Pagador y Tomador no pueden ser la misma persona.");
  }

  if (tipo === "COMPARTIDO") {
    if (!participants.length) throw new Error("Debes tener al menos 1 participante.");
    ensurePayerInParticipants();

    if (!validatePctSum()) throw new Error("Los porcentajes de participantes deben sumar 100%.");

    // no permitir duplicados en participantes (por seguridad)
    const lower = participants.map(p => p.name.toLowerCase());
    if (new Set(lower).size !== lower.length) throw new Error("No puedes repetir participantes.");
  }

  // Compatibilidad con tu tabla actual:
  // - tipo: va a "Tipo de gasto"
  // - pagador: "Pagador"
  // - contraparte: para PAGO_DEUDA tomador; para COMPARTIDO se envía lista; para FAMILIAR vacío
  const contraparte =
    tipo === "PAGO_DEUDA" ? tomador :
    tipo === "COMPARTIDO" ? participants.map(p => p.name).filter(n => n !== pagador).join(", ") :
    "";

  return {
    fecha,
    tipo,
    descripcion,
    categoria,
    valor,
    pagador,
    contraparte,
    metodo_pago: metodo,

    // Para COMPARTIDO: payload enriquecido (para que luego n8n pueda expandir deudas si quieres)
    participantes: tipo === "COMPARTIDO" ? participants.map(p => ({ nombre: p.name, porcentaje: Number(p.pct || 0) })) : [],
    dividir_equitativamente: tipo === "COMPARTIDO" ? Boolean(equitableEl.checked) : false
  };
}

async function onSubmit(e) {
  e.preventDefault();
  setStatus("", "");

  try {
    const payload = readForm();

    submitBtn.disabled = true;

    const res = await fetch(N8N_CREATE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(X_API_KEY ? { "X-API-Key": X_API_KEY } : {})
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${text}`);

    setStatus("Movimiento registrado correctamente.", "ok");
    form.reset();

    // restore defaults after reset
    fechaEl.value = getTodayLocal();
    pagadorEl.value = "";
    pagadorCompartidoEl.value = "";
    tipoEl.value = "";
    tomadorEl.value = "";
    metodoEl.value = "";
    categoriaEl.value = "";
    equitableEl.checked = true;
    resetParticipants();

    onTipoChange();
  } catch (err) {
    setStatus(`Error: ${err.message}`, "err");
  } finally {
    submitBtn.disabled = false;
  }
}
