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
import { showConfirmation, showSuccess, showError, showInputModal, getSimplifiedCategoryName } from '../utils.js';
import { MovementFormState, FormFieldController } from '../components/movement-form.js';

let currentUser = null;
let currentMonth = null; // YYYY-MM format
let incomeData = null;
let movementsData = null; // Gastos data (filtered)
let originalMovementsData = null; // Original unfiltered movements data from API
let loansData = null; // Préstamos data (debts consolidation with movement details)
let creditCardsData = null; // Tarjetas data (credit card summary)
let activeTab = 'gastos'; // 'gastos', 'ingresos', 'prestamos', 'presupuesto', 'tarjetas' - DEFAULT TO GASTOS
let householdMembers = []; // List of household members for filtering
let selectedMemberIds = []; // Array of selected member IDs (empty = all)
let selectedIncomeTypes = []; // Array of selected income types (empty = all)
let selectedCategories = []; // Array of selected categories for gastos filter (empty = all)
let selectedPaymentMethods = []; // Array of selected payment method IDs for gastos filter (empty = all)
let selectedLoanPeople = []; // Array of selected person IDs for loans filter (empty = all)
let selectedCardIds = []; // Array of selected credit card IDs for tarjetas filter (empty = all)
let selectedCardOwnerIds = []; // Array of selected owner IDs for tarjetas filter (empty = all)
let allCreditCards = []; // All credit cards for filter dropdown (not filtered)
let allCardOwners = []; // All card owners for filter dropdown (not filtered)
let isFilterOpen = false; // Track if filter dropdown is open
let isLoansFilterOpen = false; // Track if loans filter dropdown is open
let isCardsFilterOpen = false; // Track if cards filter dropdown is open
let tabsNeedingReload = new Set(); // Tabs that need to reload when activated ('gastos', 'ingresos', 'prestamos', 'presupuesto', 'tarjetas')
let budgetsData = null; // Presupuesto data
let templatesData = {}; // Templates data grouped by category_id (initialize as empty object)
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
 * Format billing cycle period (e.g., "Dic 31 - Ene 30")
 * Uses UTC to avoid timezone conversion issues
 */
function formatBillingPeriod(billingCycle) {
  if (!billingCycle || !billingCycle.start_date || !billingCycle.end_date) return '';
  
  const startDate = new Date(billingCycle.start_date);
  const endDate = new Date(billingCycle.end_date);
  
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  // Use UTC methods to avoid timezone conversion
  const startDay = startDate.getUTCDate();
  const startMonth = monthNames[startDate.getUTCMonth()];
  const endDay = endDate.getUTCDate();
  const endMonth = monthNames[endDate.getUTCMonth()];
  
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
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
    const safeCategoryId = budget.category_id.replace(/[^a-zA-Z0-9]/g, '-');
    
    // Get templates for this category (handle null/undefined templatesData)
    const templates = (templatesData && templatesData[budget.category_id]) || [];
    
    return `
      <div class="expense-category-item">
        <div class="expense-category-header" onclick="toggleBudgetCategoryDetails('${safeCategoryId}')">
          <div class="expense-category-info">
            <span class="expense-category-name">${simplifiedName}</span>
            <span class="expense-category-amount">
              ${hasBudget ? formatCurrency(budget.amount) : '<span class="no-budget-text">Sin presupuesto</span>'}
            </span>
          </div>
          <svg class="category-chevron" width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="expense-category-details hidden" id="budget-category-details-${safeCategoryId}">
          ${templates.length > 0 ? `
            ${templates.map(template => renderTemplateItem(template)).join('')}
          ` : `
            <div class="empty-templates-message" style="text-align: center; color: #6c757d; padding: 16px; font-size: 14px;">
              No hay gastos presupuestados
            </div>
          `}
          <div class="budget-action-buttons">
            ${hasBudget ? `
              <button class="budget-action-btn" data-action="edit-budget" data-category-id="${budget.category_id}" data-budget-id="${budget.id}" data-amount="${budget.amount}" data-category-name="${simplifiedName}">
                Editar presupuesto total
              </button>
            ` : `
              <button class="budget-action-btn" data-action="add-budget" data-category-id="${budget.category_id}" data-category-name="${simplifiedName}">
                <span style="font-size: 18px; margin-right: 8px;">+</span> Agregar presupuesto total
              </button>
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
    
    <!-- Floating add button -->
    <div class="floating-actions">
      <button id="add-template-btn" class="btn-add-floating" title="Presupuestar nuevo gasto">+</button>
    </div>
  `;
}

/**
 * Render individual template item (reuses movement-detail-entry CSS)
 */
function renderTemplateItem(template) {
  const amountDisplay = formatCurrency(template.amount);
  
  const scheduleDisplay = template.auto_generate
    ? `Cada día ${template.day_of_month}`
    : 'Manual';
  
  return `
    <div class="movement-detail-entry" data-template-id="${template.id}">
      <div class="entry-info">
        <span class="entry-description">${template.name}</span>
        <span class="entry-amount">${amountDisplay}</span>
        <div class="entry-date">${scheduleDisplay}</div>
      </div>
      <div class="entry-actions">
        ${template.movement_type === 'SPLIT' 
          ? `<span class="entry-split-badge">Compartido</span>` 
          : template.payment_method_name 
            ? `<span class="entry-payment-badge">${template.payment_method_name}</span>` 
            : ''
        }
        <button class="three-dots-btn" data-template-id="${template.id}">⋮</button>
        <div class="three-dots-menu" id="template-menu-${template.id}">
          <button class="menu-item" data-action="edit-template" data-template-id="${template.id}">
            Editar
          </button>
          <button class="menu-item menu-item-danger" data-action="delete-template" data-template-id="${template.id}">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Toggle budget category details visibility
 */
function toggleBudgetCategoryDetails(categoryId) {
  const details = document.getElementById(`budget-category-details-${categoryId}`);
  if (!details) return;
  
  const header = details.previousElementSibling; // Header is now directly before details
  const chevron = header?.querySelector('.category-chevron');
  
  details.classList.toggle('hidden');
  if (chevron) {
    chevron.style.transform = details.classList.contains('hidden') 
      ? 'rotate(0deg)' 
      : 'rotate(90deg)';
  }
}

// Make function globally accessible for onclick handlers
window.toggleBudgetCategoryDetails = toggleBudgetCategoryDetails;

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
    const isSettled = Math.abs(balance.amount) < 1; // Less than $1 COP = settled
    
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
        ` : activeTab === 'tarjetas' && creditCardsData ? `
          ${renderCreditCardsMonthSelector()}
          
          <div class="loans-summary">
            <div class="summary-item">
              <div class="summary-label">Deuda total</div>
              <div class="summary-amount debt-amount">${formatCurrency(creditCardsData?.totals?.total_debt || 0)}</div>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
              <div class="summary-label">Disponible</div>
              <div class="summary-amount ${creditCardsData?.can_pay_all ? 'available-positive' : 'available-negative'}">${formatCurrency(creditCardsData?.available_cash?.total || 0)}</div>
            </div>
          </div>

          <div id="cards-container">
            ${renderCreditCards()}
          </div>
        ` : activeTab === 'tarjetas' ? `
          <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>Cargando...</p>
          </div>
        ` : `
          <div class="coming-soon">
            <div class="coming-soon-icon">❓</div>
            <p>Tab desconocido</p>
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
    
    // Cache form config globally for template modal
    window.formConfigCache = data;
    
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

    // Handle 404 errors for movements (user has no household)
    if (householdResponse.status === 404 || splitResponse.status === 404) {
      console.log('User has no household - initializing empty data');
      movementsData = null;
      budgetsData = null;
      return;
    }

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
        const isIncluded = selectedCategories.includes(movement.category_id);
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
      const categoryName = movement.category_name || 'Sin categoría';
      byCategory[categoryName] = (byCategory[categoryName] || 0) + movement.amount;
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
    // Load budgets and templates in parallel
    const [budgetsResponse, templatesResponse] = await Promise.all([
      fetch(`${API_URL}/budgets/${currentMonth}`, {
        credentials: 'include'
      }),
      fetch(`${API_URL}/api/recurring-movements`, {
        credentials: 'include'
      })
    ]);

    // Handle budgets response
    if (!budgetsResponse.ok) {
      if (budgetsResponse.status === 404) {
        // No budgets for this month yet
        budgetsData = { month: currentMonth, budgets: [], totals: { total_budget: 0, total_spent: 0, percentage: 0 } };
      } else {
        console.error('Error loading budgets data');
        budgetsData = null;
      }
    } else {
      budgetsData = await budgetsResponse.json();
    }

    // Handle templates response
    if (!templatesResponse.ok) {
      console.error('Error loading recurring movements');
      templatesData = {};
    } else {
      try {
        const templatesArray = await templatesResponse.json(); // Direct array, not wrapped
        
        // Group templates by category_id
        templatesData = {};
        if (Array.isArray(templatesArray)) {
          templatesArray.forEach(t => {
            if (!templatesData[t.category_id]) {
              templatesData[t.category_id] = [];
            }
            templatesData[t.category_id].push(t);
          });
        }
        
        // Sort templates within each category:
      // 1. Periodic (auto_generate=true) first
      // 2. Manual (auto_generate=false) second
      // 3. Within each group: by amount (highest to lowest, Variable=0)
      Object.keys(templatesData).forEach(categoryId => {
        templatesData[categoryId].sort((a, b) => {
          // First sort by auto_generate (periodic first)
          if (a.auto_generate !== b.auto_generate) {
            return a.auto_generate ? -1 : 1;
          }
          
          // Then sort by amount (highest first)
          const amountA = a.amount || 0;
          const amountB = b.amount || 0;
          return amountB - amountA;
        });
      });
      
      } catch (jsonError) {
        console.error('Error parsing recurring movements response:', jsonError);
        templatesData = {};
      }
    }
  } catch (error) {
    console.error('Error loading budgets data:', error);
    budgetsData = null;
    templatesData = {};
  }
}

/**
 * Load credit cards data for the current billing cycle
 */
async function loadCreditCardsData() {
  try {
    // Use day 15 of the current month as cycle_date
    // This works best for cards with cutoff day 28 (majority case)
    const cycleDate = `${currentMonth}-15`;
    
    // Build query params for filters
    let url = `${API_URL}/credit-cards/summary?cycle_date=${cycleDate}`;
    
    if (selectedCardIds && selectedCardIds.length > 0) {
      url += `&card_ids=${selectedCardIds.join(',')}`;
    }
    if (selectedCardOwnerIds && selectedCardOwnerIds.length > 0) {
      url += `&owner_ids=${selectedCardOwnerIds.join(',')}`;
    }
    
    const response = await fetch(url, {
      credentials: 'include'
    });

    if (!response.ok) {
      console.error('Error loading credit cards data');
      creditCardsData = null;
      return;
    }

    creditCardsData = await response.json();
    
    // On first load (no filters), store all cards for the filter dropdown
    if (allCreditCards.length === 0 && creditCardsData?.cards) {
      allCreditCards = creditCardsData.cards.map(c => ({ id: c.id, name: c.name, owner_id: c.owner_id, owner_name: c.owner_name }));
      
      // Extract unique owners
      const ownerIds = new Set();
      allCardOwners = [];
      creditCardsData.cards.forEach(card => {
        if (!ownerIds.has(card.owner_id)) {
          ownerIds.add(card.owner_id);
          allCardOwners.push({ id: card.owner_id, name: card.owner_name });
        }
      });
    }
    
  } catch (error) {
    console.error('Error loading credit cards data:', error);
    creditCardsData = null;
  }
}

/**
 * Render month selector for credit cards (same as other tabs)
 */
function renderCreditCardsMonthSelector() {
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
 * Render credit cards (Tarjetas tab)
 */
function renderCreditCards() {
  if (!creditCardsData || !creditCardsData.cards || creditCardsData.cards.length === 0) {
    // Check if filters are active
    const hasFilters = (selectedCardIds && selectedCardIds.length > 0) || 
                       (selectedCardOwnerIds && selectedCardOwnerIds.length > 0);
    
    const emptyMessage = hasFilters 
      ? 'No hay tarjetas que coincidan con los filtros seleccionados'
      : 'No hay tarjetas de crédito configuradas';
    
    const emptyAction = hasFilters
      ? `<button class="btn-secondary" id="clear-filters-empty">Mostrar todo</button>`
      : `<a href="/hogar" class="btn-primary">Configurar tarjetas</a>`;
    
    return `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>${emptyMessage}</p>
        ${emptyAction}
      </div>
      <div class="floating-actions">
        <button id="filter-cards-btn" class="btn-filter-floating" title="Filtrar">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 10.414V17a1 1 0 01-.447.894l-2 1.333A1 1 0 018 18.333V10.414L3.293 5.707A1 1 0 013 5V3z"/>
          </svg>
        </button>
        ${renderCardsFilterDropdown()}
        <button id="add-card-payment-btn" class="btn-add-floating">+</button>
      </div>
    `;
  }

  const cardsHtml = creditCardsData.cards.map(card => {
    const hasDebt = card.net_debt > 0;
    const isPaid = card.net_debt <= 0;
    const billingPeriod = formatBillingPeriod(card.billing_cycle);
    
    return `
      <div class="expense-group-card credit-card-card ${isPaid ? 'card-paid' : ''}" data-card-id="${card.id}">
        <div class="expense-group-header">
          <div class="expense-group-icon-container">
            <span class="expense-group-icon">💳</span>
          </div>
          <div class="expense-group-info">
            <div class="expense-group-name">${card.name}</div>
            <div class="expense-group-amount ${isPaid ? 'paid-amount' : ''}">${isPaid ? '✓ Pagado' : formatCurrency(card.net_debt)}</div>
          </div>
          <div class="card-period-badge">${billingPeriod}</div>
          <svg class="expense-group-chevron" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </div>
        <div class="expense-group-details hidden" id="card-details-${card.id}">
          <!-- Charges and payments will be loaded when expanded -->
          <div class="card-loading">
            <div class="loading-spinner-small"></div>
            <span>Cargando movimientos...</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <!-- Filter loading overlay -->
    <div class="filter-loading-overlay" id="filter-loading" style="display: none;">
      <div class="loading-spinner"></div>
    </div>
    
    ${cardsHtml}
    
    <div class="floating-actions">
      <button id="filter-cards-btn" class="btn-filter-floating" title="Filtrar">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 10.414V17a1 1 0 01-.447.894l-2 1.333A1 1 0 018 18.333V10.414L3.293 5.707A1 1 0 013 5V3z"/>
        </svg>
      </button>
      ${renderCardsFilterDropdown()}
      <button id="add-card-payment-btn" class="btn-add-floating">+</button>
    </div>
  `;
}

/**
 * Render filter dropdown for credit cards
 */
function renderCardsFilterDropdown() {
  return `
    <div class="filter-dropdown" id="cards-filter-dropdown">
      <div class="filter-section">
        <div class="filter-section-header">
          <span class="filter-section-title">Tarjetas</span>
          <div class="filter-section-actions">
            <button class="filter-link-btn" id="cards-select-all">Todos</button>
            <button class="filter-link-btn" id="cards-select-none">Limpiar</button>
          </div>
        </div>
        <div class="filter-options">
          ${allCreditCards.map(card => {
            const isSelected = !selectedCardIds || selectedCardIds.length === 0 || selectedCardIds.includes(card.id);
            return `
              <label class="filter-checkbox-label">
                <input type="checkbox" class="filter-checkbox card-filter-checkbox" 
                       value="${card.id}" 
                       ${isSelected ? 'checked' : ''}>
                <span>${card.name}</span>
              </label>
            `;
          }).join('') || '<p class="filter-empty">No hay tarjetas</p>'}
        </div>
      </div>
      
      <div class="filter-section">
        <div class="filter-section-header">
          <span class="filter-section-title">Propietario</span>
          <div class="filter-section-actions">
            <button class="filter-link-btn" id="owners-select-all">Todos</button>
            <button class="filter-link-btn" id="owners-select-none">Limpiar</button>
          </div>
        </div>
        <div class="filter-options">
          ${allCardOwners.map(owner => {
            const isSelected = !selectedCardOwnerIds || selectedCardOwnerIds.length === 0 || selectedCardOwnerIds.includes(owner.id);
            return `
              <label class="filter-checkbox-label">
                <input type="checkbox" class="filter-checkbox owner-filter-checkbox" 
                       value="${owner.id}" 
                       ${isSelected ? 'checked' : ''}>
                <span>${owner.name}</span>
              </label>
            `;
          }).join('') || '<p class="filter-empty">No hay propietarios</p>'}
        </div>
      </div>

      <div class="filter-footer">
        <button class="btn-secondary btn-small" id="clear-cards-filters">Mostrar todo</button>
        <button class="btn-primary btn-small" id="apply-cards-filters">Aplicar</button>
      </div>
    </div>
  `;
}

/**
 * Render card movements (charges and payments) when a card is expanded
 */
async function loadAndRenderCardMovements(cardId) {
  const detailsContainer = document.getElementById(`card-details-${cardId}`);
  if (!detailsContainer) return;

  try {
    // Use day 15 of the current month as cycle_date
    const cycleDate = `${currentMonth}-15`;
    const response = await fetch(`${API_URL}/credit-cards/${cardId}/movements?cycle_date=${cycleDate}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      detailsContainer.innerHTML = `
        <div class="error-message">
          <p>Error al cargar movimientos</p>
        </div>
      `;
      return;
    }

    const data = await response.json();
    
    // Render charges section
    const chargesHtml = data.charges?.movements?.length > 0 ? `
      <div class="expense-category-item card-section">
        <div class="expense-category-header" data-section="charges-${cardId}">
          <div class="expense-category-info">
            <span class="expense-category-name">Gastos</span>
            <span class="expense-category-amount">${formatCurrency(data.charges.total)}</span>
          </div>
          <svg class="category-chevron" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </div>
        <div class="expense-category-details hidden" id="charges-${cardId}">
          ${data.charges.movements.map(m => `
            <div class="movement-detail-entry">
              <div class="entry-info">
                <span class="entry-description">${m.description || 'Sin descripción'}</span>
                <span class="entry-amount">${formatCurrency(m.amount)}</span>
                <div class="entry-date">${formatDate(m.movement_date)}</div>
              </div>
              <div class="entry-actions">
                ${m.category_name ? `<span class="entry-payment-badge">${m.category_name}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : `
      <div class="expense-category-item card-section">
        <div class="expense-category-header">
          <div class="expense-category-info">
            <span class="expense-category-name">Gastos</span>
            <span class="expense-category-amount">${formatCurrency(0)}</span>
          </div>
        </div>
      </div>
    `;

    // Render payments section
    const paymentsHtml = data.payments?.items?.length > 0 ? `
      <div class="expense-category-item card-section">
        <div class="expense-category-header" data-section="payments-${cardId}">
          <div class="expense-category-info">
            <span class="expense-category-name">Abonos</span>
            <span class="expense-category-amount">${formatCurrency(data.payments.total)}</span>
          </div>
          <svg class="category-chevron" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </div>
        <div class="expense-category-details hidden" id="payments-${cardId}">
          ${data.payments.items.map(p => `
            <div class="movement-detail-entry payment-entry">
              <div class="entry-info">
                <span class="entry-description">${p.notes || 'Abono a tarjeta'}</span>
                <span class="entry-amount">${formatCurrency(p.amount)}</span>
                <div class="entry-date">${formatDate(p.payment_date)}</div>
              </div>
              <div class="entry-actions">
                <span class="entry-account-badge">${p.source_account_name}</span>
                <button class="three-dots-btn" data-payment-id="${p.id}">⋮</button>
                <div class="three-dots-menu" id="payment-menu-${p.id}">
                  <button class="menu-item menu-item-danger" data-action="delete-payment" data-payment-id="${p.id}">Eliminar</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : `
      <div class="expense-category-item card-section">
        <div class="expense-category-header">
          <div class="expense-category-info">
            <span class="expense-category-name">Abonos</span>
            <span class="expense-category-amount">${formatCurrency(0)}</span>
          </div>
        </div>
      </div>
    `;

    detailsContainer.innerHTML = chargesHtml + paymentsHtml;
    
    // Setup expand/collapse for charges and payments sections
    setupCardSectionListeners(cardId);
    
  } catch (error) {
    console.error('Error loading card movements:', error);
    detailsContainer.innerHTML = `
      <div class="error-message">
        <p>Error al cargar movimientos</p>
      </div>
    `;
  }
}

/**
 * Setup listeners for card sections (charges/payments expand/collapse)
 */
function setupCardSectionListeners(cardId) {
  // Charges section
  const chargesHeader = document.querySelector(`[data-section="charges-${cardId}"]`);
  if (chargesHeader) {
    chargesHeader.addEventListener('click', () => {
      const movements = document.getElementById(`charges-${cardId}`);
      const chevron = chargesHeader.querySelector('.category-chevron');
      if (movements) {
        movements.classList.toggle('hidden');
        chevron?.classList.toggle('rotated');
      }
    });
  }

  // Payments section
  const paymentsHeader = document.querySelector(`[data-section="payments-${cardId}"]`);
  if (paymentsHeader) {
    paymentsHeader.addEventListener('click', () => {
      const movements = document.getElementById(`payments-${cardId}`);
      const chevron = paymentsHeader.querySelector('.category-chevron');
      if (movements) {
        movements.classList.toggle('hidden');
        chevron?.classList.toggle('rotated');
      }
    });
  }

  // Payment menu buttons
  document.querySelectorAll(`#card-details-${cardId} .three-dots-btn`).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const paymentId = btn.dataset.paymentId;
      const menu = document.getElementById(`payment-menu-${paymentId}`);
      
      // Close all other menus
      document.querySelectorAll('.three-dots-menu').forEach(m => {
        if (m.id !== `payment-menu-${paymentId}`) m.style.display = 'none';
      });
      
      if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      }
    });
  });

  // Delete payment action
  document.querySelectorAll(`#card-details-${cardId} [data-action="delete-payment"]`).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const paymentId = btn.dataset.paymentId;
      await handleDeleteCardPayment(paymentId, cardId);
    });
  });
}

/**
 * Handle delete card payment
 */
async function handleDeleteCardPayment(paymentId, cardId) {
  const confirmed = await showConfirmation(
    '¿Eliminar este abono?',
    'Esta acción no se puede deshacer.'
  );
  
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_URL}/credit-card-payments/${paymentId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Error al eliminar el abono');
    }

    showSuccess('Abono eliminado', 'El abono se ha eliminado correctamente');
    
    // Reload card movements
    await loadAndRenderCardMovements(cardId);
    
    // Reload summary to update totals
    await loadCreditCardsData();
    refreshDisplay();
    
  } catch (error) {
    console.error('Error deleting payment:', error);
    showError('Error', error.message || 'Error al eliminar el abono');
  }
}

/**
 * Show card payment modal
 */
async function showCardPaymentModal() {
  // Get savings accounts for source dropdown
  let accounts = [];
  let creditCards = [];
  
  try {
    // Fetch accounts and payment methods in parallel
    const [accountsResponse, configResponse] = await Promise.all([
      fetch(`${API_URL}/accounts`, { credentials: 'include' }),
      fetch(`${API_URL}/movement-form-config`, { credentials: 'include' })
    ]);
    
    if (accountsResponse.ok) {
      const accountsData = await accountsResponse.json();
      accounts = (accountsData.accounts || accountsData || []).filter(a => a.type === 'savings' || a.type === 'cash');
    }
    
    if (configResponse.ok) {
      const config = await configResponse.json();
      creditCards = config.payment_methods?.filter(pm => pm.type === 'credit_card') || [];
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }

  if (creditCards.length === 0) {
    showError('Sin tarjetas', 'No hay tarjetas de crédito configuradas. Ve a Hogar para configurarlas.');
    return;
  }

  if (accounts.length === 0) {
    showError('Sin cuentas', 'No hay cuentas de ahorro configuradas para realizar pagos.');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'card-payment-modal';
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px; max-height: 90vh; overflow-y: auto;">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">
        Registrar abono a tarjeta
      </h3>
      
      <form id="card-payment-form" style="display: flex; flex-direction: column; gap: 16px;">
        <label class="field">
          <span>Tarjeta de crédito *</span>
          <select id="payment-card" required>
            <option value="">Selecciona una tarjeta</option>
            ${creditCards.map(card => `
              <option value="${card.id}">${card.name}</option>
            `).join('')}
          </select>
        </label>
        
        <label class="field">
          <span>Monto *</span>
          <input type="text" id="payment-amount" inputmode="decimal" placeholder="0" required>
        </label>
        
        <label class="field">
          <span>Fecha *</span>
          <input type="date" id="payment-date" required value="${new Date().toISOString().split('T')[0]}">
        </label>
        
        <label class="field">
          <span>Cuenta de origen *</span>
          <select id="payment-source" required>
            <option value="">Selecciona una cuenta</option>
            ${accounts.map(acc => `
              <option value="${acc.id}">${acc.name}</option>
            `).join('')}
          </select>
        </label>
        
        <label class="field">
          <span>Notas (opcional)</span>
          <input type="text" id="payment-notes" placeholder="Ej: Pago mensual">
        </label>
        
        <div class="form-actions" style="display: flex; gap: 12px; margin-top: 8px;">
          <button type="button" class="btn-secondary" id="cancel-payment" style="flex: 1;">Cancelar</button>
          <button type="submit" class="btn-primary" style="flex: 1;">Registrar abono</button>
        </div>
      </form>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Setup amount formatting
  const amountInput = document.getElementById('payment-amount');
  amountInput.addEventListener('blur', (e) => {
    const rawValue = parseNumber(e.target.value);
    if (rawValue > 0) {
      e.target.value = formatNumber(rawValue);
    }
  });
  amountInput.addEventListener('focus', (e) => {
    const rawValue = parseNumber(e.target.value);
    e.target.value = rawValue > 0 ? String(rawValue) : '';
  });
  
  // Setup form handlers
  document.getElementById('cancel-payment').addEventListener('click', () => modal.remove());
  
  document.getElementById('card-payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const cardId = document.getElementById('payment-card').value;
    const amount = parseNumber(document.getElementById('payment-amount').value);
    const date = document.getElementById('payment-date').value;
    const sourceId = document.getElementById('payment-source').value;
    const notes = document.getElementById('payment-notes').value.trim();
    
    if (!cardId || !amount || !date || !sourceId) {
      showError('Campos requeridos', 'Por favor completa todos los campos obligatorios');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/credit-card-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          credit_card_id: cardId,
          amount: amount,
          payment_date: date,
          source_account_id: sourceId,
          notes: notes || null
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al registrar el abono');
      }
      
      modal.remove();
      showSuccess('Abono registrado', 'El abono se ha registrado correctamente');
      
      // Reload data
      await loadCreditCardsData();
      refreshDisplay();
      
    } catch (error) {
      console.error('Error creating payment:', error);
      showError('Error', error.message || 'Error al registrar el abono');
    }
  });
}

/**
 * Parse number from Colombian formatted string
 */
function parseNumber(str) {
  if (!str) return 0;
  // Remove thousand separators (.) and replace decimal comma with dot
  const cleaned = String(str).replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Format number with Colombian separators
 */
function formatNumber(num) {
  if (!num && num !== 0) return '';
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
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
          const allGroupChecked = showAllCategories || (selectedCategories && group.categories.every(c => selectedCategories.includes(c.id)));
          
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
                  const isChecked = showAllCategories || (selectedCategories && selectedCategories.includes(category.id));
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
            const isChecked = showAllPaymentMethods || (selectedPaymentMethods && selectedPaymentMethods.includes(pm.id));
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
                    ${!hasCategoryBudget ? `<span class="expense-category-amount">${formatCurrency(categoryData.total)}</span>` : ''}
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
          ${movement.generated_from_template_id 
            ? `<span class="entry-autogenerated-badge" title="Generado automáticamente">🔁</span>` 
            : ''
          }
          ${movement.is_split 
            ? `<span class="entry-split-badge">Compartido</span>` 
            : movement.payment_method_name 
              ? `<span class="entry-payment-badge">${movement.payment_method_name}</span>` 
              : ''
          }
          <button class="three-dots-btn" data-movement-id="${movement.id}">⋮</button>
          <div class="three-dots-menu" id="movement-menu-${movement.id}">
            <button class="menu-item" data-action="edit" data-id="${movement.id}" data-has-template="${movement.generated_from_template_id ? 'true' : 'false'}">Editar</button>
            <button class="menu-item" data-action="delete" data-id="${movement.id}" data-has-template="${movement.generated_from_template_id ? 'true' : 'false'}">Eliminar</button>
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
  
  // Handle tarjetas tab
  const tarjetasContainer = document.getElementById('cards-container');
  if (tarjetasContainer && activeTab === 'tarjetas') {
    tarjetasContainer.innerHTML = renderCreditCards();
    setupCardsListeners();
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
async function handleDeleteMovement(movementId, scope = null) {
  const confirmed = await showConfirmation(
    '¿Eliminar gasto?',
    '¿Estás seguro de que quieres eliminar este gasto? Esta acción no se puede deshacer.'
  );

  if (!confirmed) return;

  try {
    const url = scope 
      ? `${API_URL}/movements/${movementId}?scope=${scope}`
      : `${API_URL}/movements/${movementId}`;
      
    const response = await fetch(url, {
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
 * Show scope modal for auto-generated movements
 */
function showScopeModal(action, movementId) {
  const actionText = action === 'edit' ? 'editar' : 'eliminar';
  const actionTextCap = action === 'edit' ? 'Editar' : 'Eliminar';
  
  const modalHtml = `
    <div class="modal-overlay" id="scope-modal-overlay">
      <div class="modal-content scope-modal">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
          ${actionTextCap} Movimiento Auto-generado
        </h3>
        <p style="margin: 0 0 20px 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
          Este movimiento fue generado automáticamente desde un template. ¿Qué movimientos quieres ${actionText}?
        </p>
        
        <div class="scope-options">
          <label class="scope-option">
            <input type="radio" name="scope" value="THIS" checked />
            <div class="scope-option-content">
              <strong>Solo este movimiento</strong>
              <span>No afecta el template ni otros movimientos</span>
            </div>
          </label>
          
          <label class="scope-option">
            <input type="radio" name="scope" value="FUTURE" />
            <div class="scope-option-content">
              <strong>Este y futuros movimientos</strong>
              <span>Actualiza el template y todos los movimientos futuros</span>
            </div>
          </label>
          
          <label class="scope-option ${action === 'delete' ? 'scope-option-danger' : ''}">
            <input type="radio" name="scope" value="ALL" />
            <div class="scope-option-content">
              <strong>Todos los movimientos</strong>
              <span>${action === 'delete' ? 'Desactiva el template y elimina TODOS los movimientos' : 'Actualiza el template y TODOS los movimientos (pasados y futuros)'}</span>
            </div>
          </label>
        </div>
        
        <div class="modal-actions" style="display: flex; gap: 12px; margin-top: 24px;">
          <button id="scope-cancel-btn" class="btn-secondary" style="flex: 1;">
            Cancelar
          </button>
          <button id="scope-confirm-btn" class="btn-primary" style="flex: 1;">
            Continuar
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Insert modal into DOM
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Setup event listeners
  const overlay = document.getElementById('scope-modal-overlay');
  const cancelBtn = document.getElementById('scope-cancel-btn');
  const confirmBtn = document.getElementById('scope-confirm-btn');
  
  const closeModal = () => {
    overlay.remove();
  };
  
  cancelBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  
  confirmBtn.addEventListener('click', async () => {
    const selectedScope = document.querySelector('input[name="scope"]:checked').value;
    
    // Extra confirmation for scope=ALL delete
    if (action === 'delete' && selectedScope === 'ALL') {
      const confirmed = confirm(
        '⚠️ ADVERTENCIA: Estás a punto de eliminar TODAS las instancias de este gasto recurrente.\n\n' +
        'Esto incluirá:\n' +
        '• El template original\n' +
        '• Todos los movimientos pasados generados automáticamente\n' +
        '• Todos los movimientos futuros (no se crearán más)\n\n' +
        '¿Estás completamente seguro de que deseas continuar?'
      );
      
      if (!confirmed) {
        return; // Don't close modal, user can choose different scope
      }
    }
    
    closeModal();
    
    if (action === 'edit') {
      // For edit, navigate to edit page with scope parameter
      router.navigate(`/registrar-movimiento?tipo=GASTO&edit=${movementId}&scope=${selectedScope}`);
    } else {
      // For delete, call delete with scope
      await handleDeleteMovement(movementId, selectedScope);
    }
  });
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
      const hasTemplate = e.currentTarget.dataset.hasTemplate === 'true';

      // Close menu
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');

      if (hasTemplate) {
        // Show scope modal for auto-generated movements
        if (action === 'edit') {
          showScopeModal('edit', id);
        } else if (action === 'delete') {
          showScopeModal('delete', id);
        }
      } else {
        // No template - proceed directly
        if (action === 'edit') {
          await handleEditMovement(id);
        } else if (action === 'delete') {
          await handleDeleteMovement(id);
        }
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
  // Three-dots menu toggles for budget items
  document.querySelectorAll('.three-dots-btn[data-category-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const categoryId = e.currentTarget.dataset.categoryId;
      const menu = document.getElementById(`budget-menu-${categoryId}`);
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
  
  // Three-dots menu toggles for templates
  document.querySelectorAll('.three-dots-btn[data-template-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const templateId = e.currentTarget.dataset.templateId;
      const menu = document.getElementById(`template-menu-${templateId}`);
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
  
  // Budget action buttons (new Proposal 1 buttons in expanded area)
  document.querySelectorAll('.budget-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.action;
      
      if (action === 'add-budget') {
        await handleAddBudget(btn.dataset.categoryId, btn.dataset.categoryName);
      } else if (action === 'edit-budget') {
        await handleEditBudget(
          btn.dataset.categoryId,
          btn.dataset.budgetId,
          btn.dataset.amount,
          btn.dataset.categoryName
        );
      } else if (action === 'add-template') {
        await handleAddTemplate(btn.dataset.categoryId, btn.dataset.categoryName);
      }
    });
  });
  
  // Menu action buttons for budgets (legacy - keeping for template three-dots menus)
  document.querySelectorAll('.three-dots-menu .menu-item[data-action^="add-budget"], .three-dots-menu .menu-item[data-action^="edit-budget"], .three-dots-menu .menu-item[data-action^="delete-budget"]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = item.dataset.action;
      
      // Close menu
      item.closest('.three-dots-menu').style.display = 'none';
      
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
  
  // Menu action buttons for templates
  document.querySelectorAll('.three-dots-menu .menu-item[data-action^="edit-template"], .three-dots-menu .menu-item[data-action^="delete-template"]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = item.dataset.action;
      const templateId = item.dataset.templateId;
      
      // Close menu
      item.closest('.three-dots-menu').style.display = 'none';
      
      if (action === 'edit-template') {
        // TODO: Implement edit template functionality
        // - Load template data via GET /api/recurring-movements/:id
        // - Populate showTemplateModal with existing template data
        // - Use PUT /api/recurring-movements/:id for updates
        // - Handle participants loading for SPLIT templates
        // - Reload templates after successful update
        // - Update budget total if template amount changed
        alert('Editar template: ' + templateId + ' (por implementar)');
        
      } else if (action === 'delete-template') {
        // TODO: Implement delete with scope modal (like movements)
        // - Show scope modal with options: THIS (delete template only), FUTURE (deactivate), ALL (delete all)
        // - Use DELETE /api/recurring-movements/:id?scope={scope}
        // - Visual warning for scope=ALL (red background)
        // - Update budget total after deletion
        const confirmed = confirm('¿Estás seguro de eliminar este gasto?');
        if (confirmed) {
          try {
            const response = await fetch(`${API_URL}/api/recurring-movements/${templateId}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (!response.ok) {
              throw new Error('Error al eliminar el gasto');
            }
            
            showSuccess('Gasto Eliminado', 'El gasto ha sido eliminado exitosamente');
            await loadBudgetsData();
            refreshDisplay();
          } catch (error) {
            console.error('Error deleting template:', error);
            showError('Error', error.message || 'No se pudo eliminar el gasto');
          }
        }
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
  
  // Floating add button
  const addTemplateBtn = document.getElementById('add-template-btn');
  if (addTemplateBtn) {
    addTemplateBtn.addEventListener('click', () => {
      handleAddTemplate(); // No category pre-selected
    });
  }
}

/**
 * Setup credit cards listeners
 */
function setupCardsListeners() {
  // Card expand/collapse
  document.querySelectorAll('.credit-card-card').forEach(card => {
    const header = card.querySelector('.expense-group-header');
    if (header) {
      header.addEventListener('click', async () => {
        const cardId = card.dataset.cardId;
        const details = document.getElementById(`card-details-${cardId}`);
        const chevron = card.querySelector('.expense-group-chevron');
        
        if (details) {
          const wasHidden = details.classList.contains('hidden');
          details.classList.toggle('hidden');
          chevron?.classList.toggle('rotated');
          
          // Load movements when first expanded
          if (wasHidden && details.innerHTML.includes('card-loading')) {
            await loadAndRenderCardMovements(cardId);
          }
        }
      });
    }
  });
  
  // Filter button
  const filterBtn = document.getElementById('filter-cards-btn');
  if (filterBtn) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isCardsFilterOpen = !isCardsFilterOpen;
      const dropdown = document.getElementById('cards-filter-dropdown');
      if (dropdown) {
        dropdown.classList.toggle('show', isCardsFilterOpen);
      }
    });
  }
  
  // Filter select all/none buttons
  document.getElementById('cards-select-all')?.addEventListener('click', () => {
    document.querySelectorAll('.card-filter-checkbox').forEach(cb => cb.checked = true);
  });
  document.getElementById('cards-select-none')?.addEventListener('click', () => {
    document.querySelectorAll('.card-filter-checkbox').forEach(cb => cb.checked = false);
  });
  document.getElementById('owners-select-all')?.addEventListener('click', () => {
    document.querySelectorAll('.owner-filter-checkbox').forEach(cb => cb.checked = true);
  });
  document.getElementById('owners-select-none')?.addEventListener('click', () => {
    document.querySelectorAll('.owner-filter-checkbox').forEach(cb => cb.checked = false);
  });
  
  // Clear all filters
  const clearFiltersBtn = document.getElementById('clear-cards-filters');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', async () => {
      selectedCardIds = [];
      selectedCardOwnerIds = [];
      
      // Close dropdown
      isCardsFilterOpen = false;
      const dropdown = document.getElementById('cards-filter-dropdown');
      if (dropdown) {
        dropdown.classList.remove('show');
      }
      
      // Show loading
      showCreditCardsLoadingState();
      
      // Reload data
      await loadCreditCardsData();
      refreshDisplay();
    });
  }
  
  // Clear filters from empty state
  const clearFiltersEmptyBtn = document.getElementById('clear-filters-empty');
  if (clearFiltersEmptyBtn) {
    clearFiltersEmptyBtn.addEventListener('click', async () => {
      selectedCardIds = [];
      selectedCardOwnerIds = [];
      
      // Show loading
      showCreditCardsLoadingState();
      
      // Reload data
      await loadCreditCardsData();
      refreshDisplay();
    });
  }
  
  // Apply filters button
  const applyFiltersBtn = document.getElementById('apply-cards-filters');
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', async () => {
      // Collect selected card IDs
      selectedCardIds = [];
      document.querySelectorAll('.card-filter-checkbox:checked').forEach(cb => {
        selectedCardIds.push(cb.value);
      });
      
      // Collect selected owner IDs
      selectedCardOwnerIds = [];
      document.querySelectorAll('.owner-filter-checkbox:checked').forEach(cb => {
        selectedCardOwnerIds.push(cb.value);
      });
      
      // Close dropdown
      isCardsFilterOpen = false;
      const dropdown = document.getElementById('cards-filter-dropdown');
      if (dropdown) {
        dropdown.classList.remove('show');
      }
      
      // Show loading
      showCreditCardsLoadingState();
      
      // Reload data with filters
      await loadCreditCardsData();
      refreshDisplay();
    });
  }
  
  // Add card payment button
  const addPaymentBtn = document.getElementById('add-card-payment-btn');
  if (addPaymentBtn) {
    addPaymentBtn.addEventListener('click', () => {
      showCardPaymentModal();
    });
  }
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (isCardsFilterOpen && !e.target.closest('#cards-filter-dropdown') && !e.target.closest('#filter-cards-btn')) {
      isCardsFilterOpen = false;
      const dropdown = document.getElementById('cards-filter-dropdown');
      if (dropdown) {
        dropdown.classList.remove('show');
      }
    }
  });
}

/**
 * Show loading state for credit cards
 */
function showCreditCardsLoadingState() {
  const container = document.getElementById('cards-container');
  if (container) {
    container.innerHTML = `
      <div class="loading-state" style="padding: 40px; text-align: center;">
        <div class="loading-spinner"></div>
        <p>Cargando tarjetas...</p>
      </div>
    `;
  }
}

/**
 * Handle adding a budget
 */
async function handleAddBudget(categoryId, categoryName) {
  // Calculate templates sum for validation
  const templates = templatesData[categoryId] || [];
  const templatesSum = templates.reduce((sum, t) => sum + (t.amount || 0), 0);
  
  // Build modal message with hint if templates exist
  let message = `Ingrese el presupuesto para <strong>${categoryName}</strong>:`;
  if (templatesSum > 0) {
    message += `<br><br><small style="color: #666;">💡 Gastos predefinidos: ${formatCurrency(templatesSum)}<br>El presupuesto debe ser al menos este monto.</small>`;
  }
  
  const amount = await showInputModal(
    'Agregar presupuesto',
    message,
    templatesSum > 0 ? templatesSum : '', // Pre-fill with templates sum if exists
    'number'
  );
  
  if (!amount) return;
  
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    showError('Monto inválido', 'Por favor ingresa un número válido mayor o igual a 0');
    return;
  }
  
  if (parsedAmount === 0) {
    return; // Don't create budget with 0
  }
  
  // Validate against templates sum
  if (parsedAmount < templatesSum) {
    showError(
      'Presupuesto insuficiente', 
      `El presupuesto no puede ser menor que la suma de gastos predefinidos (${formatCurrency(templatesSum)})`
    );
    return;
  }
  
  const result = await setBudget(categoryId, currentMonth, parsedAmount);
  if (result) {
    showSuccess('Presupuesto creado', `El presupuesto para <strong>${categoryName}</strong> ha sido creado con ${formatCurrency(parsedAmount)}`);
    await loadBudgetsData();
    refreshDisplay();
  }
}

/**
 * Handle editing a budget
 */
async function handleEditBudget(categoryId, budgetId, currentAmount, categoryName) {
  // Calculate templates sum for validation
  const templates = templatesData[categoryId] || [];
  const templatesSum = templates.reduce((sum, t) => sum + (t.amount || 0), 0);
  
  // Build modal message with hint if templates exist
  let message = `Editar presupuesto para <strong>${categoryName}</strong>:`;
  if (templatesSum > 0) {
    message += `<br><br><small style="color: #666;">💡 Gastos predefinidos: ${formatCurrency(templatesSum)}<br>El presupuesto debe ser al menos este monto.</small>`;
  }
  
  const amount = await showInputModal(
    'Editar presupuesto',
    message,
    currentAmount,
    'number'
  );
  
  if (amount === null || amount === currentAmount) return;
  
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    showError('Monto inválido', 'Por favor ingresa un número válido mayor o igual a 0');
    return;
  }
  
  // Validate against templates sum (only if not deleting)
  if (parsedAmount > 0 && parsedAmount < templatesSum) {
    showError(
      'Presupuesto insuficiente', 
      `El presupuesto no puede ser menor que la suma de gastos predefinidos (${formatCurrency(templatesSum)})`
    );
    return;
  }
  
  // If amount is 0, delete the budget
  if (parsedAmount === 0) {
    const deleted = await deleteBudget(budgetId);
    if (deleted) {
      showSuccess('Presupuesto eliminado', `El presupuesto para <strong>${categoryName}</strong> ha sido eliminado`);
      await loadBudgetsData();
      refreshDisplay();
    }
    return;
  }
  
  const result = await setBudget(categoryId, currentMonth, parsedAmount);
  if (result) {
    showSuccess('Presupuesto actualizado', `El presupuesto para <strong>${categoryName}</strong> ha sido actualizado de ${formatCurrency(currentAmount)} a ${formatCurrency(parsedAmount)}`);
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
    `¿Estás seguro de que deseas eliminar el presupuesto para <strong>${categoryName}</strong>?`,
    'Eliminar'
  );
  
  if (!confirmed) return;
  
  const deleted = await deleteBudget(budgetId);
  if (deleted) {
    showSuccess('Presupuesto eliminado', `El presupuesto para <strong>${categoryName}</strong> ha sido eliminado`);
    await loadBudgetsData();
    refreshDisplay();
  }
}

/**
 * Handle adding a template
 */
async function handleAddTemplate(categoryId = null, categoryName = null) {
  showTemplateModal(categoryId, categoryName, null);
}

/**
 * Show template creation/edit modal
 * Uses MovementFormState from movement-form.js
 */
async function showTemplateModal(categoryId, categoryName, existingTemplate = null) {
  const isEdit = !!existingTemplate;
  const title = isEdit ? 'Editar gasto' : 'Presupuestar nuevo gasto';
  
  // Get form config data from global state
  const users = window.formConfigCache?.users || [];
  const paymentMethods = window.formConfigCache?.payment_methods || [];
  const categoryGroups = window.formConfigCache?.category_groups || [];
  
  // Fetch accounts for receiver account selection
  let accounts = [];
  try {
    const response = await fetch(`${API_URL}/accounts`, { credentials: 'include' });
    if (response.ok) {
      const accountsData = await response.json();
      accounts = (accountsData || []).filter(a => a.type === 'savings' || a.type === 'cash');
    }
  } catch (error) {
    console.error('Error loading accounts:', error);
  }
  
  // Initialize form state
  const formState = new MovementFormState({
    users,
    paymentMethods,
    categoryGroups,
    currentUser: currentUser
  });
  
  // Helper functions (copied from registrar-movimiento.js)
  function formatNumber(num) {
    const value = Number(num);
    if (!Number.isFinite(value)) return '0';
    return value.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  
  function parseNumber(str) {
    const cleaned = String(str).replace(/\./g, '').replace(/,/g, '.');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  
  function toEditableNumber(num) {
    const value = Number(num);
    if (!Number.isFinite(value)) return '';
    return String(value).replace('.', ',');
  }
  
  function setStatus(msg, kind) {
    const statusEl = document.getElementById('template-status');
    if (!statusEl) return;
    statusEl.className = `status ${kind || ''}`.trim();
    statusEl.textContent = msg || '';
  }
  
  const modalHtml = `
    <div class="modal-overlay" id="template-modal-overlay">
      <div class="modal-content" style="max-width: 600px; max-height: 90vh; overflow-y: auto;">
        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">
          ${title}
        </h3>
        
        <form id="template-form" style="display: flex; flex-direction: column; gap: 16px;">
          <!-- Categoría -->
          <label class="field">
            <span>Categoría *</span>
            <select id="template-category" required>
              <option value="" selected disabled>Seleccionar categoría</option>
            </select>
          </label>
          
          <!-- Nombre -->
          <label class="field">
            <span>Nombre *</span>
            <input type="text" id="template-name" placeholder="ej. Arriendo, Internet, Netflix" required />
            <small style="color: #6b7280; font-size: 12px; margin-top: 4px; display: block;">
              Este nombre aparecerá en el dropdown cuando registres movimientos
            </small>
          </label>
          
          <!-- Descripción (opcional) -->
          <label class="field">
            <span>Descripción (opcional)</span>
            <input type="text" id="template-description" placeholder="ej. Apartamento en Aviva" />
          </label>
          
          <!-- Monto total (always required) -->
          <label class="field">
            <span>Monto total *</span>
            <input type="text" id="template-amount" inputmode="decimal" placeholder="0" required />
          </label>
          
          <!-- Auto-generar -->
          <label class="field" style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
            <input type="checkbox" id="template-auto-generate" style="width: auto; cursor: pointer;" />
            <div style="flex: 1;">
              <strong style="display: block; font-size: 14px;">Generar automáticamente cada mes</strong>
              <small style="color: #6b7280; font-size: 12px; display: block;">
                El sistema creará el movimiento automáticamente en la fecha configurada
              </small>
            </div>
          </label>
          
          <!-- Día del mes (solo si auto-generate) -->
          <label class="field hidden" id="template-day-field">
            <span>Día del mes *</span>
            <input type="number" id="template-day" placeholder="Ej: 15" min="1" max="31" />
            <small style="color: #6b7280; font-size: 12px; margin-top: 4px; display: block;">
              Si el día no existe en el mes (ej: 31 en febrero), se usará el último día disponible
            </small>
          </label>
          
          <!-- Tipo de movimiento -->
          <label class="field">
            <span>Tipo de movimiento *</span>
            <select id="template-movement-type" required>
              <option value="">Selecciona...</option>
              <option value="HOUSEHOLD">Gasto del hogar</option>
              <option value="SPLIT">Gasto compartido</option>
              <option value="DEBT_PAYMENT">Préstamo</option>
            </select>
          </label>
          
          <!-- Loan direction selector (Hacer/Pagar préstamo) -->
          <div class="field hidden" id="template-loan-direction-wrap">
            <div class="loan-direction-selector">
              <button type="button" class="loan-direction-btn active" data-direction="LEND">
                Hacer un préstamo
              </button>
              <button type="button" class="loan-direction-btn" data-direction="REPAY">
                Pagar un préstamo
              </button>
            </div>
            <input type="hidden" id="template-loan-direction" value="LEND" />
          </div>
          
          <!-- Pagador (solo para SPLIT) -->
          <label class="field hidden" id="template-payer-wrap">
            <span>¿Quién paga? *</span>
            <select id="template-payer">
              <option value="">Selecciona...</option>
              ${users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
            </select>
          </label>
          
          <!-- Método de pago (para SPLIT, justo después del pagador) -->
          <label class="field hidden" id="template-payment-method-wrap-split">
            <span>Método de pago *</span>
            <select id="template-payment-method">
              <option value="">Selecciona...</option>
              ${paymentMethods.map(pm => `<option value="${pm.id}">${pm.name}</option>`).join('')}
            </select>
          </label>
          
          <!-- Participantes (solo SPLIT) -->
          <div id="template-participants-wrap" class="hidden" style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; background: #f9fafb;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Participantes</h3>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; white-space: nowrap;">
                  <input type="checkbox" id="template-equitable" checked style="cursor: pointer; width: auto;" />
                  <span>Dividir equitativamente</span>
                </label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 14px; white-space: nowrap;">
                  <input type="checkbox" id="template-show-as-value" style="cursor: pointer; width: auto;" />
                  <span>Mostrar como valor</span>
                </label>
              </div>
            </div>
            <div id="template-participants-list" style="margin-bottom: 12px;"></div>
            <button type="button" id="template-add-participant-btn" class="secondary" style="width: 100%; padding: 10px; font-size: 14px;">
              Agregar participante
            </button>
            <p id="template-participants-hint" style="margin: 12px 0 0 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
              Si no es equitativo, puedes editar los porcentajes. La suma debe ser 100%.
            </p>
          </div>
          
          <!-- Payer/Receiver row (para DEBT_PAYMENT) -->
          <div class="hidden" id="template-debt-payment-wrap" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <label class="field">
              <span id="template-payer-label">¿Quién pagó?</span>
              <select id="template-debt-payer">
                <option value="">Selecciona...</option>
                ${users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span id="template-receiver-label">¿Quién recibió?</span>
              <select id="template-debt-receiver">
                <option value="">Selecciona...</option>
                ${users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
              </select>
            </label>
          </div>
          
          <!-- Cuenta donde recibe (para DEBT_PAYMENT cuando el receptor es miembro) -->
          <label class="field hidden" id="template-receiver-account-wrap">
            <span>Cuenta donde recibe *</span>
            <select id="template-receiver-account">
              <option value="">Selecciona cuenta</option>
            </select>
          </label>
          
          <!-- Método de pago (para DEBT_PAYMENT/HOUSEHOLD) -->
          <label class="field hidden" id="template-payment-method-wrap-other">
            <span>Método de pago *</span>
            <select id="template-payment-method-other">
              <option value="">Selecciona...</option>
              ${paymentMethods.map(pm => `<option value="${pm.id}">${pm.name}</option>`).join('')}
            </select>
          </label>
          
          <div class="modal-actions" style="display: flex; gap: 12px; margin-top: 8px;">
            <button type="button" id="template-cancel-btn" class="btn-secondary" style="flex: 1;">
              Cancelar
            </button>
            <button type="submit" class="btn-primary" style="flex: 1;">
              ${isEdit ? 'Guardar' : 'Crear'}
            </button>
          </div>
          <p id="template-status" class="status" role="status" aria-live="polite" style="margin-top: 12px;"></p>
        </form>
      </div>
    </div>
  `;
  
  // Insert modal into DOM
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Get elements
  const overlay = document.getElementById('template-modal-overlay');
  const form = document.getElementById('template-form');
  const cancelBtn = document.getElementById('template-cancel-btn');
  const categorySelect = document.getElementById('template-category');
  const autoGenerateCheckbox = document.getElementById('template-auto-generate');
  const dayField = document.getElementById('template-day-field');
  const movementTypeSelect = document.getElementById('template-movement-type');
  const loanDirectionWrap = document.getElementById('template-loan-direction-wrap');
  const loanDirectionBtns = document.querySelectorAll('.loan-direction-btn');
  const loanDirectionInput = document.getElementById('template-loan-direction');
  const payerWrap = document.getElementById('template-payer-wrap');
  const payerSelect = document.getElementById('template-payer');
  const participantsWrap = document.getElementById('template-participants-wrap');
  const equitableCheckbox = document.getElementById('template-equitable');
  const addParticipantBtn = document.getElementById('template-add-participant-btn');
  const debtPaymentWrap = document.getElementById('template-debt-payment-wrap');
  const debtPayerSelect = document.getElementById('template-debt-payer');
  const debtReceiverSelect = document.getElementById('template-debt-receiver');
  const receiverAccountWrap = document.getElementById('template-receiver-account-wrap');
  const receiverAccountSelect = document.getElementById('template-receiver-account');
  const paymentMethodWrapSplit = document.getElementById('template-payment-method-wrap-split');
  const paymentMethodWrapOther = document.getElementById('template-payment-method-wrap-other');
  const paymentMethodSelect = document.getElementById('template-payment-method');
  const paymentMethodSelectOther = document.getElementById('template-payment-method-other');
  const payerLabel = document.getElementById('template-payer-label');
  const receiverLabel = document.getElementById('template-receiver-label');
  const showAsValueCheckbox = document.getElementById('template-show-as-value');
  const amountInput = document.getElementById('template-amount');
  
  // Populate category dropdown with optgroups
  if (categoryGroups && categoryGroups.length > 0) {
    categoryGroups.forEach(group => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.name.toUpperCase();
      
      group.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = getSimplifiedCategoryName(cat.name, group.name);
        if (categoryId && cat.id === categoryId) {
          opt.selected = true;
        }
        optgroup.appendChild(opt);
      });
      
      categorySelect.appendChild(optgroup);
    });
  }
  
  // Participant rendering functions (integrated UI like registrar-movimiento)
  function renderTemplateParticipants() {
    const container = document.getElementById('template-participants-list');
    if (!container) return;
    
    const isEquitable = equitableCheckbox && equitableCheckbox.checked;
    const showAsValue = showAsValueCheckbox && showAsValueCheckbox.checked;
    const totalValue = amountInput 
      ? parseNumber(amountInput.value) || 0
      : 0;
    
    // Update hint text dynamically
    const hintEl = document.getElementById('template-participants-hint');
    if (hintEl) {
      if (showAsValue) {
        hintEl.textContent = `Si no es equitativo, puedes editar los valores. La suma debe ser ${formatNumber(totalValue)}.`;
      } else {
        hintEl.textContent = 'Si no es equitativo, puedes editar los porcentajes. La suma debe ser 100%.';
      }
    }
    
    if (formState.participants.length === 0) {
      container.innerHTML = '<p style="color: #6b7280; font-size: 14px; text-align: center; padding: 16px;">No hay participantes agregados</p>';
      return;
    }
    
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.innerHTML = '';
    
    // Adjust grid columns based on view mode (responsive)
    const gridColumns = showAsValue ? 'minmax(80px, 1fr) minmax(100px, 140px) 40px' : '1fr 120px 40px';
    
    formState.participants.forEach((p, idx) => {
      const row = document.createElement('div');
      row.style.cssText = `display: grid; grid-template-columns: ${gridColumns}; gap: 10px; align-items: center;`;
      
      // Name dropdown
      const nameSelect = document.createElement('select');
      nameSelect.style.cssText = 'padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 14px; background: white;';
      
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        if (u.id === p.user_id) opt.selected = true;
        nameSelect.appendChild(opt);
      });
      
      nameSelect.addEventListener('change', (e) => {
        const oldPercentage = formState.participants[idx].percentage;
        formState.participants[idx].user_id = e.target.value;
        formState.participants[idx].name = formState.usersMap[e.target.value].name;
        formState.participants[idx].percentage = oldPercentage;
        
        // Remove duplicates
        const seen = new Set();
        formState.participants = formState.participants.filter(p => {
          if (seen.has(p.user_id)) return false;
          seen.add(p.user_id);
          return true;
        });
        
        renderTemplateParticipants();
      });
      
      // Value/Percentage input wrapper
      const pctWrapper = document.createElement('div');
      pctWrapper.style.display = 'flex';
      pctWrapper.style.alignItems = 'center';
      pctWrapper.style.border = '1px solid #e5e7eb';
      pctWrapper.style.borderRadius = '12px';
      pctWrapper.style.padding = '0';
      pctWrapper.style.backgroundColor = 'white';
      pctWrapper.style.maxWidth = '100%';
      pctWrapper.style.boxSizing = 'border-box';
      
      const pctInput = document.createElement('input');
      pctInput.disabled = isEquitable;
      pctInput.style.border = 'none';
      pctInput.style.outline = 'none';
      pctInput.style.flex = '1';
      pctInput.style.backgroundColor = 'transparent';
      pctInput.style.textAlign = 'right';
      pctInput.style.minWidth = '0';
      
      const label = document.createElement('span');
      label.style.color = '#9ca3af';
      label.style.userSelect = 'none';
      label.style.fontSize = '14px';
      label.style.flexShrink = '0';
      label.style.fontWeight = '500';
      
      if (showAsValue) {
        // Show as COP value (even if totalValue is 0)
        pctInput.type = 'text';
        pctInput.inputMode = 'decimal';
        const value = totalValue > 0 ? ((p.percentage / 100) * totalValue) : 0;
        pctInput.value = formatNumber(value);
        pctInput.style.fontSize = '13px';
        pctInput.style.padding = '12px 14px 12px 2px';
        
        // Add COP prefix (left side)
        label.textContent = 'COP';
        label.style.paddingLeft = '14px';
        label.style.paddingRight = '4px';
        pctWrapper.appendChild(label);
        pctWrapper.appendChild(pctInput);
        
        pctInput.addEventListener('input', (e) => {
          const v = parseNumber(e.target.value);
          if (Number.isFinite(v) && totalValue > 0) {
            formState.participants[idx].percentage = (v / totalValue) * 100;
          } else {
            formState.participants[idx].percentage = 0;
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
        // Show as percentage (rounded to 2 decimals)
        pctInput.type = 'text';
        pctInput.inputMode = 'decimal';
        pctInput.value = (p.percentage || 0).toFixed(2);
        pctInput.placeholder = '0.00';
        pctInput.style.fontSize = '14px';
        pctInput.style.padding = '12px 2px 12px 14px';
        
        pctInput.addEventListener('input', (e) => {
          const value = parseFloat(e.target.value) || 0;
          formState.participants[idx].percentage = value;
          validatePctSum();
        });
        
        pctInput.addEventListener('blur', () => {
          const value = parseFloat(pctInput.value) || 0;
          pctInput.value = value.toFixed(2);
        });
        
        // Add % suffix (right side)
        label.textContent = '%';
        label.style.paddingRight = '14px';
        label.style.paddingLeft = '4px';
        pctWrapper.appendChild(pctInput);
        pctWrapper.appendChild(label);
      }
      
      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.style.cssText = 'width: 36px; height: 36px; padding: 0; background: white; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer; font-size: 20px; font-weight: normal; line-height: 1; display: flex; align-items: center; justify-content: center;';
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.background = '#fee2e2';
        removeBtn.style.color = '#991b1b';
        removeBtn.style.borderColor = '#fecaca';
      });
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.background = 'white';
        removeBtn.style.color = '#6b7280';
        removeBtn.style.borderColor = '#e5e7eb';
      });
      
      removeBtn.addEventListener('click', () => {
        formState.participants.splice(idx, 1);
        if (isEquitable) computeEquitable();
        else renderTemplateParticipants();
        validatePctSum();
      });
      
      row.appendChild(nameSelect);
      row.appendChild(pctWrapper);
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
    
    validatePctSum();
  }
  function computeEquitable() {
    if (formState.participants.length === 0) return;
    formState.computeEquitable();
    renderTemplateParticipants();
  }
  
  // Validate percentage sum (copied from registrar-movimiento.js)
  function validatePctSum() {
    if (equitableCheckbox && equitableCheckbox.checked) {
      setStatus('', '');
      return true;
    }
    
    const sum = formState.getTotalPercentage();
    const ok = Math.abs(sum - 100) < 0.01;
    
    if (!ok) {
      const showAsValue = showAsValueCheckbox && showAsValueCheckbox.checked;
      const totalValue = amountInput 
        ? parseNumber(amountInput.value) || 0 
        : 0;
      
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
  
  // Equitable checkbox listener
  if (equitableCheckbox) {
    equitableCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        computeEquitable();
      } else {
        renderTemplateParticipants();
      }
      validatePctSum();
    });
  }
  
  // Show as value checkbox listener
  if (showAsValueCheckbox) {
    showAsValueCheckbox.addEventListener('change', () => {
      renderTemplateParticipants();
      validatePctSum();
    });
  }
  
  // Close modal function
  const closeModal = () => {
    overlay.remove();
  };
  
  // Amount input formatting (Colombian format with blur/focus)
  if (amountInput) {
    amountInput.addEventListener('blur', (e) => {
      const rawValue = parseNumber(e.target.value);
      e.target.value = formatNumber(rawValue);
    });
    
    amountInput.addEventListener('focus', (e) => {
      const rawValue = parseNumber(e.target.value);
      if (rawValue === 0) {
        e.target.value = '';
      } else {
        e.target.value = String(rawValue);
      }
    });
    
    // Amount input listener (for showAsValue mode)
    amountInput.addEventListener('input', () => {
      if (showAsValueCheckbox && showAsValueCheckbox.checked && formState.participants.length > 0) {
        renderTemplateParticipants();
      }
    });
  }
  
  // Toggle day field based on auto-generate
  autoGenerateCheckbox.addEventListener('change', (e) => {
    dayField.classList.toggle('hidden', !e.target.checked);
    document.getElementById('template-day').required = e.target.checked;
  });
  
  // Handle loan direction buttons
  loanDirectionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      loanDirectionBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const direction = btn.dataset.direction;
      loanDirectionInput.value = direction;
      updateLoanLabels(direction);
    });
  });
  
  // Update loan labels
  function updateLoanLabels(direction) {
    if (direction === 'LEND') {
      payerLabel.textContent = '¿Quién prestó?';
      receiverLabel.textContent = '¿Quién recibió?';
    } else {
      payerLabel.textContent = '¿Quién pagó?';
      receiverLabel.textContent = '¿Quién recibió?';
    }
  }
  
  // Handle movement type change
  movementTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    
    // Reset all conditional sections
    loanDirectionWrap.classList.add('hidden');
    payerWrap.classList.add('hidden');
    participantsWrap.classList.add('hidden');
    debtPaymentWrap.classList.add('hidden');
    paymentMethodWrapSplit.classList.add('hidden');
    paymentMethodWrapOther.classList.add('hidden');
    receiverAccountWrap.classList.add('hidden');
    paymentMethodSelect.required = false;
    paymentMethodSelectOther.required = false;
    receiverAccountSelect.required = false;
    receiverAccountSelect.value = '';
    
    if (!type) return;
    
    if (type === 'HOUSEHOLD') {
      // Gasto del hogar: solo método de pago
      paymentMethodWrapOther.classList.remove('hidden');
      paymentMethodSelectOther.required = true;
      // Update payment methods for current user
      if (currentUser) {
        updatePaymentMethods(currentUser.id, paymentMethodSelectOther);
      }
    } else if (type === 'SPLIT') {
      // Gasto compartido: pagador + participantes (payment method appears after payer selection)
      payerWrap.classList.remove('hidden');
      participantsWrap.classList.remove('hidden');
    } else if (type === 'DEBT_PAYMENT') {
      // Préstamo: dirección + pagador/receptor
      // Payment method hidden by default, shown only if payer is household member
      // Receiver account hidden by default, shown only if receiver is household member
      loanDirectionWrap.classList.remove('hidden');
      debtPaymentWrap.classList.remove('hidden');
      paymentMethodWrapOther.classList.add('hidden'); // Hidden by default
      paymentMethodSelectOther.required = false;
      updateLoanLabels(loanDirectionInput.value);
    }
  });
  
  // Handle payer change for SPLIT (update payment methods)
  payerSelect.addEventListener('change', (e) => {
    const payerId = e.target.value;
    if (!payerId) {
      paymentMethodWrapSplit.classList.add('hidden');
      paymentMethodSelect.required = false;
      return;
    }
    
    const user = formState.usersMap[payerId];
    if (user && user.type === 'member') {
      // Only show payment method for household members
      paymentMethodWrapSplit.classList.remove('hidden');
      paymentMethodSelect.required = true;
      updatePaymentMethods(payerId, paymentMethodSelect);
    } else {
      paymentMethodWrapSplit.classList.add('hidden');
      paymentMethodSelect.required = false;
    }
  });
  
  // Handle debt payer change (update payment methods)
  debtPayerSelect.addEventListener('change', (e) => {
    const payerId = e.target.value;
    if (payerId) {
      const user = formState.usersMap[payerId];
      const isMember = user && user.type === 'member';
      
      if (isMember) {
        updatePaymentMethods(payerId, paymentMethodSelectOther);
        paymentMethodWrapOther.classList.remove('hidden');
        paymentMethodSelectOther.required = true;
      } else {
        // Hide payment method for contacts
        paymentMethodWrapOther.classList.add('hidden');
        paymentMethodSelectOther.required = false;
        paymentMethodSelectOther.value = '';
      }
    }
  });
  
  // Handle debt receiver change (show/hide receiver account for members)
  debtReceiverSelect.addEventListener('change', (e) => {
    const receiverId = e.target.value;
    if (receiverId) {
      const user = formState.usersMap[receiverId];
      const isMember = user && user.type === 'member';
      
      if (isMember) {
        // Populate receiver account dropdown with accounts owned by this member
        const memberAccounts = accounts.filter(a => a.owner_id === receiverId);
        receiverAccountSelect.innerHTML = '<option value="">Selecciona cuenta</option>';
        memberAccounts.forEach(acc => {
          const option = document.createElement('option');
          option.value = acc.id;
          option.textContent = acc.name;
          receiverAccountSelect.appendChild(option);
        });
        
        if (memberAccounts.length > 0) {
          receiverAccountWrap.classList.remove('hidden');
          receiverAccountSelect.required = true;
        } else {
          receiverAccountWrap.classList.add('hidden');
          receiverAccountSelect.required = false;
        }
      } else {
        // Hide receiver account for contacts
        receiverAccountWrap.classList.add('hidden');
        receiverAccountSelect.required = false;
        receiverAccountSelect.value = '';
      }
    } else {
      receiverAccountWrap.classList.add('hidden');
      receiverAccountSelect.required = false;
      receiverAccountSelect.value = '';
    }
  });
  
  // Update payment methods for specific payer
  function updatePaymentMethods(payerId, selectElement) {
    const methods = formState.getPaymentMethodsForPayer(payerId);
    const currentValue = selectElement.value;
    
    selectElement.innerHTML = '<option value="">Selecciona...</option>';
    methods.forEach(pm => {
      const option = document.createElement('option');
      option.value = pm.id;
      option.textContent = pm.name;
      selectElement.appendChild(option);
    });
    
    // Restore if still valid
    if (currentValue && methods.find(pm => pm.id === currentValue)) {
      selectElement.value = currentValue;
    }
  }
  
  // Add participant button
  addParticipantBtn.addEventListener('click', () => {
    // Find first user not already in participants
    const usedIds = new Set(formState.participants.map(p => p.user_id));
    const availableUser = users.find(u => !usedIds.has(u.id));
    
    if (!availableUser) {
      showError('Error', 'Todos los usuarios ya están agregados como participantes');
      return;
    }
    
    formState.addParticipant(availableUser.id, 0);
    if (equitableCheckbox && equitableCheckbox.checked) {
      computeEquitable();
    }
    renderTemplateParticipants();
  });
  
  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const movementType = movementTypeSelect.value;
    
    // Validate participants for SPLIT
    if (movementType === 'SPLIT') {
      const validation = formState.validateParticipants();
      if (!validation.valid) {
        showError('Error', validation.error);
        return;
      }
    }
    
    // Gather form data
    const formData = {
      name: document.getElementById('template-name').value,
      description: document.getElementById('template-description').value || null,
      category_id: categorySelect.value,
      amount: parseNumber(document.getElementById('template-amount').value),
      auto_generate: autoGenerateCheckbox.checked,
      movement_type: movementType,
    };
        
    // Add recurrence fields if auto-generate is enabled
    if (autoGenerateCheckbox.checked) {
      formData.recurrence_pattern = 'MONTHLY';
      formData.day_of_month = parseInt(document.getElementById('template-day').value);
      formData.start_date = new Date().toISOString().split('T')[0]; // Today's date in YYYY-MM-DD format
    }
    
    // Add type-specific fields
    if (movementType === 'HOUSEHOLD') {
      formData.payer_user_id = currentUser.id;
      formData.payment_method_id = paymentMethodSelectOther.value || null;
    } else if (movementType === 'SPLIT') {
      // Handle payer (can be user or contact)
      const payerId = payerSelect.value;
      const payer = users.find(u => u.id === payerId);
      if (payer) {
        if (payer.type === 'member') {
          formData.payer_user_id = payer.id;
        } else if (payer.type === 'contact') {
          formData.payer_contact_id = payer.id;
        }
      }
      
      formData.payment_method_id = paymentMethodSelect.value || null;
      formData.participants = formState.participants.map(p => {
        // Find the user/contact info to determine type
        const user = users.find(u => u.id === p.user_id);
        const participant = {
          percentage: p.percentage / 100  // Convert from 0-100 to 0-1 scale
        };
        
        // Set either participant_user_id or participant_contact_id based on type
        if (user) {
          if (user.type === 'member') {
            participant.participant_user_id = user.id;
          } else if (user.type === 'contact') {
            participant.participant_contact_id = user.id;
          }
        }
        
        return participant;
      });
    } else if (movementType === 'DEBT_PAYMENT') {
      // Handle payer (can be user or contact)
      const payerId = debtPayerSelect.value;
      const payer = users.find(u => u.id === payerId);
      if (payer) {
        if (payer.type === 'member') {
          formData.payer_user_id = payer.id;
        } else if (payer.type === 'contact') {
          formData.payer_contact_id = payer.id;
        }
      }
      
      // Handle counterparty (can be user or contact)
      const counterpartyId = debtReceiverSelect.value;
      const counterparty = users.find(u => u.id === counterpartyId);
      if (counterparty) {
        if (counterparty.type === 'member') {
          formData.counterparty_user_id = counterparty.id;
          // Add receiver account if counterparty is a member
          if (receiverAccountSelect.value) {
            formData.receiver_account_id = receiverAccountSelect.value;
          }
        } else if (counterparty.type === 'contact') {
          formData.counterparty_contact_id = counterparty.id;
        }
      }
      
      formData.payment_method_id = paymentMethodSelectOther.value || null;
    }
    
    // Create template via API
    try {
      const response = await fetch(`${API_URL}/api/recurring-movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // Handle specific errors
        if (errorText.includes('duplicate key') || errorText.includes('already exists')) {
          throw new Error('Ya existe un gasto con ese nombre. Por favor usa un nombre diferente.');
        }
        
        throw new Error(errorText || 'Error al crear el gasto');
      }
      
      const template = await response.json();
      
      // Get old budget amount before reload
      const categoryId = categorySelect.value;
      const oldBudget = budgetsData?.budgets?.find(b => b.category_id === categoryId);
      const oldAmount = oldBudget?.amount || 0;
      
      closeModal();
      
      // Reload budgets data to refresh templates
      try {
        await loadBudgetsData();
        
        // Get new budget amount after reload
        const newBudget = budgetsData?.budgets?.find(b => b.category_id === categoryId);
        const newAmount = newBudget?.amount || 0;
        
        // Show success message with budget change info
        if (newAmount !== oldAmount) {
          const categoryName = newBudget?.category_name || 'esta categoría';
          showSuccess(
            'Gasto Creado', 
            `El gasto <strong>${template.name}</strong> ha sido creado.<br><br>` +
            `Nuevo presupuesto de <strong>${categoryName}</strong>: ${formatCurrency(oldAmount)} → ${formatCurrency(newAmount)}`
          );
        } else {
          showSuccess('Gasto Creado', `El gasto <strong>${template.name}</strong> ha sido creado exitosamente`);
        }
      } catch (err) {
        console.error('Error reloading budgets data:', err);
        showSuccess('Gasto Creado', `El gasto <strong>${template.name}</strong> ha sido creado exitosamente`);
      }
      refreshDisplay();
      
    } catch (error) {
      console.error('Error creating template:', error);
      showError('Error', error.message || 'No se pudo crear el gasto');
    }
  });
  
  // Cancel button
  cancelBtn.addEventListener('click', closeModal);
  
  // Initialize form state (no need to trigger anything now)
}
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
  // Get all unique categories from ORIGINAL (unfiltered) data
  const allCategories = originalMovementsData?.movements 
    ? [...new Set(originalMovementsData.movements.map(m => m.category_id).filter(Boolean))]
    : [];
  
  const allPaymentMethods = originalMovementsData?.movements
    ? [...new Set(originalMovementsData.movements
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
  if (tabsToReload.includes('tarjetas')) {
    creditCardsData = null;
  }
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
  
  // Load category groups (needed for filters)
  await loadCategoryGroups();

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
                        (activeTab === 'presupuesto' && (!budgetsData || Object.keys(templatesData).length === 0)) ||
                        (activeTab === 'tarjetas' && !creditCardsData);
      
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
        } else if (activeTab === 'tarjetas') {
          await loadCreditCardsData();
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
        } else if (activeTab === 'tarjetas') {
          contentContainer.innerHTML = `
            ${renderCreditCardsMonthSelector()}
            
            <div class="total-display" style="margin-bottom: 24px;">
              <div class="total-label">Deuda total</div>
              <div class="total-amount">${formatCurrency(creditCardsData?.totals?.total_debt || 0)}</div>
            </div>
            
            <div id="cards-container">
              ${renderCreditCards()}
            </div>
          `;
          setupMonthNavigation();
          setupCardsListeners();
        } else {
          contentContainer.innerHTML = `
            <div class="coming-soon">
              <div class="coming-soon-icon">❓</div>
              <p>Tab desconocido</p>
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
      } else if (activeTab === 'tarjetas') {
        await loadCreditCardsData();
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
      } else if (activeTab === 'tarjetas') {
        await loadCreditCardsData();
      }
      refreshDisplay();
    };
  }
}
