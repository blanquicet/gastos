/**
 * Home / Dashboard Page
 *
 * Modern dashboard showing income summary with:
 * - Tab navigation (Gastos | Ingresos | Préstamos | Tarjetas)
 * - Month selector with date range
 * - Total amount prominently displayed
 * - Category breakdown with icons and percentages
 */

import { API_URL } from '../config.js';
import router from '../router.js';
import * as Navbar from '../components/navbar.js';
import { showConfirmation, showSuccess, showError } from '../utils.js';

let currentUser = null;
let currentMonth = null; // YYYY-MM format
let incomeData = null;
let movementsData = null; // Gastos data (filtered)
let originalMovementsData = null; // Original unfiltered movements data from API
let loansData = null; // Préstamos data (debts consolidation)
let loanMovements = null; // SPLIT and DEBT_PAYMENT movements for loans
let activeTab = 'gastos'; // 'gastos', 'ingresos', 'prestamos', 'tarjetas' - DEFAULT TO GASTOS
let householdMembers = []; // List of household members for filtering
let selectedMemberIds = []; // Array of selected member IDs (empty = all)
let selectedIncomeTypes = []; // Array of selected income types (empty = all)
let selectedCategories = []; // Array of selected categories for gastos filter (empty = all)
let selectedPaymentMethods = []; // Array of selected payment method IDs for gastos filter (empty = all)
let isFilterOpen = false; // Track if filter dropdown is open

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
 * Format date and time (e.g., "18 Dic - 12:03")
 */
function formatDateTime(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const day = date.getDate();
  
  // Get month abbreviation and capitalize properly (Ene, Feb, Mar, etc.)
  const monthLong = date.toLocaleDateString('es-CO', { month: 'short' });
  const month = monthLong.replace('.', '').charAt(0).toUpperCase() + monthLong.replace('.', '').slice(1);
  
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day} ${month} - ${hours}:${minutes}`;
}

/**
 * Format date only (e.g., "18 Dic 2024")
 */
function formatDate(dateString) {
  if (!dateString) return '';
  
  // Extract just the date part (YYYY-MM-DD) from ISO timestamp
  const datePart = dateString.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  
  // Create date in local timezone (avoid UTC conversion issues)
  const date = new Date(year, month - 1, day);
  
  // Check if date is valid
  if (isNaN(date.getTime())) return '';
  
  // Get month abbreviation and capitalize properly (Ene, Feb, Mar, etc.)
  const monthLong = date.toLocaleDateString('es-CO', { month: 'short' });
  const monthName = monthLong.replace('.', '').charAt(0).toUpperCase() + monthLong.replace('.', '').slice(1);
  
  return `${day} ${monthName} ${year}`;
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
 * Get month name for display (e.g., "Enero")
 */
function getMonthDateRange(yearMonth) {
  return getMonthName(yearMonth);
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
 * Get icon for income type
 */
function getIncomeTypeIcon(type) {
  const icons = {
    'salary': '💰',
    'bonus': '🎁',
    'reimbursement': '↩️',
    'other_income': '💵',
    'savings_withdrawal': '🐷',
    'previous_balance': '📊',
    'adjustment': '🔧'
  };
  return icons[type] || '💵';
}

/**
 * Get icon for movement category
 */
function getCategoryIcon(category) {
  const icons = {
    // Casa
    'Casa - Gastos fijos': '🏠',
    'Casa - Provisionar mes entrante': '💰',
    'Casa - Cositas para casa': '🏡',
    'Casa - Imprevistos': '⚡',
    'Kellys': '🧹',
    'Mercado': '🛒',
    'Regalos': '🎁',
    
    // Jose
    'Jose - Vida cotidiana': '🤴🏾',
    'Jose - Gastos fijos': '👨‍💼',
    'Jose - Imprevistos': '⚡',
    
    // Caro
    'Caro - Vida cotidiana': '👸',
    'Caro - Gastos fijos': '👩‍💼',
    'Caro - Imprevistos': '⚡',
    
    // Carro
    'Uber/Gasolina/Peajes/Parqueaderos': '🏎️',
    'Pago de SOAT/impuestos/mantenimiento': '📋',
    'Carro - Seguro': '🏎️',
    'Carro - Imprevistos': '⚡',
    
    // Ahorros
    'Ahorros para SOAT/impuestos/mantenimiento': '🏦',
    'Ahorros para cosas de la casa': '🏦',
    'Ahorros para vacaciones': '🏦',
    'Ahorros para regalos': '🏦',
    
    // Inversiones
    'Inversiones Caro': '📈',
    'Inversiones Jose': '📈',
    'Inversiones Juntos': '📈',
    
    // Diversión
    'Vacaciones': '✈️',
    'Salidas juntos': '🍽️',
    
    // Ungrouped
    'Gastos médicos': '⚕️',
    'Préstamo': '💸'
  };
  return icons[category] || '💵';
}

/**
 * Render tab navigation
 */
function renderTabs() {
  return `
    <div class="tabs-container">
      <button class="tab-scroll-btn tab-scroll-left" aria-label="Scroll left">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
        </svg>
      </button>
      <div class="tabs-wrapper">
        <div class="dashboard-tabs">
          <button class="tab-btn ${activeTab === 'gastos' ? 'active' : ''}" data-tab="gastos">Gastos</button>
          <button class="tab-btn ${activeTab === 'ingresos' ? 'active' : ''}" data-tab="ingresos">Ingresos</button>
          <button class="tab-btn ${activeTab === 'prestamos' ? 'active' : ''}" data-tab="prestamos">Préstamos</button>
          <button class="tab-btn ${activeTab === 'tarjetas' ? 'active' : ''}" data-tab="tarjetas">Tarjetas de crédito</button>
        </div>
      </div>
      <button class="tab-scroll-btn tab-scroll-right" aria-label="Scroll right">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
  `;
}

/**
 * Render month selector
 */
function renderMonthSelector() {
  return `
    <div class="month-selector">
      <button id="prev-month-btn" class="month-nav-btn">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"/>
        </svg>
      </button>
      <div class="month-display">${getMonthDateRange(currentMonth)}</div>
      <button id="next-month-btn" class="month-nav-btn">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"/>
        </svg>
      </button>
    </div>
  `;
}

/**
 * Get income type categories with labels
 */
function getIncomeTypeCategories() {
  return {
    'Ingresos': ['salary', 'bonus', 'other_income'],
    'Movimientos': ['reimbursement', 'savings_withdrawal', 'previous_balance', 'adjustment']
  };
}

/**
 * Get label for income type
 */
function getIncomeTypeLabel(type) {
  const labels = {
    'salary': 'Sueldo',
    'bonus': 'Bono / Prima',
    'reimbursement': 'Reembolsos',
    'other_income': 'Otro Ingreso',
    'savings_withdrawal': 'Retiro de Ahorros',
    'previous_balance': 'Sobrante Mes Anterior',
    'adjustment': 'Ajustes'
  };
  return labels[type] || type;
}

/**
 * Render filter dropdown
 */
function renderFilterDropdown() {
  const categories = getIncomeTypeCategories();
  const allTypes = Object.values(categories).flat();
  
  // If no filters are set, all are shown (checked)
  // If filters are set, only those in the array are shown (checked)
  // null means "show none" (no checkboxes checked)
  const showAllMembers = Array.isArray(selectedMemberIds) && selectedMemberIds.length === 0;
  const showAllTypes = Array.isArray(selectedIncomeTypes) && selectedIncomeTypes.length === 0;
  
  const ingresosTypes = categories['Ingresos'];
  const movimientosTypes = categories['Movimientos'];
  
  // Check if all items in a category are selected
  const allIngresosSelected = showAllTypes || (selectedIncomeTypes && ingresosTypes.every(t => selectedIncomeTypes.includes(t)));
  const allMovimientosSelected = showAllTypes || (selectedIncomeTypes && movimientosTypes.every(t => selectedIncomeTypes.includes(t)));

  return `
    <div class="filter-dropdown" id="filter-dropdown" style="display: ${isFilterOpen ? 'block' : 'none'}">
      <div class="filter-section">
        <div class="filter-section-header">
          <span class="filter-section-title">Miembros del hogar</span>
          <div class="filter-section-actions">
            <button class="filter-link-btn" id="select-all-members">Todos</button>
            <button class="filter-link-btn" id="clear-all-members">Limpiar</button>
          </div>
        </div>
        <div class="filter-options">
          ${householdMembers.map(member => {
            const isChecked = showAllMembers || (selectedMemberIds && selectedMemberIds.includes(member.id));
            return `
              <label class="filter-checkbox-label">
                <input type="checkbox" class="filter-checkbox" 
                       data-filter-type="member" 
                       data-value="${member.id}" 
                       ${isChecked ? 'checked' : ''}>
                <span>${member.name}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>

      <div class="filter-section">
        <div class="filter-section-header">
          <span class="filter-section-title">Tipo de ingreso</span>
          <div class="filter-section-actions">
            <button class="filter-link-btn" id="select-all-types">Todos</button>
            <button class="filter-link-btn" id="clear-all-types">Limpiar</button>
          </div>
        </div>
        
        <div class="filter-category">
          <label class="filter-checkbox-label filter-category-label" data-category-toggle="Ingresos">
            <input type="checkbox" class="filter-checkbox filter-category-checkbox" 
                   data-category="Ingresos"
                   ${allIngresosSelected ? 'checked' : ''}>
            <span>Ingresos</span>
            <svg class="category-toggle-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.293 5.293a1 1 0 011.414 0L8 7.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
            </svg>
          </label>
          <div class="filter-options filter-sub-options collapsed" data-category-content="Ingresos">
            ${ingresosTypes.map(type => {
              const isChecked = showAllTypes || (selectedIncomeTypes && selectedIncomeTypes.includes(type));
              return `
                <label class="filter-checkbox-label">
                  <input type="checkbox" class="filter-checkbox" 
                         data-filter-type="income-type" 
                         data-category="Ingresos"
                         data-value="${type}" 
                         ${isChecked ? 'checked' : ''}>
                  <span>${getIncomeTypeLabel(type)}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div class="filter-category">
          <label class="filter-checkbox-label filter-category-label" data-category-toggle="Movimientos">
            <input type="checkbox" class="filter-checkbox filter-category-checkbox" 
                   data-category="Movimientos"
                   ${allMovimientosSelected ? 'checked' : ''}>
            <span>Movimientos</span>
            <svg class="category-toggle-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.293 5.293a1 1 0 011.414 0L8 7.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
            </svg>
          </label>
          <div class="filter-options filter-sub-options collapsed" data-category-content="Movimientos">
            ${movimientosTypes.map(type => {
              const isChecked = showAllTypes || (selectedIncomeTypes && selectedIncomeTypes.includes(type));
              return `
                <label class="filter-checkbox-label">
                  <input type="checkbox" class="filter-checkbox" 
                         data-filter-type="income-type" 
                         data-category="Movimientos"
                         data-value="${type}" 
                         ${isChecked ? 'checked' : ''}>
                  <span>${getIncomeTypeLabel(type)}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="filter-footer">
        <button class="btn-secondary btn-small" id="clear-all-filters">Mostrar todo</button>
        <button class="btn-primary btn-small" id="apply-filters">Aplicar</button>
      </div>
    </div>
  `;
}

/**
 * Render income categories
 */
function renderIncomeCategories() {
  // Check if we have any active filters
  // Empty array [] means "show all" (no filter)
  // null or non-empty array means filter is active
  const hasMemberFilter = selectedMemberIds === null || (Array.isArray(selectedMemberIds) && selectedMemberIds.length > 0);
  const hasTypeFilter = selectedIncomeTypes === null || (Array.isArray(selectedIncomeTypes) && selectedIncomeTypes.length > 0);
  const hasActiveFilters = hasMemberFilter || hasTypeFilter;
  
  if (!incomeData || !incomeData.income_entries || incomeData.income_entries.length === 0) {
    const message = hasActiveFilters 
      ? 'No hay ingresos que coincidan con los filtros seleccionados'
      : 'No hay ingresos registrados este mes';
    
    return `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>${message}</p>
        ${!hasActiveFilters ? '<button id="add-income-btn-empty" class="btn-primary">+ Agregar ingreso</button>' : ''}
      </div>
      <div class="floating-actions">
        <button id="filter-btn" class="btn-filter-floating" title="Filtrar">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 10.414V17a1 1 0 01-.447.894l-2 1.333A1 1 0 018 18.333V10.414L3.293 5.707A1 1 0 013 5V3z"/>
          </svg>
        </button>
        ${renderFilterDropdown()}
        <button id="add-income-btn" class="btn-add-floating">+</button>
      </div>
    `;
  }

  const entries = incomeData.income_entries;
  const total = incomeData.totals.total_amount;

  // Group entries by type
  const byType = {};
  entries.forEach(entry => {
    if (!byType[entry.type]) {
      byType[entry.type] = { total: 0, entries: [] };
    }
    byType[entry.type].total += entry.amount;
    byType[entry.type].entries.push(entry);
  });

  // Helper to get type label in Spanish
  const typeLabels = {
    'salary': 'Sueldo',
    'bonus': 'Bono / Prima',
    'reimbursement': 'Reembolsos',
    'other_income': 'Otro Ingreso',
    'savings_withdrawal': 'Retiro de Ahorros',
    'previous_balance': 'Sobrante Mes Anterior',
    'adjustment': 'Ajustes'
  };

  const categoriesHtml = Object.keys(byType)
    .sort((a, b) => byType[b].total - byType[a].total)
    .map(type => {
      const data = byType[type];
      const percentage = ((data.total / total) * 100).toFixed(2);
      const icon = getIncomeTypeIcon(type);
      const label = typeLabels[type] || type;

      return `
        <div class="category-card" data-type="${type}">
          <div class="category-header">
            <div class="category-icon">${icon}</div>
            <div class="category-info">
              <div class="category-name">${label}</div>
              <div class="category-amount">${formatCurrency(data.total)}</div>
            </div>
            <div class="category-percentage">${percentage}%</div>
          </div>
          <div class="category-details hidden" id="details-${type}">
            ${data.entries.map(entry => `
              <div class="income-detail-entry">
                <div class="entry-info">
                  <span class="entry-description">${entry.description || entry.member_name}</span>
                  <span class="entry-amount">${formatCurrency(entry.amount)}</span>
                  <div class="entry-date">${formatDate(entry.income_date)}</div>
                </div>
                <div class="entry-actions">
                  <span class="entry-member-badge">${entry.member_name}</span>
                  <button class="three-dots-btn" data-income-id="${entry.id}">⋮</button>
                  <div class="three-dots-menu" id="income-menu-${entry.id}">
                    <button class="menu-item" data-action="delete" data-id="${entry.id}">Eliminar</button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

  return `
    <!-- Filter loading overlay -->
    <div class="filter-loading-overlay" id="filter-loading" style="display: none;">
      <div class="spinner"></div>
      <p>Filtrando...</p>
    </div>
    <div class="categories-grid">
      ${categoriesHtml}
    </div>
    <div class="floating-actions">
      <button id="filter-btn" class="btn-filter-floating" title="Filtrar">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 10.414V17a1 1 0 01-.447.894l-2 1.333A1 1 0 018 18.333V10.414L3.293 5.707A1 1 0 013 5V3z"/>
        </svg>
      </button>
      ${renderFilterDropdown()}
      <button id="add-income-btn" class="btn-add-floating">+</button>
    </div>
  `;
}

/**
 * Render loans cards (Level 1: debt pairs with net amounts)
 */
function renderLoansCards() {
  if (!loansData || !loansData.balances || loansData.balances.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">💸</div>
        <p>No hay préstamos pendientes este mes</p>
      </div>
    `;
  }

  const balances = loansData.balances;

  const cardsHtml = balances.map(balance => {
    return `
      <div class="expense-group-card" data-debtor-id="${balance.debtor_id}" data-creditor-id="${balance.creditor_id}">
        <div class="expense-group-header">
          <div class="expense-group-icon">🤝</div>
          <div class="expense-group-info">
            <div class="expense-group-name">${balance.debtor_name} → ${balance.creditor_name}</div>
            <div class="expense-group-amount">${formatCurrency(balance.amount)}</div>
          </div>
        </div>
        <div class="expense-group-details hidden" id="loan-details-${balance.debtor_id}-${balance.creditor_id}">
          <!-- Level 2 content will be rendered here when expanded -->
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="categories-grid">
      ${cardsHtml}
    </div>
  `;
}

/**
 * Render loan details (Level 2: breakdown by direction)
 */
function renderLoanDetails(debtorId, creditorId) {
  if (!loanMovements || loanMovements.length === 0) {
    return '<p class="no-data">No hay movimientos disponibles</p>';
  }

  // Calculate amounts for each direction
  let debtorOwesCreditor = 0; // Debtor owes Creditor
  let creditorOwesDebtor = 0; // Creditor owes Debtor

  loanMovements.forEach(movement => {
    if (movement.type === 'SPLIT') {
      // For SPLIT: participants owe the payer
      const payerId = movement.payer_id;
      
      // Check if payer is creditor and debtor is a participant
      if (payerId === creditorId) {
        const participant = movement.participants.find(p => p.participant_user_id === debtorId);
        if (participant) {
          debtorOwesCreditor += movement.amount * participant.percentage;
        }
      }
      
      // Check if payer is debtor and creditor is a participant
      if (payerId === debtorId) {
        const participant = movement.participants.find(p => p.participant_user_id === creditorId);
        if (participant) {
          creditorOwesDebtor += movement.amount * participant.percentage;
        }
      }
    } else if (movement.type === 'DEBT_PAYMENT') {
      // For DEBT_PAYMENT: payer pays receiver, reducing debt
      const payerId = movement.payer_id;
      const receiverId = movement.receiver_id;
      
      // Payment from debtor to creditor reduces debtorOwesCreditor
      if (payerId === debtorId && receiverId === creditorId) {
        creditorOwesDebtor += movement.amount; // Shown as reverse debt
      }
      
      // Payment from creditor to debtor
      if (payerId === creditorId && receiverId === debtorId) {
        debtorOwesCreditor += movement.amount; // Shown as reverse debt
      }
    }
  });

  // Get names from loansData
  const balance = loansData.balances.find(b => b.debtor_id === debtorId && b.creditor_id === creditorId);
  const debtorName = balance?.debtor_name || 'Desconocido';
  const creditorName = balance?.creditor_name || 'Desconocido';

  let html = '';

  // Show "Debtor owes Creditor" if > 0
  if (debtorOwesCreditor > 0.01) {
    html += `
      <div class="expense-category-item" data-direction="debtor-owes" data-debtor-id="${debtorId}" data-creditor-id="${creditorId}">
        <div class="category-item-icon">💰</div>
        <div class="category-item-info">
          <div class="category-item-name">${debtorName} le debe a ${creditorName}</div>
          <div class="category-item-amount">${formatCurrency(debtorOwesCreditor)}</div>
        </div>
        <div class="category-item-expand">›</div>
      </div>
      <div class="category-movements hidden" id="loan-movements-debtor-${debtorId}-${creditorId}">
        <!-- Level 3 content will be rendered here -->
      </div>
    `;
  }

  // Show "Creditor owes Debtor" if > 0
  if (creditorOwesDebtor > 0.01) {
    html += `
      <div class="expense-category-item" data-direction="creditor-owes" data-debtor-id="${debtorId}" data-creditor-id="${creditorId}">
        <div class="category-item-icon">💰</div>
        <div class="category-item-info">
          <div class="category-item-name">${creditorName} le debe a ${debtorName}</div>
          <div class="category-item-amount">${formatCurrency(creditorOwesDebtor)}</div>
        </div>
        <div class="category-item-expand">›</div>
      </div>
      <div class="category-movements hidden" id="loan-movements-creditor-${debtorId}-${creditorId}">
        <!-- Level 3 content will be rendered here -->
      </div>
    `;
  }

  return html;
}

/**
 * Render loan movements (Level 3: individual movements for a direction)
 */
function renderLoanMovements(debtorId, creditorId, direction) {
  if (!loanMovements || loanMovements.length === 0) {
    return '<p class="no-data">No hay movimientos</p>';
  }

  const relevantMovements = [];

  loanMovements.forEach(movement => {
    if (movement.type === 'SPLIT') {
      const payerId = movement.payer_id;
      
      if (direction === 'debtor-owes') {
        // Debtor owes Creditor: creditor is payer, debtor is participant
        if (payerId === creditorId) {
          const participant = movement.participants.find(p => p.participant_user_id === debtorId);
          if (participant) {
            relevantMovements.push({
              ...movement,
              displayAmount: movement.amount * participant.percentage,
              percentage: participant.percentage
            });
          }
        }
      } else if (direction === 'creditor-owes') {
        // Creditor owes Debtor: debtor is payer, creditor is participant
        if (payerId === debtorId) {
          const participant = movement.participants.find(p => p.participant_user_id === creditorId);
          if (participant) {
            relevantMovements.push({
              ...movement,
              displayAmount: movement.amount * participant.percentage,
              percentage: participant.percentage
            });
          }
        }
      }
    } else if (movement.type === 'DEBT_PAYMENT') {
      const payerId = movement.payer_id;
      const receiverId = movement.receiver_id;
      
      if (direction === 'debtor-owes') {
        // Show payments FROM creditor TO debtor (creates debt for debtor)
        if (payerId === creditorId && receiverId === debtorId) {
          relevantMovements.push({
            ...movement,
            displayAmount: movement.amount
          });
        }
      } else if (direction === 'creditor-owes') {
        // Show payments FROM debtor TO creditor (creates debt for creditor)
        if (payerId === debtorId && receiverId === creditorId) {
          relevantMovements.push({
            ...movement,
            displayAmount: movement.amount
          });
        }
      }
    }
  });

  if (relevantMovements.length === 0) {
    return '<p class="no-data">No hay movimientos</p>';
  }

  const movementsHtml = relevantMovements.map(movement => {
    const typeLabel = movement.type === 'SPLIT' ? 'Gasto compartido' : 'Pago de deuda';
    const percentageInfo = movement.percentage ? ` (${(movement.percentage * 100).toFixed(2)}%)` : '';
    
    return `
      <div class="movement-detail-entry">
        <div class="movement-info">
          <div class="movement-description">
            ${movement.description || typeLabel}${percentageInfo}
          </div>
          <div class="movement-meta">
            <span class="movement-date">${formatDate(movement.movement_date)}</span>
            ${movement.category ? `<span class="movement-category-badge">${getCategoryIcon(movement.category)} ${movement.category}</span>` : ''}
          </div>
        </div>
        <div class="movement-actions">
          <span class="movement-amount">${formatCurrency(movement.displayAmount)}</span>
          <button class="three-dots-btn" data-movement-id="${movement.id}">⋮</button>
          <div class="three-dots-menu" id="movement-menu-${movement.id}">
            <button class="menu-item" data-action="edit" data-id="${movement.id}">Editar</button>
            <button class="menu-item" data-action="delete" data-id="${movement.id}">Eliminar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return movementsHtml;
}

/**
 * Render home page
 */
export function render(user) {
  currentUser = user;
  if (!currentMonth) {
    currentMonth = getCurrentMonth();
  }

  const totalAmount = activeTab === 'gastos'
    ? (movementsData?.totals?.total_amount || 0)
    : (incomeData?.totals?.total_amount || 0);

  return `
    <main class="card">
      <header class="header">
        <div class="header-row">
          <h1>Hogar</h1>
          ${Navbar.render(user, '/')}
        </div>
      </header>

      ${renderTabs()}
      
      <div class="dashboard-content">
        ${activeTab === 'gastos' && movementsData ? `
          ${renderMonthSelector()}
          
          <div class="total-display">
            <div class="total-label">Total</div>
            <div class="total-amount">${formatCurrency(totalAmount)}</div>
          </div>

          <div id="categories-container">
            ${renderMovementCategories()}
          </div>
        ` : activeTab === 'gastos' ? `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Cargando...</p>
          </div>
        ` : activeTab === 'ingresos' && incomeData ? `
          ${renderMonthSelector()}
          
          <div class="total-display">
            <div class="total-label">Total</div>
            <div class="total-amount">${formatCurrency(totalAmount)}</div>
          </div>

          <div id="categories-container">
            ${renderIncomeCategories()}
          </div>
        ` : activeTab === 'ingresos' ? `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Cargando...</p>
          </div>
        ` : activeTab === 'prestamos' && loansData ? `
          ${renderMonthSelector()}
          
          <div id="loans-container">
            ${renderLoansCards()}
          </div>
        ` : activeTab === 'prestamos' ? `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Cargando...</p>
          </div>
        ` : `
          <div class="coming-soon">
            <div class="coming-soon-icon">💳</div>
            <p>Próximamente</p>
          </div>
        `}
      </div>
    </main>
  `;
}

/**
 * Load household members for filtering
 */
async function loadHouseholdMembers() {
  try {
    const response = await fetch(`${API_URL}/movement-form-config`, {
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('Error loading household members:', response.status);
      householdMembers = [];
      return;
    }

    const data = await response.json();
    // Filter only members (not contacts)
    householdMembers = data.users.filter(u => u.type === 'member');
  } catch (error) {
    console.error('Error loading household members:', error);
    householdMembers = [];
  }
}

/**
 * Load income data for the current month
 */
async function loadIncomeData() {
  try {
    let url = `${API_URL}/income?month=${currentMonth}`;
    
    // Note: Backend only supports single member_id filter
    // We'll do client-side filtering for multiple members and types
    
    const response = await fetch(url, {
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('Error loading income data:', response.status);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      incomeData = null;
      return;
    }

    const data = await response.json();
    
    // Client-side filtering
    if (data && data.income_entries) {
      let filteredEntries = data.income_entries;
      
      
      // Filter by members if specific members selected
      if (selectedMemberIds === null) {
        // null means show nothing
        filteredEntries = [];
      } else if (selectedMemberIds.length > 0) {
        filteredEntries = filteredEntries.filter(entry => {
          // member_id is a UUID string, compare directly
          const isIncluded = selectedMemberIds.includes(entry.member_id);
          return isIncluded;
        });
      } else {
      }
      // else: selectedMemberIds is empty array, show all (no filter)
      
      // Filter by income types if specific types selected
      if (selectedIncomeTypes === null) {
        // null means show nothing
        filteredEntries = [];
      } else if (selectedIncomeTypes.length > 0) {
        filteredEntries = filteredEntries.filter(entry => 
          selectedIncomeTypes.includes(entry.type)
        );
      } else {
      }
      // else: selectedIncomeTypes is empty array, show all (no filter)
      
      // Recalculate totals
      const totalAmount = filteredEntries.reduce((sum, entry) => sum + entry.amount, 0);
      
      incomeData = {
        income_entries: filteredEntries,
        totals: {
          total_amount: totalAmount
        }
      };
    } else {
      incomeData = data;
    }
    
  } catch (error) {
    console.error('Error loading income data:', error);
    incomeData = null;
  }
}

/**
 * Load movements data for the current month (HOUSEHOLD + SPLIT with household participation)
 */
async function loadMovementsData() {
  try {
    // Load both HOUSEHOLD and SPLIT movements
    const [householdResponse, splitResponse] = await Promise.all([
      fetch(`${API_URL}/movements?type=HOUSEHOLD&month=${currentMonth}`, {
        credentials: 'include'
      }),
      fetch(`${API_URL}/movements?type=SPLIT&month=${currentMonth}`, {
        credentials: 'include'
      })
    ]);

    if (!householdResponse.ok || !splitResponse.ok) {
      console.error('Error loading movements data');
      movementsData = null;
      return;
    }

    const householdData = await householdResponse.json();
    const splitData = await splitResponse.json();
    
    // Process SPLIT movements: filter and adjust amounts
    const processedSplitMovements = [];
    if (splitData.movements && splitData.movements.length > 0) {
      splitData.movements.forEach(movement => {
        // Find household member IDs from participants
        const householdMemberIds = householdMembers.map(m => m.id);
        const householdParticipants = movement.participants.filter(p => 
          p.participant_user_id && householdMemberIds.includes(p.participant_user_id)
        );
        
        // Only include if at least one household member is a participant
        if (householdParticipants.length > 0) {
          // Sum percentages for all household members
          const totalHouseholdPercentage = householdParticipants.reduce(
            (sum, p) => sum + p.percentage, 
            0
          );
          
          // Adjust amount based on household participation
          const adjustedAmount = movement.amount * totalHouseholdPercentage;
          
          // Create adjusted movement
          processedSplitMovements.push({
            ...movement,
            amount: adjustedAmount,
            original_amount: movement.amount, // Keep original for reference
            household_percentage: totalHouseholdPercentage,
            is_split: true // Mark as SPLIT for visual distinction
          });
        }
      });
    }
    
    // Combine HOUSEHOLD and processed SPLIT movements
    const allMovements = [
      ...(householdData.movements || []),
      ...processedSplitMovements
    ];
    
    // Save original unfiltered data
    originalMovementsData = {
      movements: allMovements,
      category_groups: householdData.category_groups
    };
    
    // Client-side filtering
    let filteredMovements = allMovements;
    
    // Filter by categories if specific categories selected
    if (selectedCategories === null) {
      filteredMovements = [];
    } else if (selectedCategories.length > 0) {
      filteredMovements = filteredMovements.filter(movement => {
        const isIncluded = selectedCategories.includes(movement.category);
        return isIncluded;
      });
    }
    
    // Filter by payment methods if specific payment methods selected
    if (selectedPaymentMethods === null) {
      filteredMovements = [];
    } else if (selectedPaymentMethods.length > 0) {
      filteredMovements = filteredMovements.filter(movement => 
        selectedPaymentMethods.includes(movement.payment_method_id)
      );
    }
    
    // Recalculate totals
    const totalAmount = filteredMovements.reduce((sum, movement) => sum + movement.amount, 0);
    
    // Recalculate by_category totals
    const byCategory = {};
    filteredMovements.forEach(movement => {
      if (movement.category) {
        byCategory[movement.category] = (byCategory[movement.category] || 0) + movement.amount;
      }
    });
    
    movementsData = {
      movements: filteredMovements,
      totals: {
        total_amount: totalAmount,
        by_category: byCategory
      },
      category_groups: householdData.category_groups
    };
    
  } catch (error) {
    console.error('Error loading movements data:', error);
    movementsData = null;
  }
}

/**
 * Load loans data for the current month (debts consolidation + movements)
 */
async function loadLoansData() {
  try {
    // Load debts consolidation and movements in parallel
    const [consolidationResponse, splitResponse, debtPaymentResponse] = await Promise.all([
      fetch(`${API_URL}/movements/debts/consolidate?month=${currentMonth}`, {
        credentials: 'include'
      }),
      fetch(`${API_URL}/movements?type=SPLIT&month=${currentMonth}`, {
        credentials: 'include'
      }),
      fetch(`${API_URL}/movements?type=DEBT_PAYMENT&month=${currentMonth}`, {
        credentials: 'include'
      })
    ]);

    if (!consolidationResponse.ok || !splitResponse.ok || !debtPaymentResponse.ok) {
      console.error('Error loading loans data');
      loansData = null;
      loanMovements = null;
      return;
    }

    loansData = await consolidationResponse.json();
    const splitData = await splitResponse.json();
    const debtPaymentData = await debtPaymentResponse.json();
    
    // Combine SPLIT and DEBT_PAYMENT movements
    loanMovements = [
      ...(splitData.movements || []),
      ...(debtPaymentData.movements || [])
    ];
    
  } catch (error) {
    console.error('Error loading loans data:', error);
    loansData = null;
    loanMovements = null;
  }
}

/**
 * Get category groups from API response or build from available categories
 */
function getCategoryGroups() {
  // If API provided category groups, use them directly
  if (movementsData?.category_groups && movementsData.category_groups.length > 0) {
    return movementsData.category_groups;
  }
  
  // Fallback: return empty array if no backend data
  return [];
}

/**
 * Render filter dropdown for movements (gastos)
 */
function renderMovementsFilterDropdown() {
  // Get unique categories and payment methods from current data
  const allCategories = movementsData?.movements
    ? [...new Set(movementsData.movements
        .filter(m => m.category !== 'Préstamo') // Exclude Préstamo from filter
        .map(m => m.category)
        .filter(Boolean))]
    : [];
   
  // Use original unfiltered data for payment methods list
  const dataSource = originalMovementsData || movementsData;
  const allPaymentMethods = dataSource?.movements
    ? [...new Set(dataSource.movements
        .filter(m => m.payment_method_id && m.payment_method_name)
        .map(m => ({ id: m.payment_method_id, name: m.payment_method_name })))]
    : [];
  
  // Deduplicate payment methods by ID
  const uniquePaymentMethods = Array.from(
    new Map(allPaymentMethods.map(pm => [pm.id, pm])).values()
  );
  
  const groupedCategories = getCategoryGroups();
  
  const showAllCategories = Array.isArray(selectedCategories) && selectedCategories.length === 0;
  const showAllPaymentMethods = Array.isArray(selectedPaymentMethods) && selectedPaymentMethods.length === 0;
  
  return `
    <div class="filter-dropdown" id="filter-dropdown" style="display: ${isFilterOpen ? 'block' : 'none'}">
      <div class="filter-section">
        <div class="filter-section-header">
          <span class="filter-section-title">Categorías</span>
          <div class="filter-section-actions">
            <button class="filter-link-btn" id="select-all-categories">Todos</button>
            <button class="filter-link-btn" id="clear-all-categories">Limpiar</button>
          </div>
        </div>
        
        ${groupedCategories.map(group => {
          const allGroupChecked = showAllCategories || group.categories.every(c => selectedCategories.includes(c));
          
          return `
            <div class="filter-category">
              <label class="filter-checkbox-label filter-category-label" data-category-toggle="${group.name}">
                <input type="checkbox" class="filter-checkbox filter-category-checkbox" 
                       data-category-group="${group.name}"
                       ${allGroupChecked ? 'checked' : ''}>
                <span>${group.name}</span>
                <svg class="category-toggle-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.293 5.293a1 1 0 011.414 0L8 7.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
                </svg>
              </label>
              <div class="filter-options filter-sub-options collapsed" data-category-content="${group.name}">
                ${group.categories.map(category => {
                  const isChecked = showAllCategories || selectedCategories.includes(category);
                  return `
                    <label class="filter-checkbox-label">
                      <input type="checkbox" class="filter-checkbox" 
                             data-filter-type="category" 
                             data-category-group="${group.name}"
                             data-value="${category}" 
                             ${isChecked ? 'checked' : ''}>
                      <span>${category}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="filter-section">
        <div class="filter-section-header">
          <span class="filter-section-title">Métodos de pago</span>
          <div class="filter-section-actions">
            <button class="filter-link-btn" id="select-all-payment-methods">Todos</button>
            <button class="filter-link-btn" id="clear-all-payment-methods">Limpiar</button>
          </div>
        </div>
        <div class="filter-options">
          ${uniquePaymentMethods.map(pm => {
            const isChecked = showAllPaymentMethods || selectedPaymentMethods.includes(pm.id);
            return `
              <label class="filter-checkbox-label">
                <input type="checkbox" class="filter-checkbox" 
                       data-filter-type="payment-method" 
                       data-value="${pm.id}" 
                       ${isChecked ? 'checked' : ''}>
                <span>${pm.name}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>

      <div class="filter-footer">
        <button class="btn-secondary btn-small" id="clear-all-filters">Mostrar todo</button>
        <button class="btn-primary btn-small" id="apply-filters">Aplicar</button>
      </div>
    </div>
  `;
}

/**
 * Get icon for category group
 */
function getCategoryGroupIcon(groupName) {
  const icons = {
    'Casa': '🏠',
    'Jose': '🤴🏾',
    'Caro': '👸',
    'Carro': '🏎️',
    'Ahorros': '🏦',
    'Inversiones': '📈',
    'Diversión': '🎉'
  };
  return icons[groupName] || '📦';
}

/**
 * Strip group prefix from category name for display
 */
function getSimplifiedCategoryName(category, groupName) {
  // If category starts with "GroupName - ", remove it
  const prefix = `${groupName} - `;
  if (category.startsWith(prefix)) {
    return category.substring(prefix.length);
  }
  return category;
}

/**
 * Render movement categories (gastos) grouped by category groups
 */
function renderMovementCategories() {
  const hasActiveFilters = 
    (selectedCategories !== null && selectedCategories.length > 0) ||
    (selectedPaymentMethods !== null && selectedPaymentMethods.length > 0);
  
  if (!movementsData || !movementsData.movements || movementsData.movements.length === 0) {
    const message = hasActiveFilters 
      ? 'No hay gastos que coincidan con los filtros seleccionados'
      : 'No hay gastos registrados este mes';
    
    return `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <p>${message}</p>
        ${!hasActiveFilters ? '<button id="add-expense-btn-empty" class="btn-primary">+ Agregar gasto</button>' : ''}
      </div>
      <div class="floating-actions">
        <button id="filter-btn" class="btn-filter-floating" title="Filtrar">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 10.414V17a1 1 0 01-.447.894l-2 1.333A1 1 0 018 18.333V10.414L3.293 5.707A1 1 0 013 5V3z"/>
          </svg>
        </button>
        ${renderMovementsFilterDropdown()}
        <button id="add-expense-btn" class="btn-add-floating">+</button>
      </div>
    `;
  }

  const movements = movementsData.movements;
  const total = movementsData.totals.total_amount;
  const categoryGroups = getCategoryGroups();

  // Filter out "Préstamo" category from the view
  const filteredMovements = movements.filter(m => m.category !== 'Préstamo');

  // Build a map of category -> group name for quick lookup
  const categoryToGroup = {};
  categoryGroups.forEach(group => {
    group.categories.forEach(cat => {
      categoryToGroup[cat] = group.name;
    });
  });
  
  // Group movements by category group
  const byGroup = {};
  filteredMovements.forEach(movement => {
    const category = movement.category || 'Sin categoría';
    const groupName = categoryToGroup[category] || 'Otros';
    
    if (!byGroup[groupName]) {
      byGroup[groupName] = { 
        total: 0, 
        categories: {} 
      };
    }
    
    if (!byGroup[groupName].categories[category]) {
      byGroup[groupName].categories[category] = {
        total: 0,
        movements: []
      };
    }
    
    byGroup[groupName].total += movement.amount;
    byGroup[groupName].categories[category].total += movement.amount;
    byGroup[groupName].categories[category].movements.push(movement);
  });

  // Sort groups by total (descending)
  const sortedGroups = Object.keys(byGroup).sort((a, b) => 
    byGroup[b].total - byGroup[a].total
  );

  const groupsHtml = sortedGroups.map(groupName => {
    const groupData = byGroup[groupName];
    const groupPercentage = ((groupData.total / total) * 100).toFixed(1);
    const groupIcon = getCategoryGroupIcon(groupName);
    const safeGroupId = groupName.replace(/[^a-zA-Z0-9]/g, '_');

    // Sort categories within group by total (descending)
    const sortedCategories = Object.keys(groupData.categories).sort((a, b) => 
      groupData.categories[b].total - groupData.categories[a].total
    );

    return `
      <div class="expense-group-card" data-group="${groupName}">
        <div class="expense-group-header">
          <div class="expense-group-icon-container">
            <span class="expense-group-icon">${groupIcon}</span>
          </div>
          <div class="expense-group-info">
            <div class="expense-group-name">${groupName}</div>
            <div class="expense-group-amount">${formatCurrency(groupData.total)}</div>
          </div>
          <div class="expense-group-actions">
            <span class="expense-group-percentage">${groupPercentage}%</span>
            <svg class="expense-group-chevron" width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
        <div class="expense-group-details hidden" id="group-details-${safeGroupId}">
          ${sortedCategories.map(category => {
            const categoryData = groupData.categories[category];
            const categoryPercentage = ((categoryData.total / groupData.total) * 100).toFixed(1);
            const simplifiedName = getSimplifiedCategoryName(category, groupName);
            const safeCategoryId = category.replace(/[^a-zA-Z0-9]/g, '_');
            
            // Sort movements by date (most recent first)
            const sortedMovements = categoryData.movements.sort((a, b) => 
              new Date(b.movement_date) - new Date(a.movement_date)
            );

            return `
              <div class="expense-category-item" data-category="${category}">
                <div class="expense-category-header">
                  <div class="expense-category-info">
                    <span class="expense-category-name">${simplifiedName}</span>
                    <span class="expense-category-amount">${formatCurrency(categoryData.total)}</span>
                  </div>
                </div>
                <div class="expense-category-details hidden" id="category-details-${safeCategoryId}">
                  ${sortedMovements.map(movement => `
                    <div class="movement-detail-entry">
                      <div class="entry-info">
                        <span class="entry-description">${movement.description || 'Sin descripción'}</span>
                        <span class="entry-amount">${formatCurrency(movement.amount)}</span>
                        <div class="entry-date">${formatDate(movement.movement_date)}</div>
                      </div>
                      <div class="entry-actions">
                        ${movement.is_split 
                          ? `<span class="entry-split-badge">🤝 Compartido</span>` 
                          : movement.payment_method_name 
                            ? `<span class="entry-payment-badge">${movement.payment_method_name}</span>` 
                            : ''
                        }
                        <button class="three-dots-btn" data-movement-id="${movement.id}">⋮</button>
                        <div class="three-dots-menu" id="movement-menu-${movement.id}">
                          <button class="menu-item" data-action="edit" data-id="${movement.id}">Editar</button>
                          <button class="menu-item" data-action="delete" data-id="${movement.id}">Eliminar</button>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  return `
    <!-- Filter loading overlay -->
    <div class="filter-loading-overlay" id="filter-loading" style="display: none;">
      <div class="spinner"></div>
      <p>Filtrando...</p>
    </div>
    <div class="categories-grid">
      ${groupsHtml}
    </div>
    <div class="floating-actions">
      <button id="filter-btn" class="btn-filter-floating" title="Filtrar">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 10.414V17a1 1 0 01-.447.894l-2 1.333A1 1 0 018 18.333V10.414L3.293 5.707A1 1 0 013 5V3z"/>
        </svg>
      </button>
      ${renderMovementsFilterDropdown()}
      <button id="add-expense-btn" class="btn-add-floating">+</button>
    </div>
  `;
}

/**
 * Refresh display (handles gastos, ingresos, and prestamos tabs)
 */
function refreshDisplay() {
  const container = document.getElementById('categories-container');
  const loansContainer = document.getElementById('loans-container');
  
  if (container) {
    if (activeTab === 'gastos') {
      container.innerHTML = renderMovementCategories();
    } else if (activeTab === 'ingresos') {
      container.innerHTML = renderIncomeCategories();
    }
    setupCategoryListeners();
    setupFilterListeners(); // Re-setup filter listeners after re-render
  }
  
  if (loansContainer && activeTab === 'prestamos') {
    loansContainer.innerHTML = renderLoansCards();
    setupLoansListeners();
  }

  const totalEl = document.querySelector('.total-amount');
  if (totalEl) {
    const totalAmount = activeTab === 'gastos' 
      ? (movementsData?.totals?.total_amount || 0)
      : (incomeData?.totals?.total_amount || 0);
    totalEl.textContent = formatCurrency(totalAmount);
  }

  const monthEl = document.querySelector('.month-display');
  if (monthEl) {
    monthEl.textContent = getMonthDateRange(currentMonth);
  }
}

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
    refreshDisplay();
  } catch (error) {
    console.error('Error deleting income:', error);
    showError(error.message || 'Error al eliminar el ingreso');
  }
}

/**
 * Handle edit movement
 */
async function handleEditMovement(movementId) {
  // Navigate to edit form with movement ID
  router.navigate(`/registrar-movimiento?tipo=GASTO&edit=${movementId}`);
}

/**
 * Handle delete movement
 */
async function handleDeleteMovement(movementId) {
  const confirmed = await showConfirmation(
    '¿Eliminar gasto?',
    '¿Estás seguro de que quieres eliminar este gasto? Esta acción no se puede deshacer.'
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${API_URL}/movements/${movementId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Error al eliminar el movimiento');
    }

    showSuccess('Gasto eliminado', 'El gasto se eliminó correctamente');
    
    // Reload movements data and refresh display
    await loadMovementsData();
    refreshDisplay();
  } catch (error) {
    console.error('Error deleting movement:', error);
    showError(error.message || 'Error al eliminar el movimiento');
  }
}


/**
 * Setup category card listeners (for both gastos and ingresos)
 */
function setupCategoryListeners() {
  // Expense group card click to expand/collapse (for gastos)
  const groupCards = document.querySelectorAll('.expense-group-card');
  groupCards.forEach(card => {
    card.querySelector('.expense-group-header')?.addEventListener('click', () => {
      const groupName = card.dataset.group;
      if (groupName) {
        const safeId = groupName.replace(/[^a-zA-Z0-9]/g, '_');
        const details = document.getElementById(`group-details-${safeId}`);
        const chevron = card.querySelector('.expense-group-chevron');
        if (details) {
          details.classList.toggle('hidden');
          if (chevron) {
            chevron.classList.toggle('rotated');
          }
        }
      }
    });
  });

  // Expense category item click to expand/collapse (for gastos sub-categories)
  const categoryItems = document.querySelectorAll('.expense-category-item');
  categoryItems.forEach(item => {
    item.querySelector('.expense-category-header')?.addEventListener('click', () => {
      const category = item.dataset.category;
      if (category) {
        const safeId = category.replace(/[^a-zA-Z0-9]/g, '_');
        const details = document.getElementById(`category-details-${safeId}`);
        if (details) {
          details.classList.toggle('hidden');
        }
      }
    });
  });

  // Category card click to expand/collapse (for ingresos)
  const categoryCards = document.querySelectorAll('.category-card:not(.category-group-card)');
  categoryCards.forEach(card => {
    card.querySelector('.category-header')?.addEventListener('click', () => {
      // For income cards, use dataset.type
      const identifier = card.dataset.type;
      if (identifier) {
        const safeId = identifier.replace(/[^a-zA-Z0-9]/g, '_');
        const details = document.getElementById(`details-${safeId}`);
        if (details) {
          details.classList.toggle('hidden');
        }
      }
    });
  });

  // Three-dots menu toggle for income entries (only for ingresos tab)
  document.querySelectorAll('.three-dots-btn[data-income-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const incomeId = e.currentTarget.dataset.incomeId;
      const menu = document.getElementById(`income-menu-${incomeId}`);
      const isOpen = menu.style.display === 'block';
      
      // Close all menus
      document.querySelectorAll('.three-dots-menu').forEach(m => {
        m.style.display = 'none';
        m.classList.remove('menu-above');
      });
      
      // Toggle this menu
      if (!isOpen) {
        // Check if menu would overflow bottom of viewport
        const btnRect = btn.getBoundingClientRect();
        const menuHeight = 80; // Approximate height of menu with 2 items
        const spaceBelow = window.innerHeight - btnRect.bottom;
        
        // If not enough space below, position above
        if (spaceBelow < menuHeight) {
          menu.classList.add('menu-above');
        }
        
        menu.style.display = 'block';
      }
    });
  });

  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.entry-actions') && !e.target.closest('.three-dots-menu')) {
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
    }
  });

  // Menu action buttons (for income only)
  document.querySelectorAll('.three-dots-menu .menu-item').forEach(btn => {
    // Get parent menu
    const menu = btn.closest('.three-dots-menu');
    
    // Skip if this menu is for movements (has movement-menu-* id)
    if (menu && menu.id.startsWith('movement-menu-')) return;
    
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = e.currentTarget.dataset.action;
      const id = e.currentTarget.dataset.id;

      // Close menu
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');

      if (action === 'delete') {
        await handleDeleteIncome(id);
      }
    });
  });

  // Three-dots menu toggle for movement entries (only for gastos tab)
  document.querySelectorAll('.three-dots-btn[data-movement-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const movementId = e.currentTarget.dataset.movementId;
      const menu = document.getElementById(`movement-menu-${movementId}`);
      const isOpen = menu.style.display === 'block';
      
      // Close all menus
      document.querySelectorAll('.three-dots-menu').forEach(m => {
        m.style.display = 'none';
        m.classList.remove('menu-above');
      });
      
      // Toggle this menu
      if (!isOpen) {
        // Check if menu would overflow bottom of viewport
        const btnRect = btn.getBoundingClientRect();
        const menuHeight = 80; // Approximate height of menu with 2 items
        const spaceBelow = window.innerHeight - btnRect.bottom;
        
        // If not enough space below, position above
        if (spaceBelow < menuHeight) {
          menu.classList.add('menu-above');
        }
        
        menu.style.display = 'block';
      }
    });
  });

  // Menu action buttons (for movements)
  document.querySelectorAll('.three-dots-menu .menu-item[data-action]').forEach(btn => {
    // Only for movement menus (not income)
    const menu = btn.closest('.three-dots-menu');
    if (!menu || !menu.id.startsWith('movement-menu-')) return;
    
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = e.currentTarget.dataset.action;
      const id = e.currentTarget.dataset.id;

      // Close menu
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');

      if (action === 'edit') {
        await handleEditMovement(id);
      } else if (action === 'delete') {
        await handleDeleteMovement(id);
      }
    });
  });

  // Add income button (in category list)
  const addIncomeBtn = document.getElementById('add-income-btn');
  if (addIncomeBtn) {
    addIncomeBtn.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=INGRESO');
    });
  }

  // Add income button (in empty state)
  const addIncomeBtnEmpty = document.getElementById('add-income-btn-empty');
  if (addIncomeBtnEmpty) {
    addIncomeBtnEmpty.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=INGRESO');
    });
  }

  // Add expense button (in category list)
  const addExpenseBtn = document.getElementById('add-expense-btn');
  if (addExpenseBtn) {
    addExpenseBtn.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=GASTO');
    });
  }

  // Add expense button (in empty state)
  const addExpenseBtnEmpty = document.getElementById('add-expense-btn-empty');
  if (addExpenseBtnEmpty) {
    addExpenseBtnEmpty.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=GASTO');
    });
  }

  // Filter button toggle
  const filterBtn = document.getElementById('filter-btn');
  if (filterBtn) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isFilterOpen = !isFilterOpen;
      const dropdown = document.getElementById('filter-dropdown');
      if (dropdown) {
        dropdown.style.display = isFilterOpen ? 'block' : 'none';
      }
    });
  }

  // Setup filter event listeners
  setupFilterListeners();
}

/**
 * Setup loans view listeners (for prestamos tab)
 */
function setupLoansListeners() {
  console.log('Setting up loans listeners...');
  // Debt pair card click to expand/collapse (Level 1 → Level 2)
  const loanCards = document.querySelectorAll('.expense-group-card[data-debtor-id]');
  console.log('Found loan cards:', loanCards.length);
  loanCards.forEach(card => {
    const header = card.querySelector('.expense-group-header');
    if (header) {
      header.addEventListener('click', () => {
        console.log('Card clicked!');
        const debtorId = parseInt(card.dataset.debtorId);
        const creditorId = parseInt(card.dataset.creditorId);
        console.log('Debtor ID:', debtorId, 'Creditor ID:', creditorId);
        const detailsContainer = document.getElementById(`loan-details-${debtorId}-${creditorId}`);
        console.log('Details container:', detailsContainer);
        
        if (detailsContainer) {
          const isHidden = detailsContainer.classList.contains('hidden');
          
          if (isHidden) {
            // Render Level 2 content
            console.log('Rendering loan details...');
            detailsContainer.innerHTML = renderLoanDetails(debtorId, creditorId);
            detailsContainer.classList.remove('hidden');
            
            // Setup listeners for newly rendered elements
            setupLoanDetailsListeners(debtorId, creditorId);
          } else {
            console.log('Hiding details...');
            detailsContainer.classList.add('hidden');
          }
        }
      });
    }
  });
}

/**
 * Setup loan details listeners (Level 2 direction items)
 */
function setupLoanDetailsListeners(debtorId, creditorId) {
  // Direction item click to expand/collapse (Level 2 → Level 3)
  const directionItems = document.querySelectorAll(`.expense-category-item[data-debtor-id="${debtorId}"][data-creditor-id="${creditorId}"]`);
  
  directionItems.forEach(item => {
    item.addEventListener('click', () => {
      const direction = item.dataset.direction;
      const movementsContainer = document.getElementById(`loan-movements-${direction}-${debtorId}-${creditorId}`);
      
      if (movementsContainer) {
        const isHidden = movementsContainer.classList.contains('hidden');
        
        if (isHidden) {
          // Render Level 3 content
          movementsContainer.innerHTML = renderLoanMovements(debtorId, creditorId, direction);
          movementsContainer.classList.remove('hidden');
          
          // Setup listeners for movement actions
          setupLoanMovementListeners();
        } else {
          movementsContainer.classList.add('hidden');
        }
      }
    });
  });
}

/**
 * Setup loan movement action listeners (Level 3)
 */
function setupLoanMovementListeners() {
  // Three-dots menu toggle for loan movements
  document.querySelectorAll('.three-dots-btn[data-movement-id]').forEach(btn => {
    // Skip if already has listener
    if (btn.dataset.listenerAdded) return;
    btn.dataset.listenerAdded = 'true';
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const movementId = e.currentTarget.dataset.movementId;
      const menu = document.getElementById(`movement-menu-${movementId}`);
      const isOpen = menu && menu.style.display === 'block';
      
      // Close all menus
      document.querySelectorAll('.three-dots-menu').forEach(m => {
        m.style.display = 'none';
        m.classList.remove('menu-above');
      });
      
      // Toggle this menu
      if (!isOpen && menu) {
        // Check if menu would overflow bottom of viewport
        const btnRect = btn.getBoundingClientRect();
        const menuHeight = 80;
        const spaceBelow = window.innerHeight - btnRect.bottom;
        
        if (spaceBelow < menuHeight) {
          menu.classList.add('menu-above');
        }
        
        menu.style.display = 'block';
      }
    });
  });
  
  // Menu action buttons for loan movements
  document.querySelectorAll('.three-dots-menu .menu-item[data-action]').forEach(btn => {
    // Skip if already has listener or not a movement menu
    if (btn.dataset.listenerAdded) return;
    const menu = btn.closest('.three-dots-menu');
    if (!menu || !menu.id.startsWith('movement-menu-')) return;
    
    btn.dataset.listenerAdded = 'true';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = e.currentTarget.dataset.action;
      const id = e.currentTarget.dataset.id;

      // Close menu
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');

      if (action === 'edit') {
        await handleEditMovement(id);
      } else if (action === 'delete') {
        await handleDeleteLoanMovement(id);
      }
    });
  });
  
  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.movement-actions') && !e.target.closest('.three-dots-menu')) {
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
    }
  });
}

/**
 * Handle delete loan movement (reloads loans data after deletion)
 */
async function handleDeleteLoanMovement(movementId) {
  const confirmed = await showConfirmation(
    '¿Eliminar movimiento?',
    'Esta acción no se puede deshacer.'
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${API_URL}/movements/${movementId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Error al eliminar el movimiento');
    }

    showSuccess('Movimiento eliminado', 'El movimiento se eliminó correctamente');
    
    // Reload loans data and refresh display
    await loadLoansData();
    refreshDisplay();
  } catch (error) {
    console.error('Error deleting loan movement:', error);
    showError(error.message || 'Error al eliminar el movimiento');
  }
}

/**
 * Setup filter dropdown event listeners (handles both gastos and ingresos)
 */
function setupFilterListeners() {
  // Close filter dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('filter-dropdown');
    const filterBtn = document.getElementById('filter-btn');
    if (dropdown && filterBtn && !dropdown.contains(e.target) && !filterBtn.contains(e.target)) {
      isFilterOpen = false;
      dropdown.style.display = 'none';
    }
  });

  if (activeTab === 'gastos') {
    setupMovementsFilterListeners();
  } else if (activeTab === 'ingresos') {
    setupIncomeFilterListeners();
  }
}

/**
 * Setup filter listeners for movements (gastos tab)
 */
function setupMovementsFilterListeners() {
  // Get all unique categories from loaded data
  const allCategories = movementsData?.movements 
    ? [...new Set(movementsData.movements.map(m => m.category).filter(Boolean))]
    : [];
  
  const allPaymentMethods = movementsData?.movements
    ? [...new Set(movementsData.movements
        .filter(m => m.payment_method_id)
        .map(m => m.payment_method_id))]
    : [];

  // Select all categories
  const selectAllCategories = document.getElementById('select-all-categories');
  if (selectAllCategories) {
    selectAllCategories.addEventListener('click', () => {
      selectedCategories = [];
      document.querySelectorAll('[data-filter-type="category"]').forEach(cb => cb.checked = true);
      document.querySelectorAll('.filter-category-checkbox').forEach(cb => cb.checked = true);
    });
  }

  // Clear all categories
  const clearAllCategories = document.getElementById('clear-all-categories');
  if (clearAllCategories) {
    clearAllCategories.addEventListener('click', () => {
      selectedCategories = [];
      document.querySelectorAll('[data-filter-type="category"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('.filter-category-checkbox').forEach(cb => cb.checked = false);
    });
  }

  // Select all payment methods
  const selectAllPaymentMethods = document.getElementById('select-all-payment-methods');
  if (selectAllPaymentMethods) {
    selectAllPaymentMethods.addEventListener('click', () => {
      selectedPaymentMethods = [];
      document.querySelectorAll('[data-filter-type="payment-method"]').forEach(cb => cb.checked = true);
    });
  }

  // Clear all payment methods
  const clearAllPaymentMethods = document.getElementById('clear-all-payment-methods');
  if (clearAllPaymentMethods) {
    clearAllPaymentMethods.addEventListener('click', () => {
      selectedPaymentMethods = [];
      document.querySelectorAll('[data-filter-type="payment-method"]').forEach(cb => cb.checked = false);
    });
  }

  // Clear all filters (reset to show all)
  const clearAllFilters = document.getElementById('clear-all-filters');
  if (clearAllFilters) {
    clearAllFilters.addEventListener('click', () => {
      selectedCategories = [];
      selectedPaymentMethods = [];
      
      document.querySelectorAll('[data-filter-type="category"]').forEach(cb => cb.checked = true);
      document.querySelectorAll('.filter-category-checkbox').forEach(cb => cb.checked = true);
      document.querySelectorAll('[data-filter-type="payment-method"]').forEach(cb => cb.checked = true);
    });
  }

  // Apply filters
  const applyFilters = document.getElementById('apply-filters');
  if (applyFilters) {
    applyFilters.addEventListener('click', async () => {
      
      // Close filter dropdown immediately
      isFilterOpen = false;
      const dropdown = document.getElementById('filter-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      
      // Show filter loading overlay
      const filterLoading = document.getElementById('filter-loading');
      if (filterLoading) filterLoading.style.display = 'flex';
      
      // Normalize categories
      const categoryCheckboxes = document.querySelectorAll('[data-filter-type="category"]');
      const checkedCategories = Array.from(categoryCheckboxes).filter(cb => cb.checked);
      
      if (checkedCategories.length === 0) {
        selectedCategories = null; // show nothing
      } else if (checkedCategories.length === allCategories.length) {
        selectedCategories = []; // show all
      } else {
        selectedCategories = checkedCategories.map(cb => cb.dataset.value);
      }
      
      // Normalize payment methods
      const pmCheckboxes = document.querySelectorAll('[data-filter-type="payment-method"]');
      const checkedPMs = Array.from(pmCheckboxes).filter(cb => cb.checked);
      
      if (checkedPMs.length === 0) {
        selectedPaymentMethods = null; // show nothing
      } else if (checkedPMs.length === allPaymentMethods.length) {
        selectedPaymentMethods = []; // show all
      } else {
        selectedPaymentMethods = checkedPMs.map(cb => cb.dataset.value);
      }
      
      
      await loadMovementsData();
      refreshDisplay();
      
      // Hide filter loading overlay
      const filterLoadingEnd = document.getElementById('filter-loading');
      if (filterLoadingEnd) filterLoadingEnd.style.display = 'none';
    });
  }

  // Category checkboxes
  document.querySelectorAll('[data-filter-type="category"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const category = e.target.dataset.value;
      const groupName = e.target.dataset.categoryGroup;
      
      // Update group checkbox state
      if (groupName) {
        const groupCheckbox = document.querySelector(`[data-category-group="${groupName}"].filter-category-checkbox`);
        const groupCategories = document.querySelectorAll(`[data-filter-type="category"][data-category-group="${groupName}"]`);
        const allChecked = Array.from(groupCategories).every(cb => cb.checked);
        if (groupCheckbox) {
          groupCheckbox.checked = allChecked;
        }
      }
    });
  });

  // Category group checkboxes
  document.querySelectorAll('.filter-category-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const groupName = e.target.dataset.categoryGroup;
      const isChecked = e.target.checked;
      
      // Check/uncheck all categories in group
      document.querySelectorAll(`[data-filter-type="category"][data-category-group="${groupName}"]`).forEach(cb => {
        cb.checked = isChecked;
      });
    });
  });

  // Category toggle (expand/collapse subcategories)
  document.querySelectorAll('[data-category-toggle]').forEach(label => {
    label.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox') return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const groupName = label.dataset.categoryToggle;
      const content = document.querySelector(`[data-category-content="${groupName}"]`);
      const icon = label.querySelector('.category-toggle-icon');
      
      if (content) {
        content.classList.toggle('collapsed');
        if (icon) icon.classList.toggle('rotated');
      }
    });
  });
}

/**
 * Setup filter listeners for income (ingresos tab)
 */
function setupIncomeFilterListeners() {
  // Select all members
  const selectAllMembers = document.getElementById('select-all-members');
  if (selectAllMembers) {
    selectAllMembers.addEventListener('click', () => {
      selectedMemberIds = [];
      document.querySelectorAll('[data-filter-type="member"]').forEach(cb => {
        cb.checked = true;
      });
    });
  }

  // Clear all members (deselect all = show none)
  const clearAllMembers = document.getElementById('clear-all-members');
  if (clearAllMembers) {
    clearAllMembers.addEventListener('click', () => {
      selectedMemberIds = []; // Will be set correctly on Apply based on checkboxes
      const checkboxes = document.querySelectorAll('[data-filter-type="member"]');
      checkboxes.forEach(cb => {
        cb.checked = false;
      });
    });
  }

  // Select all types
  const selectAllTypes = document.getElementById('select-all-types');
  if (selectAllTypes) {
    selectAllTypes.addEventListener('click', () => {
      selectedIncomeTypes = [];
      document.querySelectorAll('[data-filter-type="income-type"]').forEach(cb => {
        cb.checked = true;
      });
      document.querySelectorAll('.filter-category-checkbox').forEach(cb => {
        cb.checked = true;
      });
    });
  }

  // Clear all types (deselect all = show none)
  const clearAllTypes = document.getElementById('clear-all-types');
  if (clearAllTypes) {
    clearAllTypes.addEventListener('click', () => {
      selectedIncomeTypes = []; // Will be set correctly on Apply based on checkboxes
      document.querySelectorAll('[data-filter-type="income-type"]').forEach(cb => {
        cb.checked = false;
      });
      document.querySelectorAll('.filter-category-checkbox').forEach(cb => {
        cb.checked = false;
      });
    });
  }

  // Clear all filters (reset to show all)
  const clearAllFilters = document.getElementById('clear-all-filters');
  if (clearAllFilters) {
    clearAllFilters.addEventListener('click', () => {
      selectedMemberIds = []; // Will be set correctly on Apply (empty = show all)
      selectedIncomeTypes = []; // Will be set correctly on Apply (empty = show all)
      
      // Mark all member checkboxes
      document.querySelectorAll('[data-filter-type="member"]').forEach(cb => {
        cb.checked = true;
      });
      
      // Mark all type checkboxes
      document.querySelectorAll('[data-filter-type="income-type"]').forEach(cb => {
        cb.checked = true;
      });
      
      // Mark all category checkboxes
      document.querySelectorAll('.filter-category-checkbox').forEach(cb => {
        cb.checked = true;
      });
      
    });
  }

  // Apply filters
  const applyFilters = document.getElementById('apply-filters');
  if (applyFilters) {
    applyFilters.addEventListener('click', async () => {
      
      // Close filter dropdown immediately
      isFilterOpen = false;
      const dropdown = document.getElementById('filter-dropdown');
      if (dropdown) {
        dropdown.style.display = 'none';
      }
      
      // Show filter loading overlay in main page
      const filterLoading = document.getElementById('filter-loading');
      if (filterLoading) filterLoading.style.display = 'flex';
      
      // Normalize members based on actual checkbox state, not array content
      const memberCheckboxes = document.querySelectorAll('[data-filter-type="member"]');
      const checkedMembers = Array.from(memberCheckboxes).filter(cb => cb.checked);
      
      memberCheckboxes.forEach(cb => {
      });
      
      if (checkedMembers.length === 0) {
        // No members checked = show none
        selectedMemberIds = null; // Special value: show nothing
      } else if (checkedMembers.length === householdMembers.length) {
        // All members checked = show all
        selectedMemberIds = [];
      } else {
        // Some members checked = show only those
        selectedMemberIds = checkedMembers.map(cb => cb.dataset.value);
      }
      
      // Normalize types based on actual checkbox state
      const typeCheckboxes = document.querySelectorAll('[data-filter-type="income-type"]');
      const checkedTypes = Array.from(typeCheckboxes).filter(cb => cb.checked);
      const categories = getIncomeTypeCategories();
      const allTypes = Object.values(categories).flat();
      
      
      if (checkedTypes.length === 0) {
        // No types checked = show none
        selectedIncomeTypes = null; // Special value: show nothing
      } else if (checkedTypes.length === allTypes.length) {
        // All types checked = show all
        selectedIncomeTypes = [];
      } else {
        // Some types checked = show only those
        selectedIncomeTypes = checkedTypes.map(cb => cb.dataset.value);
      }
      
      
      await loadIncomeData();
      refreshDisplay();
      
      // Hide filter loading overlay
      const filterLoadingEnd = document.getElementById('filter-loading');
      if (filterLoadingEnd) filterLoadingEnd.style.display = 'none';
    });
  }

  // Member checkboxes
  document.querySelectorAll('[data-filter-type="member"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const memberId = e.target.dataset.value;
      
      // Check if we're in "show none" state (all IDs are in the array)
      const allIds = householdMembers.map(m => m.id);
      const isShowingNone = selectedMemberIds.length === allIds.length &&
                           allIds.every(id => selectedMemberIds.includes(id));
      
      if (e.target.checked) {
        // Checkbox is checked - include this member
        if (selectedMemberIds.length === 0) {
          // Was showing all, now only show this one
          selectedMemberIds = [memberId];
        } else if (isShowingNone) {
          // Was showing none, now only show this one
          selectedMemberIds = [memberId];
        } else {
          // Add to the filter list
          if (!selectedMemberIds.includes(memberId)) {
            selectedMemberIds.push(memberId);
          }
          // Note: Don't auto-convert to empty array here
          // We'll normalize when applying filters
        }
      } else {
        // Checkbox is unchecked - exclude this member
        if (selectedMemberIds.length === 0) {
          // Was showing all, now show all EXCEPT this one
          selectedMemberIds = allIds.filter(id => id !== memberId);
        } else {
          // Remove from the filter list
          selectedMemberIds = selectedMemberIds.filter(id => id !== memberId);
        }
      }
      
    });
  });

  // Income type checkboxes
  document.querySelectorAll('[data-filter-type="income-type"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const type = e.target.dataset.value;
      const category = e.target.dataset.category;
      const categories = getIncomeTypeCategories();
      const allTypes = Object.values(categories).flat();
      
      // Check if we're in "show none" state (all types are in the array)
      const isShowingNone = selectedIncomeTypes.length === allTypes.length &&
                           allTypes.every(t => selectedIncomeTypes.includes(t));
      
      if (e.target.checked) {
        // Checkbox is checked - include this type
        if (selectedIncomeTypes.length === 0) {
          // Was showing all, now only show this one
          selectedIncomeTypes = [type];
        } else if (isShowingNone) {
          // Was showing none, now only show this one
          selectedIncomeTypes = [type];
        } else {
          // Add to the filter list
          if (!selectedIncomeTypes.includes(type)) {
            selectedIncomeTypes.push(type);
          }
          // Note: Don't auto-convert to empty array here
          // We'll normalize when applying filters
        }
      } else {
        // Checkbox is unchecked - exclude this type
        if (selectedIncomeTypes.length === 0) {
          // Was showing all, now show all EXCEPT this one
          selectedIncomeTypes = allTypes.filter(t => t !== type);
        } else {
          // Remove from the filter list
          selectedIncomeTypes = selectedIncomeTypes.filter(t => t !== type);
        }
      }

      // Update category checkbox
      const categoryTypes = categories[category];
      const allCategoryChecked = categoryTypes.every(t => 
        selectedIncomeTypes.length === 0 || selectedIncomeTypes.includes(t)
      );
      const categoryCheckbox = document.querySelector(`[data-category="${category}"].filter-category-checkbox`);
      if (categoryCheckbox) {
        categoryCheckbox.checked = allCategoryChecked;
      }
    });
  });

  // Category checkboxes
  document.querySelectorAll('.filter-category-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const category = e.target.dataset.category;
      const categories = getIncomeTypeCategories();
      const categoryTypes = categories[category];
      const allTypes = Object.values(categories).flat();
      const isChecked = e.target.checked;

      // Check if we're in "show none" state
      const isShowingNone = selectedIncomeTypes.length === allTypes.length &&
                           allTypes.every(t => selectedIncomeTypes.includes(t));

      categoryTypes.forEach(type => {
        const typeCheckbox = document.querySelector(`[data-filter-type="income-type"][data-value="${type}"]`);
        if (typeCheckbox) {
          typeCheckbox.checked = isChecked;
        }
      });
      
      if (isChecked) {
        // Category is checked - include these types
        if (selectedIncomeTypes.length === 0) {
          // Was showing all, start with just these types
          selectedIncomeTypes = [...categoryTypes];
        } else if (isShowingNone) {
          // Was showing none, now only show these types
          selectedIncomeTypes = [...categoryTypes];
        } else {
          // Add these types to the filter list
          categoryTypes.forEach(type => {
            if (!selectedIncomeTypes.includes(type)) {
              selectedIncomeTypes.push(type);
            }
          });
          // Note: Don't auto-convert to empty array here
        }
      } else {
        // Category is unchecked - exclude these types
        if (selectedIncomeTypes.length === 0) {
          // Was showing all, now show all EXCEPT these
          selectedIncomeTypes = allTypes.filter(t => !categoryTypes.includes(t));
        } else {
          // Remove these types from the filter list
          selectedIncomeTypes = selectedIncomeTypes.filter(t => !categoryTypes.includes(t));
        }
      }
    });
  });

  // Category toggle (expand/collapse subcategories)
  document.querySelectorAll('[data-category-toggle]').forEach(label => {
    // Add click handler to the label itself
    label.addEventListener('click', (e) => {
      // If clicking on the checkbox, don't toggle expansion - just let checkbox work
      if (e.target.type === 'checkbox') {
        return;
      }
      
      // Clicking on name/arrow should toggle expansion
      e.preventDefault();
      e.stopPropagation();
      
      const category = label.dataset.categoryToggle;
      const content = document.querySelector(`[data-category-content="${category}"]`);
      const icon = label.querySelector('.category-toggle-icon');
      
      if (content) {
        content.classList.toggle('collapsed');
        if (icon) {
          icon.classList.toggle('rotated');
        }
      }
    });
  });
}

/**
 * Setup page
 */
export async function setup() {
  Navbar.setup();

  // Initialize current month if not set
  if (!currentMonth) {
    currentMonth = getCurrentMonth();
  }

  // Load household members for filter
  await loadHouseholdMembers();

  // Load data based on active tab (gastos by default)
  if (activeTab === 'gastos') {
    await loadMovementsData();
  } else {
    await loadIncomeData();
  }
  
  // Initial render of content - UPDATE THE DOM after loading data
  const contentContainer = document.querySelector('.dashboard-content');
  if (contentContainer) {
    if (activeTab === 'gastos' && movementsData) {
      contentContainer.innerHTML = `
        ${renderMonthSelector()}
        
        <div class="total-display">
          <div class="total-label">Total</div>
          <div class="total-amount">${formatCurrency(movementsData?.totals?.total_amount || 0)}</div>
        </div>

        <div id="categories-container">
          ${renderMovementCategories()}
        </div>
      `;
    } else if (activeTab === 'ingresos' && incomeData) {
      contentContainer.innerHTML = `
        ${renderMonthSelector()}
        
        <div class="total-display">
          <div class="total-label">Total</div>
          <div class="total-amount">${formatCurrency(incomeData?.totals?.total_amount || 0)}</div>
        </div>

        <div id="categories-container">
          ${renderIncomeCategories()}
        </div>
      `;
    } else if (activeTab === 'prestamos' && loansData) {
      contentContainer.innerHTML = `
        ${renderMonthSelector()}
        
        <div id="loans-container">
          ${renderLoansCards()}
        </div>
      `;
    }
  }

  // Setup tab listeners
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const newTab = btn.dataset.tab;
      if (newTab === activeTab) return; // Already on this tab
      
      activeTab = newTab;
      
      // Update tab buttons
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Load data for the new tab if not already loaded
      if (activeTab === 'gastos' && !movementsData) {
        await loadMovementsData();
      } else if (activeTab === 'ingresos' && !incomeData) {
        await loadIncomeData();
      } else if (activeTab === 'prestamos' && !loansData) {
        await loadLoansData();
      }
      
      // Update content
      const contentContainer = document.querySelector('.dashboard-content');
      if (contentContainer) {
        if (activeTab === 'gastos') {
          contentContainer.innerHTML = `
            ${renderMonthSelector()}
            
            <div class="total-display">
              <div class="total-label">Total</div>
              <div class="total-amount">${formatCurrency(movementsData?.totals?.total_amount || 0)}</div>
            </div>

            <div id="categories-container">
              ${renderMovementCategories()}
            </div>
          `;
          setupMonthNavigation();
          setupCategoryListeners();
        } else if (activeTab === 'ingresos') {
          contentContainer.innerHTML = `
            ${renderMonthSelector()}
            
            <div class="total-display">
              <div class="total-label">Total</div>
              <div class="total-amount">${formatCurrency(incomeData?.totals?.total_amount || 0)}</div>
            </div>

            <div id="categories-container">
              ${renderIncomeCategories()}
            </div>
          `;
          setupMonthNavigation();
          setupCategoryListeners();
        } else if (activeTab === 'prestamos') {
          contentContainer.innerHTML = `
            ${renderMonthSelector()}
            
            <div id="loans-container">
              ${renderLoansCards()}
            </div>
          `;
          setupMonthNavigation();
          setupLoansListeners();
        } else {
          contentContainer.innerHTML = `
            <div class="coming-soon">
              <div class="coming-soon-icon">💳</div>
              <p>Próximamente</p>
            </div>
          `;
        }
      }
    });
  });

  // Setup tab scroll buttons
  const tabsWrapper = document.querySelector('.tabs-wrapper');
  const scrollLeftBtn = document.querySelector('.tab-scroll-left');
  const scrollRightBtn = document.querySelector('.tab-scroll-right');

  function updateScrollButtons() {
    if (!tabsWrapper || !scrollLeftBtn || !scrollRightBtn) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = tabsWrapper;
    
    // Check if scrolling is needed (with small tolerance for rounding)
    const hasOverflow = scrollWidth > clientWidth + 5;
    
    if (!hasOverflow) {
      // No overflow - hide both buttons
      scrollLeftBtn.style.visibility = 'hidden';
      scrollLeftBtn.style.pointerEvents = 'none';
      scrollRightBtn.style.visibility = 'hidden';
      scrollRightBtn.style.pointerEvents = 'none';
    } else {
      // Has overflow - show/hide based on scroll position
      const isAtStart = scrollLeft <= 1;
      const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 1;
      
      if (isAtStart) {
        scrollLeftBtn.style.visibility = 'hidden';
        scrollLeftBtn.style.pointerEvents = 'none';
      } else {
        scrollLeftBtn.style.visibility = 'visible';
        scrollLeftBtn.style.pointerEvents = 'auto';
      }
      
      if (isAtEnd) {
        scrollRightBtn.style.visibility = 'hidden';
        scrollRightBtn.style.pointerEvents = 'none';
      } else {
        scrollRightBtn.style.visibility = 'visible';
        scrollRightBtn.style.pointerEvents = 'auto';
      }
    }
  }

  if (tabsWrapper && scrollLeftBtn && scrollRightBtn) {
    scrollLeftBtn.addEventListener('click', () => {
      tabsWrapper.scrollBy({ left: -200, behavior: 'smooth' });
      setTimeout(updateScrollButtons, 300);
    });

    scrollRightBtn.addEventListener('click', () => {
      tabsWrapper.scrollBy({ left: 200, behavior: 'smooth' });
      setTimeout(updateScrollButtons, 300);
    });

    tabsWrapper.addEventListener('scroll', updateScrollButtons);
    
    // Initial check
    updateScrollButtons();
    
    // Update on window resize
    window.addEventListener('resize', updateScrollButtons);
  }

  // Setup month navigation for initial load
  setupMonthNavigation();

  // Setup category listeners
  setupCategoryListeners();
}

/**
 * Show loading state in categories container
 */
function showLoadingState() {
  const container = document.getElementById('categories-container');
  const loansContainer = document.getElementById('loans-container');
  
  if (container) {
    container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Cargando...</p>
      </div>
    `;
  }
  
  if (loansContainer) {
    loansContainer.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Cargando...</p>
      </div>
    `;
  }
}

/**
 * Setup month navigation listeners
 */
function setupMonthNavigation() {
  const prevBtn = document.getElementById('prev-month-btn');
  const nextBtn = document.getElementById('next-month-btn');

  if (prevBtn) {
    prevBtn.onclick = async () => {
      currentMonth = previousMonth(currentMonth);
      showLoadingState();
      if (activeTab === 'gastos') {
        await loadMovementsData();
      } else if (activeTab === 'ingresos') {
        await loadIncomeData();
      } else if (activeTab === 'prestamos') {
        await loadLoansData();
      }
      refreshDisplay();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = async () => {
      currentMonth = nextMonth(currentMonth);
      showLoadingState();
      if (activeTab === 'gastos') {
        await loadMovementsData();
      } else if (activeTab === 'ingresos') {
        await loadIncomeData();
      } else if (activeTab === 'prestamos') {
        await loadLoansData();
      }
      refreshDisplay();
    };
  }
}
