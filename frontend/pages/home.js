/**
 * Home / Dashboard Page
 *
 * Shows income summary for the current month with:
 * - Month navigation
 * - Income totals (real income vs internal movements)
 * - Expandable income list by category
 * - Placeholder for gastos (future)
 */

import { API_URL } from '../config.js';
import router from '../router.js';
import * as Navbar from '../components/navbar.js';
import { showConfirmation, showSuccess, showError } from '../utils.js';

let currentUser = null;
let currentMonth = null; // YYYY-MM format
let incomeData = null;
let isExpanded = false;

/**
 * Format number as COP currency
 */
function formatCurrency(num) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
}

/**
 * Get current month as YYYY-MM
 */
function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get month name in Spanish (capitalized, without year)
 */
function getMonthName(yearMonth) {
  const [year, month] = yearMonth.split('-');
  const date = new Date(year, parseInt(month) - 1, 1);
  const monthName = date.toLocaleDateString('es-CO', { month: 'long' });
  // Capitalize first letter
  return monthName.charAt(0).toUpperCase() + monthName.slice(1);
}

/**
 * Navigate to previous month
 */
function previousMonth(yearMonth) {
  const [year, month] = yearMonth.split('-');
  const date = new Date(year, parseInt(month) - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Navigate to next month
 */
function nextMonth(yearMonth) {
  const [year, month] = yearMonth.split('-');
  const date = new Date(year, parseInt(month) - 1, 1);
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Render income summary (collapsed)
 */
function renderIncomeSummary() {
  if (!incomeData || !incomeData.totals) {
    return `
      <div class="income-summary">
        <div class="income-header">
          <h2>💰 INGRESOS DEL MES</h2>
          <button id="toggle-income" class="btn-text">▼ Expandir</button>
        </div>
        <p class="income-total">Sin ingresos registrados</p>
        <button id="add-income-btn" style="margin-top: 16px;">+ Agregar ingreso</button>
      </div>
    `;
  }

  const totals = incomeData.totals;

  return `
    <div class="income-summary">
      <div class="income-header">
        <h2>💰 INGRESOS DEL MES</h2>
        <button id="toggle-income" class="btn-text">${isExpanded ? '▲ Colapsar' : '▼ Expandir'}</button>
      </div>
      <p class="income-total">${formatCurrency(totals.total_amount)}</p>
      <button id="add-income-btn"  style="margin-top: 16px;">+ Agregar ingreso</button>
      ${isExpanded ? renderIncomeDetails() : ''}
    </div>
  `;
}

/**
 * Render income details (expanded view)
 */
function renderIncomeDetails() {
  if (!incomeData || !incomeData.income_entries || incomeData.income_entries.length === 0) {
    return '';
  }

  const totals = incomeData.totals;
  const entries = incomeData.income_entries;

  // Group entries by type
  const byType = {};
  entries.forEach(entry => {
    if (!byType[entry.type]) {
      byType[entry.type] = [];
    }
    byType[entry.type].push(entry);
  });

  // Helper to get type label in Spanish
  const typeLabels = {
    'salary': 'Sueldo',
    'bonus': 'Bono / Prima',
    'freelance': 'Trabajo Independiente',
    'reimbursement': 'Reembolso',
    'gift': 'Regalo',
    'sale': 'Venta',
    'other_income': 'Otro Ingreso',
    'savings_withdrawal': 'Retiro de Ahorros',
    'previous_balance': 'Sobrante Mes Anterior',
    'debt_collection': 'Cobro de Deuda',
    'account_transfer': 'Transferencia entre Cuentas',
    'adjustment': 'Ajuste Contable'
  };

  // Helper to determine if type is real income
  const realIncomeTypes = ['salary', 'bonus', 'freelance', 'reimbursement', 'gift', 'sale', 'other_income'];

  let realIncomeHtml = '';
  let internalMovementsHtml = '';

  Object.keys(byType).forEach(type => {
    const typeEntries = byType[type];
    const typeTotal = typeEntries.reduce((sum, e) => sum + e.amount, 0);
    const typeLabel = typeLabels[type] || type;
    const isRealIncome = realIncomeTypes.includes(type);

    const typeHtml = `
      <div class="income-type-group">
        <div class="income-type-header">
          <strong>${typeLabel}:</strong>
          <span>${formatCurrency(typeTotal)}</span>
        </div>
        <div class="income-entries">
          ${typeEntries.map(entry => {
            const date = new Date(entry.income_date);
            const day = date.getDate();
            const monthName = date.toLocaleDateString('es-CO', { month: 'short' });
            return `
              <div class="income-entry">
                <span>• ${entry.member_name} - ${formatCurrency(entry.amount)} (${day} ${monthName})</span>
                <button class="btn-delete-income" data-income-id="${entry.id}" title="Eliminar ingreso">🗑️</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    if (isRealIncome) {
      realIncomeHtml += typeHtml;
    } else {
      internalMovementsHtml += typeHtml;
    }
  });

  return `
    <div class="income-details">
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e0e0e0;" />
      
      ${totals.real_income_amount > 0 ? `
        <div class="income-section">
          <h3 style="color: #2e7d32; margin-bottom: 12px;">INGRESO REAL: ${formatCurrency(totals.real_income_amount)}</h3>
          ${realIncomeHtml}
        </div>
      ` : ''}
      
      ${totals.internal_movements_amount > 0 ? `
        <div class="income-section" style="margin-top: 24px;">
          <h3 style="color: #666; margin-bottom: 12px;">MOVIMIENTOS INTERNOS: ${formatCurrency(totals.internal_movements_amount)}</h3>
          ${internalMovementsHtml}
        </div>
      ` : totals.real_income_amount > 0 ? `
        <div class="income-section" style="margin-top: 24px;">
          <p style="color: #666; font-style: italic;">MOVIMIENTOS INTERNOS: $0 (ninguno este mes)</p>
        </div>
      ` : ''}
      
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e0e0e0;" />
      <div class="income-total-section">
        <strong>Total registrado: ${formatCurrency(totals.total_amount)}</strong>
      </div>
    </div>
  `;
}

/**
 * Render home page
 */
export function render(user) {
  currentUser = user;
  if (!currentMonth) {
    currentMonth = getCurrentMonth();
  }

  const monthName = getMonthName(currentMonth);

  return `
    <main class="card">
      <header class="header">
        <div class="header-row">
          <h1>Home</h1>
          ${Navbar.render(user, '/')}
        </div>
      </header>

      <div class="month-navigation">
        <button id="prev-month-btn" class="btn-nav">← ${getMonthName(previousMonth(currentMonth))}</button>
        <h2 id="current-month-label">${monthName}</h2>
        <button id="next-month-btn" class="btn-nav">${getMonthName(nextMonth(currentMonth))} →</button>
      </div>

      <div id="income-container">
        ${renderIncomeSummary()}
      </div>

      <div class="expenses-placeholder" style="margin-top: 32px; padding: 24px; background-color: #f5f5f5; border-radius: 8px; text-align: center;">
        <h2 style="color: #666; margin-bottom: 8px;">📊 Gastos</h2>
        <p style="color: #999;">Próximamente: Los gastos se mostrarán aquí cuando los migremos a la base de datos.</p>
      </div>
    </main>
  `;
}

/**
 * Load income data for the current month
 */
async function loadIncomeData() {
  try {
    const response = await fetch(`${API_URL}/income?month=${currentMonth}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('Error loading income data:', response.status);
      incomeData = null;
      return;
    }

    incomeData = await response.json();
  } catch (error) {
    console.error('Error loading income data:', error);
    incomeData = null;
  }
}

/**
 * Refresh income display
 */
function refreshIncomeDisplay() {
  const container = document.getElementById('income-container');
  if (container) {
    container.innerHTML = renderIncomeSummary();
    setupIncomeListeners();
  }
}

/**
 * Setup income-related event listeners
 */
/**
 * Handle delete income
 */
async function handleDeleteIncome(incomeId) {
  const confirmed = await showConfirmation(
    '¿Eliminar ingreso?',
    '¿Estás seguro de que quieres eliminar este ingreso? Esta acción no se puede deshacer.'
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${API_URL}/income/${incomeId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Error al eliminar el ingreso');
    }

    showSuccess('Ingreso eliminado', 'El ingreso se eliminó correctamente');
    
    // Reload income data and refresh display
    await loadIncomeData();
    refreshIncomeDisplay();
  } catch (error) {
    console.error('Error deleting income:', error);
    showError(error.message || 'Error al eliminar el ingreso');
  }
}

/**
 * Setup income event listeners
 */
function setupIncomeListeners() {
  const toggleBtn = document.getElementById('toggle-income');
  const addBtn = document.getElementById('add-income-btn');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isExpanded = !isExpanded;
      refreshIncomeDisplay();
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=INGRESO');
    });
  }

  // Delete income buttons
  const deleteButtons = document.querySelectorAll('.btn-delete-income');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const incomeId = btn.dataset.incomeId;
      await handleDeleteIncome(incomeId);
    });
  });
}

/**
 * Setup page
 */
export async function setup() {
  Navbar.setup();

  // Load income data
  await loadIncomeData();
  refreshIncomeDisplay();

  // Update month label
  const monthLabel = document.getElementById('current-month-label');
  if (monthLabel) {
    monthLabel.textContent = getMonthName(currentMonth);
  }

  // Month navigation
  const prevBtn = document.getElementById('prev-month-btn');
  const nextBtn = document.getElementById('next-month-btn');

  if (prevBtn) {
    prevBtn.addEventListener('click', async () => {
      currentMonth = previousMonth(currentMonth);
      
      // Update all labels
      const monthLabel = document.getElementById('current-month-label');
      if (monthLabel) {
        monthLabel.textContent = getMonthName(currentMonth);
      }
      
      // Update navigation button labels (calculate AFTER currentMonth changed)
      const prevMonth = previousMonth(currentMonth);
      const nextMon = nextMonth(currentMonth);
      prevBtn.textContent = `← ${getMonthName(prevMonth)}`;
      nextBtn.textContent = `${getMonthName(nextMon)} →`;
      
      await loadIncomeData();
      refreshIncomeDisplay();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
      currentMonth = nextMonth(currentMonth);
      
      // Update all labels
      const monthLabel = document.getElementById('current-month-label');
      if (monthLabel) {
        monthLabel.textContent = getMonthName(currentMonth);
      }
      
      // Update navigation button labels (calculate AFTER currentMonth changed)
      const prevMonth = previousMonth(currentMonth);
      const nextMon = nextMonth(currentMonth);
      prevBtn.textContent = `← ${getMonthName(prevMonth)}`;
      nextBtn.textContent = `${getMonthName(nextMon)} →`;
      
      await loadIncomeData();
      refreshIncomeDisplay();
    });
  }
}
