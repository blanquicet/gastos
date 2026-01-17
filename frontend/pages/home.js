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
let loansData = null; // Préstamos data (debts consolidation with movement details)
let activeTab = 'gastos'; // 'gastos', 'ingresos', 'prestamos', 'presupuesto', 'tarjetas' - DEFAULT TO GASTOS
let householdMembers = []; // List of household members for filtering
let selectedMemberIds = []; // Array of selected member IDs (empty = all)
let selectedIncomeTypes = []; // Array of selected income types (empty = all)
let selectedCategories = []; // Array of selected categories for gastos filter (empty = all)
let selectedPaymentMethods = []; // Array of selected payment method IDs for gastos filter (empty = all)
let selectedLoanPeople = []; // Array of selected person IDs for loans filter (empty = all)
let isFilterOpen = false; // Track if filter dropdown is open
let isLoansFilterOpen = false; // Track if loans filter dropdown is open
let tabsNeedingReload = new Set(); // Tabs that need to reload when activated ('gastos', 'ingresos', 'prestamos', 'presupuesto', 'tarjetas')
let budgetsData = null; // Presupuesto data
let categoryGroupsData = null; // Category groups with categories (from /api/category-groups)
let showChronological = false; // Track if showing chronological view (true) or grouped view (false)

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
          <button class="tab-btn ${activeTab === 'presupuesto' ? 'active' : ''}" data-tab="presupuesto">Presupuesto</button>
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
    'other_income': 'Otros Ingresos',
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
    'other_income': 'Otros Ingresos',
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
                    <button class="menu-item" data-action="edit" data-id="${entry.id}">Editar</button>
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
 * Render budgets for presupuesto tab
 */
function renderBudgets() {
  if (!budgetsData || !budgetsData.budgets) {
    return `
      <div class="empty-state">
        <div class="empty-icon">💰</div>
        <p>No hay categorías disponibles</p>
        <p class="empty-hint">Crea categorías desde "Gestionar categorías" para configurar presupuestos</p>
      </div>
    `;
  }

  const { budgets, totals } = budgetsData;

  if (budgets.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">💰</div>
        <p>No hay categorías disponibles</p>
        <p class="empty-hint">Crea categorías desde "Gestionar categorías" para configurar presupuestos</p>
      </div>
    `;
  }

  // Group budgets by category_group_name
  const grouped = {};
  const ungrouped = [];

  budgets.forEach(budget => {
    if (budget.category_group_name) {
      if (!grouped[budget.category_group_name]) {
        grouped[budget.category_group_name] = [];
      }
      grouped[budget.category_group_name].push(budget);
    } else {
      ungrouped.push(budget);
    }
  });

  // Render budget item (reusing expense-category-item structure)
  const renderBudgetItem = (budget, groupName) => {
    const hasBudget = budget.amount > 0;
    const simplifiedName = getSimplifiedCategoryName(budget.category_name || 'Sin nombre', groupName);
    
    return `
      <div class="expense-category-item">
        <div class="expense-category-info">
          <div class="expense-category-name">${simplifiedName}</div>
          <div class="expense-category-amount">
            <span class="budget-amount-display" data-category-id="${budget.category_id}" data-budget-id="${hasBudget ? budget.id : ''}" data-amount="${hasBudget ? budget.amount : 0}">
              ${hasBudget ? formatCurrency(budget.amount) : '<span class="no-budget-text">Sin presupuesto</span>'}
            </span>
          </div>
        </div>
        <div class="entry-actions">
          <button class="three-dots-btn" data-category-id="${budget.category_id}" data-budget-id="${hasBudget ? budget.id : ''}" data-category-name="${simplifiedName}" data-has-budget="${hasBudget}">⋮</button>
          <div class="three-dots-menu" id="budget-menu-${budget.category_id}">
            ${hasBudget ? `
              <button class="menu-item" data-action="edit-budget" data-category-id="${budget.category_id}" data-budget-id="${budget.id}" data-amount="${budget.amount}" data-category-name="${simplifiedName}">Editar presupuesto</button>
              <button class="menu-item" data-action="delete-budget" data-budget-id="${budget.id}" data-category-name="${simplifiedName}">Eliminar presupuesto</button>
            ` : `
              <button class="menu-item" data-action="add-budget" data-category-id="${budget.category_id}" data-category-name="${simplifiedName}">Agregar presupuesto</button>
            `}
          </div>
        </div>
      </div>
    `;
  };

  // Render group card (reusing expense-group-card structure)
  const renderGroupCard = (groupName, groupBudgets) => {
    const groupTotal = groupBudgets.reduce((sum, b) => sum + (b.amount || 0), 0);
    const safeGroupId = groupName.replace(/\s+/g, '-').toLowerCase();
    
    // Get group icon from first budget's category_group_icon
    const groupIcon = groupBudgets[0]?.category_group_icon || '📁';
    
    return `
      <div class="expense-group-card" data-group="${groupName}">
        <div class="expense-group-header">
          <div class="expense-group-icon-container">
            <span class="expense-group-icon">${groupIcon}</span>
          </div>
          <div class="expense-group-info">
            <div class="expense-group-name">${groupName}</div>
            <div class="expense-group-amount">${formatCurrency(groupTotal)}</div>
          </div>
          <div class="expense-group-actions">
            <svg class="expense-group-chevron" width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
        <div class="expense-group-details hidden" id="budget-group-details-${safeGroupId}">
          ${groupBudgets.map(budget => renderBudgetItem(budget, groupName)).join('')}
        </div>
      </div>
    `;
  };

  // Render all groups
  const groupsHtml = Object.keys(grouped)
    .sort()
    .map(groupName => renderGroupCard(groupName, grouped[groupName]))
    .join('');

  // Render ungrouped
  const ungroupedHtml = ungrouped.length > 0 
    ? renderGroupCard('Otros', ungrouped)
    : '';

  return `
    <!-- Action buttons - same style as registrar-movimiento -->
    <div class="footer-buttons" style="margin-bottom: 24px;">
      <button type="button" id="copy-prev-month-budget">
        📋 Copiar del mes anterior
      </button>
      <button type="button" id="manage-categories-btn">
        ⚙️ Gestionar categorías
      </button>
    </div>

    <!-- Total Presupuestado -->
    <div class="total-display" style="margin-bottom: 24px;">
      <div class="total-label">Total Presupuestado</div>
      <div class="total-amount">${formatCurrency(totals.total_budget)}</div>
    </div>

    <div class="categories-grid">
      ${groupsHtml}
      ${ungroupedHtml}
    </div>
  `;
}

/**
 * Render loans filter dropdown
 */
function renderLoansFilterDropdown() {
  // Get all unique people involved in loans (debtors + creditors)
  const peopleMap = new Map(); // ID -> name
  
  if (loansData && loansData.balances) {
    loansData.balances.forEach(balance => {
      peopleMap.set(balance.debtor_id, balance.debtor_name);
      peopleMap.set(balance.creditor_id, balance.creditor_name);
    });
  }
  
  // Create set of member IDs for quick lookup
  const memberIds = new Set(householdMembers.map(m => m.id));
  
  // Separate into members and contacts
  const members = [];
  const contacts = [];
  
  peopleMap.forEach((name, id) => {
    const personObj = { id, name };
    if (memberIds.has(id)) {
      members.push(personObj);
    } else {
      contacts.push(personObj);
    }
  });
  
  members.sort((a, b) => a.name.localeCompare(b.name));
  contacts.sort((a, b) => a.name.localeCompare(b.name));
  
  const showAllPeople = Array.isArray(selectedLoanPeople) && selectedLoanPeople.length === 0;
  
  return `
    <div class="filter-dropdown" id="loans-filter-dropdown" style="display: ${isLoansFilterOpen ? 'block' : 'none'}">
      ${members.length > 0 ? `
        <div class="filter-section">
          <div class="filter-section-header">
            <span class="filter-section-title">Miembros</span>
            <div class="filter-section-actions">
              <button class="filter-link-btn" id="select-all-loan-members">Todos</button>
              <button class="filter-link-btn" id="clear-all-loan-members">Limpiar</button>
            </div>
          </div>
          <div class="filter-options">
            ${members.map(person => {
              const isChecked = showAllPeople || (selectedLoanPeople && selectedLoanPeople.includes(person.id));
              return `
                <label class="filter-checkbox-label">
                  <input type="checkbox" class="filter-checkbox" 
                         data-filter-type="loan-person" 
                         data-person-type="member"
                         data-value="${person.id}" 
                         ${isChecked ? 'checked' : ''}>
                  <span>${person.name}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
      
      ${contacts.length > 0 ? `
        <div class="filter-section">
          <div class="filter-section-header">
            <span class="filter-section-title">Contactos</span>
            <div class="filter-section-actions">
              <button class="filter-link-btn" id="select-all-loan-contacts">Todos</button>
              <button class="filter-link-btn" id="clear-all-loan-contacts">Limpiar</button>
            </div>
          </div>
          <div class="filter-options">
            ${contacts.map(person => {
              const isChecked = showAllPeople || (selectedLoanPeople && selectedLoanPeople.includes(person.id));
              return `
                <label class="filter-checkbox-label">
                  <input type="checkbox" class="filter-checkbox" 
                         data-filter-type="loan-person"
                         data-person-type="contact" 
                         data-value="${person.id}" 
                         ${isChecked ? 'checked' : ''}>
                  <span>${person.name}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div class="filter-footer">
        <button class="btn-secondary btn-small" id="clear-loans-filter">Mostrar todo</button>
        <button class="btn-primary btn-small" id="apply-loans-filter">Aplicar</button>
      </div>
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
        <button id="add-loan-btn-empty" class="btn-primary">+ Registrar préstamo</button>
      </div>
      <div class="floating-actions">
        <button id="filter-loans-btn" class="btn-filter-floating" title="Filtrar por personas">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 10.414V17a1 1 0 01-.447.894l-2 1.333A1 1 0 018 18.333V10.414L3.293 5.707A1 1 0 013 5V3z"/>
          </svg>
        </button>
        ${renderLoansFilterDropdown()}
        <button id="add-loan-btn" class="btn-add-floating">+</button>
      </div>
    `;
  }

  let balances = loansData.balances;
  
  // Apply filter if any people are selected (AND logic: both debtor AND creditor must be in selection)
  const hasFilter = selectedLoanPeople === null || (Array.isArray(selectedLoanPeople) && selectedLoanPeople.length > 0);
  if (hasFilter && selectedLoanPeople && selectedLoanPeople.length > 0) {
    balances = balances.filter(balance => 
      selectedLoanPeople.includes(balance.debtor_id) && selectedLoanPeople.includes(balance.creditor_id)
    );
  }
  
  // Recalculate summary based on filtered balances (if filter is active)
  let displaySummary = loansData.summary;
  if (hasFilter && selectedLoanPeople && selectedLoanPeople.length > 0 && householdMembers.length > 0) {
    const memberIds = new Set(householdMembers.map(m => m.id));
    let theyOweUs = 0;
    let weOwe = 0;
    
    balances.forEach(balance => {
      const debtorIsMember = memberIds.has(balance.debtor_id);
      const creditorIsMember = memberIds.has(balance.creditor_id);
      
      if (debtorIsMember && !creditorIsMember) {
        weOwe += balance.amount;
      } else if (!debtorIsMember && creditorIsMember) {
        theyOweUs += balance.amount;
      }
    });
    
    displaySummary = { they_owe_us: theyOweUs, we_owe: weOwe };
  }
  
  // Store filtered summary for use in refreshDisplay
  window.__filteredLoansSummary = displaySummary;
  
  // Helper function to get initials from name
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };
  
  // Helper function to get color based on name
  const getAvatarColor = (name) => {
    const colors = [
      '#FF6B6B', // red
      '#4ECDC4', // teal
      '#45B7D1', // blue
      '#FFA07A', // salmon
      '#98D8C8', // mint
      '#F7DC6F', // yellow
      '#BB8FCE', // purple
      '#85C1E2', // sky blue
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  const cardsHtml = balances.map(balance => {
    const debtorInitials = getInitials(balance.debtor_name);
    const creditorInitials = getInitials(balance.creditor_name);
    const debtorColor = getAvatarColor(balance.debtor_name);
    const creditorColor = getAvatarColor(balance.creditor_name);
    const isSettled = balance.amount === 0;
    
    return `
      <div class="expense-group-card loan-card ${isSettled ? 'loan-settled' : ''}" data-debtor-id="${balance.debtor_id}" data-creditor-id="${balance.creditor_id}">
        <div class="expense-group-header loan-header-split">
          <div class="loan-avatar" style="background-color: ${debtorColor}">
            ${debtorInitials}
          </div>
          <div class="expense-group-info loan-center-info">
            <div class="expense-group-name">${isSettled ? `${balance.debtor_name} y ${balance.creditor_name} a paz y salvo` : `${balance.debtor_name} debe a ${balance.creditor_name}`}</div>
            <div class="expense-group-amount ${isSettled ? 'settled-amount' : ''}">${isSettled ? '✓' : formatCurrency(balance.amount)}</div>
          </div>
          <div class="loan-avatar" style="background-color: ${creditorColor}">
            ${creditorInitials}
          </div>
        </div>
        <div class="expense-group-details hidden" id="loan-details-${balance.debtor_id}-${balance.creditor_id}">
          <!-- Level 2 content will be rendered here when expanded -->
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
      ${cardsHtml}
    </div>
    <div class="floating-actions">
      <button id="filter-loans-btn" class="btn-filter-floating" title="Filtrar por personas">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 10.414V17a1 1 0 01-.447.894l-2 1.333A1 1 0 018 18.333V10.414L3.293 5.707A1 1 0 013 5V3z"/>
        </svg>
      </button>
      ${renderLoansFilterDropdown()}
      <button id="add-loan-btn" class="btn-add-floating">+</button>
    </div>
  `;
}

/**
 * Render loan details (Level 2: breakdown by direction)
 */
function renderLoanDetails(debtorId, creditorId) {
  // Get balance data from backend (already calculated)
  const balance = loansData.balances.find(b => b.debtor_id === debtorId && b.creditor_id === creditorId);
  
  if (!balance || !balance.movements || balance.movements.length === 0) {
    return '<p class="no-data">No hay movimientos disponibles</p>';
  }

  const debtorName = balance.debtor_name || 'Desconocido';
  const creditorName = balance.creditor_name || 'Desconocido';
  
  // Group movements into 4 categories: who paid × movement type
  // 1. Debtor owes Creditor (SPLIT where creditor paid)
  const debtorOwesCreditorSplit = balance.movements.filter(m => 
    m.type === 'SPLIT' && m.payer_id === creditorId
  );
  
  // 2. Creditor owes Debtor (SPLIT where debtor paid)
  const creditorOwesDebtorSplit = balance.movements.filter(m => 
    m.type === 'SPLIT' && m.payer_id === debtorId
  );
  
  // 3. Debtor paid to Creditor (DEBT_PAYMENT from debtor to creditor)
  const debtorPaidCreditor = balance.movements.filter(m => 
    m.type === 'DEBT_PAYMENT' && m.amount < 0 && m.payer_id === debtorId
  );
  
  // 4. Creditor paid to Debtor (DEBT_PAYMENT from creditor to debtor - rare but possible)
  const creditorPaidDebtor = balance.movements.filter(m => 
    m.type === 'DEBT_PAYMENT' && m.amount < 0 && m.payer_id === creditorId
  );
  
  const totalDebtorOwes = debtorOwesCreditorSplit.reduce((sum, m) => sum + Math.abs(m.amount), 0);
  const totalCreditorOwes = creditorOwesDebtorSplit.reduce((sum, m) => sum + Math.abs(m.amount), 0);
  const totalDebtorPaid = debtorPaidCreditor.reduce((sum, m) => sum + Math.abs(m.amount), 0);
  const totalCreditorPaid = creditorPaidDebtor.reduce((sum, m) => sum + Math.abs(m.amount), 0);

  let html = '';

  // 1. Show "Debtor owes Creditor" (SPLIT - creditor paid for shared expenses)
  if (debtorOwesCreditorSplit.length > 0) {
    html += `
      <div class="expense-category-item" data-direction="debtor-owes-split" data-debtor-id="${debtorId}" data-creditor-id="${creditorId}">
        <div class="expense-category-header">
          <div class="expense-category-info">
            <span class="expense-category-name">${debtorName} debe a ${creditorName}</span>
            <span class="expense-category-amount">${formatCurrency(totalDebtorOwes)}</span>
          </div>
        </div>
        <div class="expense-category-details hidden" id="loan-movements-debtor-owes-split-${debtorId}-${creditorId}">
          <!-- Level 3 content will be rendered here -->
        </div>
      </div>
    `;
  }

  // 2. Show "Debtor paid Creditor" (DEBT_PAYMENT - debtor made payments)
  if (debtorPaidCreditor.length > 0) {
    html += `
      <div class="expense-category-item" data-direction="debtor-paid-creditor" data-debtor-id="${debtorId}" data-creditor-id="${creditorId}">
        <div class="expense-category-header">
          <div class="expense-category-info">
            <span class="expense-category-name">${debtorName} pagó a ${creditorName}</span>
            <span class="expense-category-amount">${formatCurrency(totalDebtorPaid)}</span>
          </div>
        </div>
        <div class="expense-category-details hidden" id="loan-movements-debtor-paid-creditor-${debtorId}-${creditorId}">
          <!-- Level 3 content will be rendered here -->
        </div>
      </div>
    `;
  }

  // 3. Show "Creditor owes Debtor" (SPLIT - debtor paid for shared expenses)
  if (creditorOwesDebtorSplit.length > 0) {
    html += `
      <div class="expense-category-item" data-direction="creditor-owes-split" data-debtor-id="${debtorId}" data-creditor-id="${creditorId}">
        <div class="expense-category-header">
          <div class="expense-category-info">
            <span class="expense-category-name">${creditorName} debe a ${debtorName}</span>
            <span class="expense-category-amount">${formatCurrency(totalCreditorOwes)}</span>
          </div>
        </div>
        <div class="expense-category-details hidden" id="loan-movements-creditor-owes-split-${debtorId}-${creditorId}">
          <!-- Level 3 content will be rendered here -->
        </div>
      </div>
    `;
  }

  // 4. Show "Creditor paid Debtor" (DEBT_PAYMENT - creditor made payments, rare)
  if (creditorPaidDebtor.length > 0) {
    html += `
      <div class="expense-category-item" data-direction="creditor-paid-debtor" data-debtor-id="${debtorId}" data-creditor-id="${creditorId}">
        <div class="expense-category-header">
          <div class="expense-category-info">
            <span class="expense-category-name">${creditorName} pagó a ${debtorName}</span>
            <span class="expense-category-amount">${formatCurrency(totalCreditorPaid)}</span>
          </div>
        </div>
        <div class="expense-category-details hidden" id="loan-movements-creditor-paid-debtor-${debtorId}-${creditorId}">
          <!-- Level 3 content will be rendered here -->
        </div>
      </div>
    `;
  }

  // If no movements found, show a message
  if (html === '') {
    html = '<p class="no-data">No se encontraron movimientos de préstamo entre estas personas en este mes.</p>';
  }

  return html;
}

/**
 * Render loan movements (Level 3: individual movements for a direction)
 */
function renderLoanMovements(debtorId, creditorId, direction) {
  // Get balance data from backend
  const balance = loansData.balances.find(b => b.debtor_id === debtorId && b.creditor_id === creditorId);
  
  if (!balance || !balance.movements || balance.movements.length === 0) {
    return '<p class="no-data">No hay movimientos</p>';
  }

  // Filter movements based on direction (combines payer + type)
  let relevantMovements = [];
  
  if (direction === 'debtor-owes-split') {
    // SPLIT movements where creditor paid
    relevantMovements = balance.movements.filter(m => 
      m.type === 'SPLIT' && m.payer_id === creditorId
    );
  } else if (direction === 'debtor-paid-creditor') {
    // DEBT_PAYMENT where debtor paid to creditor
    relevantMovements = balance.movements.filter(m => 
      m.type === 'DEBT_PAYMENT' && m.amount < 0 && m.payer_id === debtorId
    ).map(m => ({ ...m, amount: Math.abs(m.amount) })); // Convert to positive for display
  } else if (direction === 'creditor-owes-split') {
    // SPLIT movements where debtor paid
    relevantMovements = balance.movements.filter(m => 
      m.type === 'SPLIT' && m.payer_id === debtorId
    );
  } else if (direction === 'creditor-paid-debtor') {
    // DEBT_PAYMENT where creditor paid to debtor
    relevantMovements = balance.movements.filter(m => 
      m.type === 'DEBT_PAYMENT' && m.amount < 0 && m.payer_id === creditorId
    ).map(m => ({ ...m, amount: Math.abs(m.amount) })); // Convert to positive for display
  }

  if (relevantMovements.length === 0) {
    return '<p class="no-data">No hay movimientos</p>';
  }

  const movementsHtml = relevantMovements.map(movement => {
    const typeLabel = movement.type === 'SPLIT' ? 'Gasto compartido' : 'Pago de deuda';
    
    return `
      <div class="movement-detail-entry">
        <div class="entry-info">
          <span class="entry-description">${movement.description || typeLabel}</span>
          <span class="entry-amount">${formatCurrency(movement.amount)}</span>
          <div class="entry-date">${formatDate(movement.movement_date)}</div>
        </div>
        <div class="entry-actions">
          <button class="three-dots-btn" data-movement-id="${movement.movement_id}">⋮</button>
          <div class="three-dots-menu" id="movement-menu-${movement.movement_id}">
            <button class="menu-item" data-action="edit" data-id="${movement.movement_id}">Editar</button>
            <button class="menu-item" data-action="delete" data-id="${movement.movement_id}">Eliminar</button>
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

  // Check URL parameters for active tab (before rendering)
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get('tab');
  if (tabParam && ['gastos', 'ingresos', 'prestamos', 'presupuesto', 'tarjetas'].includes(tabParam)) {
    activeTab = tabParam;
  }

  const totalAmount = activeTab === 'gastos'
    ? (movementsData?.totals?.total_amount || 0)
    : (incomeData?.totals?.total_amount || 0);

  return `
    <main class="card">
      <header class="header">
        <div class="header-row">
          <h1>Mes a Mes</h1>
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
          
          <div class="loans-summary">
            <div class="summary-item">
              <div class="summary-label">Nos deben</div>
              <div class="summary-amount">${formatCurrency(loansData?.summary?.they_owe_us || 0)}</div>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
              <div class="summary-label">Debemos</div>
              <div class="summary-amount">${formatCurrency(loansData?.summary?.we_owe || 0)}</div>
            </div>
          </div>

          <div id="loans-container">
            ${renderLoansCards()}
          </div>
        ` : activeTab === 'prestamos' ? `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Cargando...</p>
          </div>
        ` : activeTab === 'presupuesto' && budgetsData ? `
          ${renderMonthSelector()}
          
          ${renderBudgets()}
        ` : activeTab === 'presupuesto' ? `
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
    // Load both HOUSEHOLD and SPLIT movements, plus budgets
    const [householdResponse, splitResponse, budgetsResponse] = await Promise.all([
      fetch(`${API_URL}/movements?type=HOUSEHOLD&month=${currentMonth}`, {
        credentials: 'include'
      }),
      fetch(`${API_URL}/movements?type=SPLIT&month=${currentMonth}`, {
        credentials: 'include'
      }),
      fetch(`${API_URL}/budgets/${currentMonth}`, {
        credentials: 'include'
      })
    ]);

    if (!householdResponse.ok || !splitResponse.ok) {
      console.error('Error loading movements data');
      movementsData = null;
      return;
    }

    // Load budgets (optional - don't fail if not available)
    if (budgetsResponse.ok) {
      budgetsData = await budgetsResponse.json();
    } else if (budgetsResponse.status === 404) {
      // No budgets for this month yet
      budgetsData = { month: currentMonth, budgets: [], totals: { total_budget: 0, total_spent: 0, percentage: 0 } };
    } else {
      console.error('Error loading budgets data');
      budgetsData = null;
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
 * Load loans data for the current month (debts consolidation with movement details)
 */
async function loadLoansData() {
  try {
    // Load debts consolidation (includes movement details)
    const consolidationResponse = await fetch(`${API_URL}/movements/debts/consolidate?month=${currentMonth}`, {
      credentials: 'include'
    });

    if (!consolidationResponse.ok) {
      console.error('Error loading loans data');
      loansData = null;
      return;
    }

    loansData = await consolidationResponse.json();
    
  } catch (error) {
    console.error('Error loading loans data:', error);
    loansData = null;
  }
}

/**
 * Load budgets data for the current month
 */
async function loadBudgetsData() {
  try {
    const response = await fetch(`${API_URL}/budgets/${currentMonth}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 404) {
        // No budgets for this month yet
        budgetsData = { month: currentMonth, budgets: [], totals: { total_budget: 0, total_spent: 0, percentage: 0 } };
        return;
      }
      console.error('Error loading budgets data');
      budgetsData = null;
      return;
    }

    budgetsData = await response.json();
  } catch (error) {
    console.error('Error loading budgets data:', error);
    budgetsData = null;
  }
}

/**
 * Load category groups with categories from backend
 */
async function loadCategoryGroups() {
  try {
    const response = await fetch(`${API_URL}/category-groups`, {
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('Error loading category groups');
      categoryGroupsData = null;
      return;
    }

    categoryGroupsData = await response.json();
  } catch (error) {
    console.error('Error loading category groups:', error);
    categoryGroupsData = null;
  }
}

/**
 * Set/update budget for a category
 */
async function setBudget(categoryId, month, amount) {
  try {
    const response = await fetch(`${API_URL}/budgets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        category_id: categoryId,
        month: month,
        amount: parseFloat(amount)
      })
    });

    if (!response.ok) {
      let errorMsg = 'Error al guardar presupuesto';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {
        // Response is not JSON, use status text
        errorMsg = `${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMsg);
    }

    return await response.json();
  } catch (error) {
    console.error('Error setting budget:', error);
    showError('Error al guardar', error.message);
    return null;
  }
}

/**
 * Delete a budget by ID
 */
async function deleteBudget(budgetId) {
  try {
    const response = await fetch(`${API_URL}/budgets/${budgetId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      let errorMsg = 'Error al eliminar presupuesto';
      try {
        const error = await response.json();
        errorMsg = error.error || errorMsg;
      } catch (e) {
        errorMsg = `${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMsg);
    }

    return true;
  } catch (error) {
    console.error('Error deleting budget:', error);
    showError('Error al eliminar', error.message);
    return false;
  }
}

/**
 * Copy budgets from previous month to current month
 */
async function copyBudgetsFromPrevMonth() {
  const [year, month] = currentMonth.split('-');
  const prevMonthDate = new Date(year, month - 2, 1); // month - 1 for 0-indexed, -1 more for previous
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
  
  try {
    const response = await fetch(`${API_URL}/budgets/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        from_month: prevMonth,
        to_month: currentMonth
      })
    });

    if (!response.ok) {
      let errorMessage = 'Error al copiar presupuestos';
      try {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
        
        // Make specific errors more user-friendly
        if (errorMessage.includes('already exist')) {
          errorMessage = 'Ya existen presupuestos para este mes. Elimínalos primero si quieres copiarlos de nuevo.';
        } else if (errorMessage.includes('must be after')) {
          errorMessage = 'No se pueden copiar presupuestos: el mes destino debe ser posterior al mes origen.';
        }
      } catch (e) {
        // If response is not JSON, try to get text
        try {
          const text = await response.text();
          if (text.includes('already exist')) {
            errorMessage = 'Ya existen presupuestos para este mes. Elimínalos primero si quieres copiarlos de nuevo.';
          } else {
            errorMessage = text || errorMessage;
          }
        } catch (textError) {
          // Use default message
        }
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    showSuccess('Presupuestos copiados', `Se copiaron ${result.count} presupuestos del mes anterior exitosamente`);
    
    // Reload budgets data
    await loadBudgetsData();
    refreshDisplay();
    
    return result;
  } catch (error) {
    console.error('Error copying budgets:', error);
    showError('Error al copiar presupuestos', error.message);
    return null;
  }
}

/**
 * Render filter dropdown for movements (gastos)
 */
function renderMovementsFilterDropdown() {
  // Ensure category groups are loaded
  if (!categoryGroupsData) {
    return '<div class="filter-dropdown" id="filter-dropdown" style="display: none">Cargando...</div>';
  }
   
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
        
        ${categoryGroupsData.map(group => {
          const allGroupChecked = showAllCategories || group.categories.every(c => selectedCategories.includes(c.id));
          
          return `
            <div class="filter-category">
              <label class="filter-checkbox-label filter-category-label" data-category-toggle="${group.name}">
                <input type="checkbox" class="filter-checkbox filter-category-checkbox" 
                       data-category-group="${group.id}"
                       ${allGroupChecked ? 'checked' : ''}>
                <span>${group.icon || '📦'} ${group.name}</span>
                <svg class="category-toggle-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.293 5.293a1 1 0 011.414 0L8 7.586l2.293-2.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
                </svg>
              </label>
              <div class="filter-options filter-sub-options collapsed" data-category-content="${group.name}">
                ${group.categories.map(category => {
                  const isChecked = showAllCategories || selectedCategories.includes(category.id);
                  return `
                    <label class="filter-checkbox-label">
                      <input type="checkbox" class="filter-checkbox" 
                             data-filter-type="category" 
                             data-category-group="${group.id}"
                             data-value="${category.id}" 
                             ${isChecked ? 'checked' : ''}>
                      <span>${category.name}</span>
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
 * Strip group prefix from category name for display
 */
function getSimplifiedCategoryName(category, groupName) {
  // Try removing "GroupName - " prefix first (e.g., "Casa - Gastos fijos" -> "Gastos fijos")
  const prefixWithDash = `${groupName} - `;
  if (category.startsWith(prefixWithDash)) {
    const simplified = category.substring(prefixWithDash.length);
    // Capitalize first letter
    return simplified.length > 0 ? simplified.charAt(0).toUpperCase() + simplified.slice(1) : simplified;
  }
  
  // Try removing "GroupName " prefix (e.g., "Inversiones Jose" -> "Jose")
  const prefixWithSpace = `${groupName} `;
  if (category.startsWith(prefixWithSpace)) {
    const simplified = category.substring(prefixWithSpace.length);
    // Capitalize first letter
    return simplified.length > 0 ? simplified.charAt(0).toUpperCase() + simplified.slice(1) : simplified;
  }
  
  // Capitalize first letter of the original category
  return category.length > 0 ? category.charAt(0).toUpperCase() + category.slice(1) : category;
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
        <button id="group-toggle-btn" class="btn-group-toggle" title="Vista cronológica">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 5h14a1 1 0 010 2H3a1 1 0 010-2z"/>
          </svg>
        </button>
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

  // Filter out "Préstamo" category from the view
  const filteredMovements = movements.filter(m => m.category !== 'Préstamo');
  
  // Group movements by category_group_name (from DB)
  const byGroup = {};
  filteredMovements.forEach(movement => {
    const groupName = movement.category_group_name || 'Otros';
    const groupIcon = movement.category_group_icon || '📦';
    const category = movement.category_name || movement.category || 'Sin categoría';
    
    if (!byGroup[groupName]) {
      byGroup[groupName] = { 
        total: 0, 
        categories: {},
        icon: groupIcon // Store group icon
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
    const groupIcon = groupData.icon; // Use icon from DB
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
            
            // Calculate category budget from budgetsData
            let categoryBudget = 0;
            let hasCategoryBudget = false;
            if (budgetsData && budgetsData.budgets) {
              const budgetItem = budgetsData.budgets.find(b => b.category_name === category && b.amount > 0);
              if (budgetItem) {
                categoryBudget = budgetItem.amount;
                hasCategoryBudget = true;
              }
            }

            // Calculate budget indicator for category
            let categoryBudgetIndicator = '';
            if (hasCategoryBudget) {
              const budgetPercentage = ((categoryData.total / categoryBudget) * 100).toFixed(0);
              let budgetColor = '#10b981'; // Green - under budget
              if (budgetPercentage > 100) {
                budgetColor = '#ef4444'; // Red - exceeded
              } else if (budgetPercentage >= 80) {
                budgetColor = '#f59e0b'; // Yellow - on track (80-100%)
              }
              
              categoryBudgetIndicator = `
                <div class="budget-indicator">
                  <div class="budget-text">${formatCurrency(categoryData.total)} / ${formatCurrency(categoryBudget)}</div>
                  <div class="budget-bar">
                    <div class="budget-bar-fill" style="width: ${Math.min(budgetPercentage, 100)}%; background-color: ${budgetColor};"></div>
                  </div>
                  <div class="budget-percentage" style="color: ${budgetColor};">${budgetPercentage}%</div>
                </div>
              `;
            }
            
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
                  ${categoryBudgetIndicator}
                  <svg class="category-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
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
                          ? `<span class="entry-split-badge">Compartido</span>` 
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
      <button id="group-toggle-btn" class="btn-group-toggle" title="Vista cronológica">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 5h14a1 1 0 010 2H3a1 1 0 010-2z"/>
        </svg>
      </button>
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
 * Render chronological view of movements (no grouping)
 */
function renderChronologicalMovements() {
  if (!movementsData || !movementsData.movements || movementsData.movements.length === 0) {
    const hasActiveFilters = selectedCategories.length > 0 || selectedPaymentMethods.length > 0 || selectedMemberIds.length > 0;
    const message = hasActiveFilters 
      ? 'No hay gastos con los filtros seleccionados'
      : 'No hay gastos registrados para este mes';
    
    return `
      <div class="empty-state">
        <div class="empty-icon">🛒</div>
        <p>${message}</p>
        ${!hasActiveFilters ? '<button id="add-expense-btn-empty" class="btn-primary">+ Agregar gasto</button>' : ''}
      </div>
      <div class="floating-actions">
        <button id="group-toggle-btn" class="btn-group-toggle" title="Agrupar">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/>
          </svg>
        </button>
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

  // Filter out "Préstamo" category from the view
  const filteredMovements = movements.filter(m => m.category !== 'Préstamo');

  // Sort movements by date (most recent first)
  const sortedMovements = filteredMovements.sort((a, b) => 
    new Date(b.movement_date) - new Date(a.movement_date)
  );

  const movementsHtml = sortedMovements.map(movement => {
    const description = movement.description || 'Sin descripción';
    const categoryName = movement.category_name || movement.category || 'Sin categoría';
    
    return `
    <div class="chronological-movement-card">
      <div class="movement-main-info">
        <div class="movement-left">
          <div class="movement-description" title="${description}">${description}</div>
          <div class="movement-category-name" title="${categoryName}">${categoryName}</div>
          <div class="movement-amount">${formatCurrency(movement.amount)}</div>
          <div class="movement-date">${formatDate(movement.movement_date)}</div>
        </div>
        <div class="movement-right-actions">
          ${movement.is_split 
            ? `<span class="entry-split-badge">Compartido</span>` 
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
    </div>
  `;
  }).join('');

  return `
    <!-- Filter loading overlay -->
    <div class="filter-loading-overlay" id="filter-loading" style="display: none;">
      <div class="spinner"></div>
      <p>Filtrando...</p>
    </div>
    <div class="chronological-movements-list">
      ${movementsHtml}
    </div>
    <div class="floating-actions">
      <button id="group-toggle-btn" class="btn-group-toggle" title="Agrupar">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/>
        </svg>
      </button>
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
 * Refresh display (handles gastos, ingresos, prestamos, and presupuesto tabs)
 */
function refreshDisplay() {
  const container = document.getElementById('categories-container');
  const loansContainer = document.getElementById('loans-container');
  const dashboardContent = document.querySelector('.dashboard-content');
  
  // For presupuesto tab, we need to re-render the entire dashboard content
  if (activeTab === 'presupuesto') {
    if (dashboardContent) {
      if (budgetsData) {
        dashboardContent.innerHTML = `
          ${renderMonthSelector()}
          
          ${renderBudgets()}
        `;
        setupMonthNavigation();
        setupBudgetListeners();
      } else {
        dashboardContent.innerHTML = `
          ${renderMonthSelector()}
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Cargando...</p>
          </div>
        `;
        setupMonthNavigation();
      }
    }
    return;
  }
  
  if (container) {
    if (activeTab === 'gastos') {
      container.innerHTML = showChronological ? renderChronologicalMovements() : renderMovementCategories();
    } else if (activeTab === 'ingresos') {
      container.innerHTML = renderIncomeCategories();
    }
    setupCategoryListeners();
    setupFilterListeners(); // Re-setup filter listeners after re-render
  }
  
  if (loansContainer && activeTab === 'prestamos') {
    loansContainer.innerHTML = renderLoansCards();
    setupLoansListeners();
    setupLoanButtonListeners();
    setupLoansFilterListeners();
    
    // Update loans summary
    const loansSummary = document.querySelector('.loans-summary');
    if (loansSummary) {
      const summaryToDisplay = window.__filteredLoansSummary || loansData?.summary || { they_owe_us: 0, we_owe: 0 };
      loansSummary.innerHTML = `
        <div class="summary-item">
          <div class="summary-label">Nos deben</div>
          <div class="summary-amount">${formatCurrency(summaryToDisplay.they_owe_us || 0)}</div>
        </div>
        <div class="summary-divider"></div>
        <div class="summary-item">
          <div class="summary-label">Debemos</div>
          <div class="summary-amount">${formatCurrency(summaryToDisplay.we_owe || 0)}</div>
        </div>
      `;
    }
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
 * Handle edit income
 */
async function handleEditIncome(incomeId) {
  // Navigate to edit form with income ID
  router.navigate(`/registrar-movimiento?tipo=INGRESO&edit=${incomeId}`);
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
    
    // Show loading and reload income data
    showLoadingState();
    await loadIncomeData();
    refreshDisplay();
  } catch (error) {
    console.error('Error deleting income:', error);
    showError('Error al eliminar', error.message || 'Error al eliminar el ingreso');
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
    
    // Show loading and reload movements data
    showLoadingState();
    await loadMovementsData();
    refreshDisplay();
  } catch (error) {
    console.error('Error deleting movement:', error);
    showError('Error al eliminar', error.message || 'Error al eliminar el movimiento');
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
        const chevron = item.querySelector('.category-chevron');
        if (details) {
          details.classList.toggle('hidden');
          if (chevron) {
            chevron.classList.toggle('rotated');
          }
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

      if (action === 'edit') {
        await handleEditIncome(id);
      } else if (action === 'delete') {
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

  // Group toggle button (chronological vs grouped view)
  const groupToggleBtn = document.getElementById('group-toggle-btn');
  if (groupToggleBtn) {
    groupToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showChronological = !showChronological;
      refreshDisplay();
    });
  }

  // Setup filter event listeners
  setupFilterListeners();
}

/**
 * Setup budget listeners (for presupuesto tab)
 */
function setupBudgetListeners() {
  // Three-dots menu toggles
  const budgetButtons = document.querySelectorAll('.three-dots-btn[data-category-id]');
  console.log('Budget buttons found:', budgetButtons.length);
  
  budgetButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('Budget button clicked', btn.dataset.categoryId);
      
      const categoryId = btn.dataset.categoryId;
      const menu = document.getElementById(`budget-menu-${categoryId}`);
      console.log('Menu found:', menu);
      
      // Close all other menus
      document.querySelectorAll('.three-dots-menu').forEach(m => {
        if (m !== menu) m.classList.remove('show');
      });
      
      // Toggle this menu
      menu?.classList.toggle('show');
    });
  });
  
  // Menu item actions
  document.querySelectorAll('.three-dots-menu .menu-item[data-action^="add-budget"], .three-dots-menu .menu-item[data-action^="edit-budget"], .three-dots-menu .menu-item[data-action^="delete-budget"]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      
      // Close menu
      item.closest('.three-dots-menu').classList.remove('show');
      
      if (action === 'add-budget') {
        await handleAddBudget(item.dataset.categoryId, item.dataset.categoryName);
      } else if (action === 'edit-budget') {
        await handleEditBudget(
          item.dataset.categoryId,
          item.dataset.budgetId,
          item.dataset.amount,
          item.dataset.categoryName
        );
      } else if (action === 'delete-budget') {
        await handleDeleteBudget(item.dataset.budgetId, item.dataset.categoryName);
      }
    });
  });
  
  // Group expand/collapse for budget groups
  document.querySelectorAll('.expense-group-card[data-group]').forEach(card => {
    const header = card.querySelector('.expense-group-header');
    header?.addEventListener('click', () => {
      const groupName = card.dataset.group;
      const safeGroupId = groupName.replace(/\s+/g, '-').toLowerCase();
      const details = document.getElementById(`budget-group-details-${safeGroupId}`);
      const chevron = card.querySelector('.expense-group-chevron');
      
      if (details) {
        details.classList.toggle('hidden');
        chevron?.classList.toggle('rotated');
      }
    });
  });
  
  // Copy from previous month button
  const copyBtn = document.getElementById('copy-prev-month-budget');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmation(
        '¿Copiar presupuestos del mes anterior?',
        'Esto copiará todos los presupuestos del mes anterior al mes actual. Si ya existen presupuestos configurados, se mantendrán.'
      );
      
      if (confirmed) {
        await copyBudgetsFromPrevMonth();
      }
    });
  }
  
  // Manage categories button
  const manageCategoriesBtn = document.getElementById('manage-categories-btn');
  if (manageCategoriesBtn) {
    manageCategoriesBtn.addEventListener('click', () => {
      router.navigate('/hogar');
    });
  }
}

/**
 * Handle adding a budget
 */
async function handleAddBudget(categoryId, categoryName) {
  const amount = prompt(`Ingrese el presupuesto para ${categoryName}:`);
  if (!amount) return;
  
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    showError('Monto inválido', 'Por favor ingresa un número válido mayor o igual a 0');
    return;
  }
  
  if (parsedAmount === 0) {
    return; // Don't create budget with 0
  }
  
  const result = await setBudget(categoryId, currentMonth, parsedAmount);
  if (result) {
    showSuccess('Presupuesto creado', `El presupuesto para ${categoryName} ha sido creado con ${formatCurrency(parsedAmount)}`);
    await loadBudgetsData();
    refreshDisplay();
  }
}

/**
 * Handle editing a budget
 */
async function handleEditBudget(categoryId, budgetId, currentAmount, categoryName) {
  const amount = prompt(`Editar presupuesto para ${categoryName}:`, currentAmount);
  if (amount === null || amount === currentAmount) return;
  
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    showError('Monto inválido', 'Por favor ingresa un número válido mayor o igual a 0');
    return;
  }
  
  // If amount is 0, delete the budget
  if (parsedAmount === 0) {
    const deleted = await deleteBudget(budgetId);
    if (deleted) {
      showSuccess('Presupuesto eliminado', `El presupuesto para ${categoryName} ha sido eliminado`);
      await loadBudgetsData();
      refreshDisplay();
    }
    return;
  }
  
  const result = await setBudget(categoryId, currentMonth, parsedAmount);
  if (result) {
    showSuccess('Presupuesto actualizado', `El presupuesto para ${categoryName} ha sido actualizado a ${formatCurrency(parsedAmount)}`);
    await loadBudgetsData();
    refreshDisplay();
  }
}

/**
 * Handle deleting a budget
 */
async function handleDeleteBudget(budgetId, categoryName) {
  const confirmed = await showConfirmation(
    'Eliminar presupuesto',
    `¿Estás seguro de que deseas eliminar el presupuesto para ${categoryName}?`,
    'Eliminar'
  );
  
  if (!confirmed) return;
  
  const deleted = await deleteBudget(budgetId);
  if (deleted) {
    showSuccess('Presupuesto eliminado', `El presupuesto para ${categoryName} ha sido eliminado`);
    await loadBudgetsData();
    refreshDisplay();
  }
}

/**
 * Setup loans view listeners (for prestamos tab)
 */
function setupLoansListeners() {
  // Debt pair card click to expand/collapse (Level 1 → Level 2)
  const loanCards = document.querySelectorAll('.expense-group-card[data-debtor-id]');
  loanCards.forEach((card) => {
    const header = card.querySelector('.expense-group-header');
    if (header) {
      header.addEventListener('click', () => {
        const debtorId = card.dataset.debtorId;
        const creditorId = card.dataset.creditorId;
        const detailsContainer = document.getElementById(`loan-details-${debtorId}-${creditorId}`);
        
        if (detailsContainer) {
          const isHidden = detailsContainer.classList.contains('hidden');
          
          if (isHidden) {
            // Render Level 2 content
            detailsContainer.innerHTML = renderLoanDetails(debtorId, creditorId);
            detailsContainer.classList.remove('hidden');
            
            // Setup listeners for newly rendered elements
            setupLoanDetailsListeners(debtorId, creditorId);
          } else {
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
  
  directionItems.forEach((item) => {
    const header = item.querySelector('.expense-category-header');
    if (header) {
      header.addEventListener('click', () => {
        const direction = item.dataset.direction;
        const detailsContainer = item.querySelector('.expense-category-details');
        
        if (detailsContainer) {
          const isHidden = detailsContainer.classList.contains('hidden');
          
          if (isHidden) {
            // Render Level 3 content
            detailsContainer.innerHTML = renderLoanMovements(debtorId, creditorId, direction);
            detailsContainer.classList.remove('hidden');
            
            // Setup listeners for movement actions
            setupLoanMovementListeners();
          } else {
            detailsContainer.classList.add('hidden');
          }
        }
      });
    }
  });
}

/**
 * Setup loan button listeners (+ and filter buttons)
 */
function setupLoanButtonListeners() {
  // Add loan button (in category list)
  const addLoanBtn = document.getElementById('add-loan-btn');
  if (addLoanBtn) {
    addLoanBtn.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=LOAN');
    });
  }

  // Add loan button (in empty state)
  const addLoanBtnEmpty = document.getElementById('add-loan-btn-empty');
  if (addLoanBtnEmpty) {
    addLoanBtnEmpty.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=LOAN');
    });
  }

  // Filter loans button
  const filterLoansBtn = document.getElementById('filter-loans-btn');
  if (filterLoansBtn) {
    filterLoansBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isLoansFilterOpen = !isLoansFilterOpen;
      const dropdown = document.getElementById('loans-filter-dropdown');
      if (dropdown) {
        dropdown.style.display = isLoansFilterOpen ? 'block' : 'none';
      }
    });
  }
}

/**
 * Setup loans filter listeners
 */
function setupLoansFilterListeners() {
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('loans-filter-dropdown');
    const filterBtn = document.getElementById('filter-loans-btn');
    if (dropdown && !dropdown.contains(e.target) && e.target !== filterBtn && !filterBtn?.contains(e.target)) {
      isLoansFilterOpen = false;
      dropdown.style.display = 'none';
    }
  });

  // Select all members
  const selectAllMembersBtn = document.getElementById('select-all-loan-members');
  if (selectAllMembersBtn) {
    selectAllMembersBtn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-type="loan-person"][data-person-type="member"]').forEach(checkbox => {
        checkbox.checked = true;
      });
    });
  }

  // Clear all members
  const clearAllMembersBtn = document.getElementById('clear-all-loan-members');
  if (clearAllMembersBtn) {
    clearAllMembersBtn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-type="loan-person"][data-person-type="member"]').forEach(checkbox => {
        checkbox.checked = false;
      });
    });
  }

  // Select all contacts
  const selectAllContactsBtn = document.getElementById('select-all-loan-contacts');
  if (selectAllContactsBtn) {
    selectAllContactsBtn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-type="loan-person"][data-person-type="contact"]').forEach(checkbox => {
        checkbox.checked = true;
      });
    });
  }

  // Clear all contacts
  const clearAllContactsBtn = document.getElementById('clear-all-loan-contacts');
  if (clearAllContactsBtn) {
    clearAllContactsBtn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-type="loan-person"][data-person-type="contact"]').forEach(checkbox => {
        checkbox.checked = false;
      });
    });
  }

  // Clear filter button
  const clearFilterBtn = document.getElementById('clear-loans-filter');
  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
      selectedLoanPeople = [];
      isLoansFilterOpen = false;
      const dropdown = document.getElementById('loans-filter-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      
      // Show filter loading overlay
      const filterLoading = document.getElementById('filter-loading');
      if (filterLoading) filterLoading.style.display = 'flex';
      
      // Use setTimeout to allow UI to update before re-rendering
      setTimeout(() => {
        refreshDisplay();
        
        // Hide filter loading overlay
        const filterLoadingEnd = document.getElementById('filter-loading');
        if (filterLoadingEnd) filterLoadingEnd.style.display = 'none';
      }, 50);
    });
  }

  // Apply filter button
  const applyFilterBtn = document.getElementById('apply-loans-filter');
  if (applyFilterBtn) {
    applyFilterBtn.addEventListener('click', () => {
      const checkedPeople = Array.from(document.querySelectorAll('[data-filter-type="loan-person"]:checked'))
        .map(cb => cb.dataset.value);
      
      // If all are checked or none are checked, show all
      const allPeopleCheckboxes = document.querySelectorAll('[data-filter-type="loan-person"]');
      if (checkedPeople.length === 0 || checkedPeople.length === allPeopleCheckboxes.length) {
        selectedLoanPeople = [];
      } else {
        selectedLoanPeople = checkedPeople;
      }
      
      isLoansFilterOpen = false;
      const dropdown = document.getElementById('loans-filter-dropdown');
      if (dropdown) dropdown.style.display = 'none';
      
      // Show filter loading overlay
      const filterLoading = document.getElementById('filter-loading');
      if (filterLoading) filterLoading.style.display = 'flex';
      
      // Use setTimeout to allow UI to update before re-rendering
      setTimeout(() => {
        refreshDisplay();
        
        // Hide filter loading overlay
        const filterLoadingEnd = document.getElementById('filter-loading');
        if (filterLoadingEnd) filterLoadingEnd.style.display = 'none';
      }, 50);
    });
  }
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
    
    // Show loading and reload loans data
    showLoadingState();
    await loadLoansData();
    refreshDisplay();
  } catch (error) {
    console.error('Error deleting loan movement:', error);
    showError('Error al eliminar', error.message || 'Error al eliminar el movimiento');
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
 * Reload active tab data (called after creating/editing movements)
 */
export async function reloadActiveTab() {
  showLoadingState();
  
  // Load category groups (once, used for filters)
  await loadCategoryGroups();
  
  if (activeTab === 'gastos') {
    await loadMovementsData();
  } else if (activeTab === 'ingresos') {
    await loadIncomeData();
  } else if (activeTab === 'prestamos') {
    await loadLoansData();
  }
  
  refreshDisplay();
}

/**
 * Mark tabs for reload (lazy reload - only reload when user navigates to them)
 */
export function markTabsForReload(tabs) {
  tabs.forEach(tab => tabsNeedingReload.add(tab));
  
  // If the active tab is in the list, clear its data immediately
  if (tabs.includes(activeTab)) {
    clearTabData([activeTab]);
  }
}

/**
 * Clear tab data to force reload (prevents showing stale data)
 */
export function clearTabData(tabsToReload = []) {
  // If no specific tabs provided, clear all (backward compatibility)
  if (tabsToReload.length === 0) {
    movementsData = null;
    originalMovementsData = null;
    incomeData = null;
    loansData = null;
    return;
  }
  
  // Clear only specified tabs
  if (tabsToReload.includes('gastos')) {
    movementsData = null;
    originalMovementsData = null;
  }
  if (tabsToReload.includes('ingresos')) {
    incomeData = null;
  }
  if (tabsToReload.includes('prestamos')) {
    loansData = null;
  }
  if (tabsToReload.includes('presupuesto')) {
    budgetsData = null;
  }
  // tarjetas will be added when implemented
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

  // Check URL parameters for active tab and reload
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get('tab');
  if (tabParam && ['gastos', 'ingresos', 'prestamos', 'presupuesto', 'tarjetas'].includes(tabParam)) {
    activeTab = tabParam;
  }
  
  // Check for tabs that need to be reloaded
  const reloadParam = urlParams.get('reload');
  if (reloadParam) {
    const tabsToReload = reloadParam.split(',').filter(t => 
      ['gastos', 'ingresos', 'prestamos', 'presupuesto', 'tarjetas'].includes(t)
    );
    // Clear data for tabs that need reload
    clearTabData(tabsToReload);
    // Mark non-active tabs for reload when user navigates to them
    tabsToReload.forEach(tab => {
      if (tab !== activeTab) {
        tabsNeedingReload.add(tab);
      }
    });
  }

  // Load household members for filter
  await loadHouseholdMembers();

  // Load data based on active tab (gastos by default)
  if (activeTab === 'gastos') {
    await loadMovementsData();
  } else if (activeTab === 'ingresos') {
    await loadIncomeData();
  } else if (activeTab === 'prestamos') {
    await loadLoansData();
  } else if (activeTab === 'presupuesto') {
    await loadBudgetsData();
  }
  
  // Remove active tab from reload set since we just loaded it
  tabsNeedingReload.delete(activeTab);
  
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
      setupMonthNavigation();
      setupLoansListeners();
      setupLoanButtonListeners();
      setupLoansFilterListeners();
    } else if (activeTab === 'presupuesto' && budgetsData) {
      contentContainer.innerHTML = `
        ${renderMonthSelector()}
        
        ${renderBudgets()}
      `;
      setupMonthNavigation();
      setupBudgetListeners();
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
      
      // Check if this tab needs reload (was invalidated)
      if (tabsNeedingReload.has(activeTab)) {
        clearTabData([activeTab]);
        tabsNeedingReload.delete(activeTab);
      }
      
      // Load data for the new tab only if not already loaded
      const needsLoad = (activeTab === 'gastos' && !movementsData) ||
                        (activeTab === 'ingresos' && !incomeData) ||
                        (activeTab === 'prestamos' && !loansData) ||
                        (activeTab === 'presupuesto' && !budgetsData);
      
      if (needsLoad) {
        // Show loading state immediately
        const contentContainer = document.querySelector('.dashboard-content');
        if (contentContainer) {
          contentContainer.innerHTML = `
            <div class="loading-state">
              <div class="loading-spinner"></div>
              <p>Cargando...</p>
            </div>
          `;
        }
        
        // Load data based on active tab
        if (activeTab === 'gastos') {
          await loadMovementsData();
        } else if (activeTab === 'ingresos') {
          await loadIncomeData();
        } else if (activeTab === 'prestamos') {
          await loadLoansData();
        } else if (activeTab === 'presupuesto') {
          await loadBudgetsData();
        }
      }
      
      // Update content
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
            
            <div class="loans-summary">
              <div class="summary-item">
                <div class="summary-label">Nos deben</div>
                <div class="summary-amount">${formatCurrency(loansData?.summary?.they_owe_us || 0)}</div>
              </div>
              <div class="summary-divider"></div>
              <div class="summary-item">
                <div class="summary-label">Debemos</div>
                <div class="summary-amount">${formatCurrency(loansData?.summary?.we_owe || 0)}</div>
              </div>
            </div>
            
            <div id="loans-container">
              ${renderLoansCards()}
            </div>
          `;
          setupMonthNavigation();
          setupLoansListeners();
          setupLoanButtonListeners();
          setupLoansFilterListeners();
        } else if (activeTab === 'presupuesto') {
          contentContainer.innerHTML = `
            ${renderMonthSelector()}
            
            ${renderBudgets()}
          `;
          setupMonthNavigation();
          setupBudgetListeners();
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
  const dashboardContent = document.querySelector('.dashboard-content');
  
  // For presupuesto tab, show loading in the entire dashboard content
  if (activeTab === 'presupuesto' && dashboardContent) {
    dashboardContent.innerHTML = `
      ${renderMonthSelector()}
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Cargando...</p>
      </div>
    `;
    setupMonthNavigation();
    return;
  }
  
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
      } else if (activeTab === 'presupuesto') {
        await loadBudgetsData();
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
      } else if (activeTab === 'presupuesto') {
        await loadBudgetsData();
      }
      refreshDisplay();
    };
  }
}
