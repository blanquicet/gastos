/**
 * Home / Dashboard Page
 *
 * Modern dashboard showing income summary with:
 * - Tab navigation (Gastos | Ingresos | Tarjetas)
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
let activeTab = 'ingresos'; // 'gastos', 'ingresos', 'tarjetas'
let householdMembers = []; // List of household members for filtering
let selectedMemberIds = []; // Array of selected member IDs (empty = all)
let selectedIncomeTypes = []; // Array of selected income types (empty = all)
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
    <div class="dashboard-tabs">
      <button class="tab-btn ${activeTab === 'gastos' ? 'active' : ''}" data-tab="gastos">Gastos</button>
      <button class="tab-btn ${activeTab === 'ingresos' ? 'active' : ''}" data-tab="ingresos">Ingresos</button>
      <button class="tab-btn ${activeTab === 'tarjetas' ? 'active' : ''}" data-tab="tarjetas">Tarjetas de crédito</button>
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
          <label class="filter-checkbox-label filter-category-label">
            <input type="checkbox" class="filter-checkbox filter-category-checkbox" 
                   data-category="Ingresos"
                   ${allIngresosSelected ? 'checked' : ''}>
            <span><strong>Ingresos</strong></span>
          </label>
          <div class="filter-options filter-sub-options">
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
          <label class="filter-checkbox-label filter-category-label">
            <input type="checkbox" class="filter-checkbox filter-category-checkbox" 
                   data-category="Movimientos"
                   ${allMovimientosSelected ? 'checked' : ''}>
            <span><strong>Movimientos</strong></span>
          </label>
          <div class="filter-options filter-sub-options">
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
      
      <!-- Filter loading overlay -->
      <div class="filter-loading-overlay" id="filter-loading" style="display: none;">
        <div class="spinner"></div>
        <p>Filtrando...</p>
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
                  <div class="entry-date">${formatDateTime(entry.created_at)}</div>
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
 * Render home page
 */
export function render(user) {
  currentUser = user;
  if (!currentMonth) {
    currentMonth = getCurrentMonth();
  }

  const totalAmount = incomeData?.totals?.total_amount || 0;

  return `
    <main class="dashboard">
      <header class="dashboard-header">
        <h1 class="dashboard-title">Resumen mensual</h1>
        ${Navbar.render(user, '/')}
      </header>

      ${renderTabs()}
      
      <div class="dashboard-content">
        ${activeTab === 'ingresos' && incomeData ? `
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
        ` : `
          <div class="coming-soon">
            <div class="coming-soon-icon">${activeTab === 'gastos' ? '🛒' : '💳'}</div>
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
    console.log('Loaded household members:', householdMembers);
    if (householdMembers.length > 0) {
      console.log('First member structure:', householdMembers[0]);
      console.log('First member keys:', Object.keys(householdMembers[0]));
    }
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
    
    console.log('Filter state:', {
      selectedMemberIds,
      selectedIncomeTypes,
      householdMembers: householdMembers.length
    });
    
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
      
      console.log('Original entries:', filteredEntries.length);
      console.log('Sample entry:', filteredEntries[0]);
      
      // Filter by members if specific members selected
      console.log('selectedMemberIds value:', selectedMemberIds, 'type:', typeof selectedMemberIds);
      if (selectedMemberIds === null) {
        // null means show nothing
        filteredEntries = [];
        console.log('Members filter is null -> show nothing');
      } else if (selectedMemberIds.length > 0) {
        filteredEntries = filteredEntries.filter(entry => {
          // member_id is a UUID string, compare directly
          const isIncluded = selectedMemberIds.includes(entry.member_id);
          console.log(`Entry member_id: ${entry.member_id}, looking for: ${selectedMemberIds}, included: ${isIncluded}`);
          return isIncluded;
        });
        console.log('After member filter:', filteredEntries.length);
      } else {
        console.log('selectedMemberIds is empty array -> show all members');
      }
      // else: selectedMemberIds is empty array, show all (no filter)
      
      // Filter by income types if specific types selected
      console.log('selectedIncomeTypes value:', selectedIncomeTypes, 'type:', typeof selectedIncomeTypes);
      if (selectedIncomeTypes === null) {
        // null means show nothing
        filteredEntries = [];
        console.log('Types filter is null -> show nothing');
      } else if (selectedIncomeTypes.length > 0) {
        filteredEntries = filteredEntries.filter(entry => 
          selectedIncomeTypes.includes(entry.type)
        );
        console.log('After type filter:', filteredEntries.length);
      } else {
        console.log('selectedIncomeTypes is empty array -> show all types');
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
    
    console.log('Filtered data:', incomeData);
  } catch (error) {
    console.error('Error loading income data:', error);
    incomeData = null;
  }
}

/**
 * Refresh display
 */
function refreshDisplay() {
  const container = document.getElementById('categories-container');
  if (container) {
    container.innerHTML = renderIncomeCategories();
    setupCategoryListeners();
    setupFilterListeners(); // Re-setup filter listeners after re-render
  }

  const totalEl = document.querySelector('.total-amount');
  if (totalEl) {
    const totalAmount = incomeData?.totals?.total_amount || 0;
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
 * Setup category card listeners
 */
function setupCategoryListeners() {
  // Category card click to expand/collapse
  const categoryCards = document.querySelectorAll('.category-card');
  categoryCards.forEach(card => {
    card.querySelector('.category-header')?.addEventListener('click', () => {
      const type = card.dataset.type;
      const details = document.getElementById(`details-${type}`);
      if (details) {
        details.classList.toggle('hidden');
      }
    });
  });

  // Three-dots menu toggle for income entries
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

  // Menu action buttons
  document.querySelectorAll('.three-dots-menu .menu-item').forEach(btn => {
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

  // Add income button (in category list)
  const addBtn = document.getElementById('add-income-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=INGRESO');
    });
  }

  // Add income button (in empty state)
  const addBtnEmpty = document.getElementById('add-income-btn-empty');
  if (addBtnEmpty) {
    addBtnEmpty.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=INGRESO');
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
 * Setup filter dropdown event listeners
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

  // Select all members
  const selectAllMembers = document.getElementById('select-all-members');
  if (selectAllMembers) {
    selectAllMembers.addEventListener('click', () => {
      console.log('SELECT ALL MEMBERS clicked');
      selectedMemberIds = [];
      document.querySelectorAll('[data-filter-type="member"]').forEach(cb => {
        cb.checked = true;
      });
      console.log('After select all members:', selectedMemberIds);
    });
  }

  // Clear all members (deselect all = show none)
  const clearAllMembers = document.getElementById('clear-all-members');
  if (clearAllMembers) {
    clearAllMembers.addEventListener('click', () => {
      console.log('CLEAR ALL MEMBERS clicked');
      selectedMemberIds = []; // Will be set correctly on Apply based on checkboxes
      const checkboxes = document.querySelectorAll('[data-filter-type="member"]');
      console.log('Found', checkboxes.length, 'member checkboxes to uncheck');
      checkboxes.forEach(cb => {
        console.log('Unchecking checkbox:', cb.dataset.value);
        cb.checked = false;
      });
      console.log('After clear all members:', selectedMemberIds);
    });
  }

  // Select all types
  const selectAllTypes = document.getElementById('select-all-types');
  if (selectAllTypes) {
    selectAllTypes.addEventListener('click', () => {
      console.log('SELECT ALL TYPES clicked');
      selectedIncomeTypes = [];
      document.querySelectorAll('[data-filter-type="income-type"]').forEach(cb => {
        cb.checked = true;
      });
      document.querySelectorAll('.filter-category-checkbox').forEach(cb => {
        cb.checked = true;
      });
      console.log('After select all types:', selectedIncomeTypes);
    });
  }

  // Clear all types (deselect all = show none)
  const clearAllTypes = document.getElementById('clear-all-types');
  if (clearAllTypes) {
    clearAllTypes.addEventListener('click', () => {
      console.log('CLEAR ALL TYPES clicked');
      selectedIncomeTypes = []; // Will be set correctly on Apply based on checkboxes
      document.querySelectorAll('[data-filter-type="income-type"]').forEach(cb => {
        cb.checked = false;
      });
      document.querySelectorAll('.filter-category-checkbox').forEach(cb => {
        cb.checked = false;
      });
      console.log('After clear all types:', selectedIncomeTypes);
    });
  }

  // Clear all filters (reset to show all)
  const clearAllFilters = document.getElementById('clear-all-filters');
  if (clearAllFilters) {
    clearAllFilters.addEventListener('click', () => {
      console.log('CLEAR ALL FILTERS clicked (reset to show all)');
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
      
      console.log('After clear all filters (all checked) - members:', selectedMemberIds, 'types:', selectedIncomeTypes);
    });
  }

  // Apply filters
  const applyFilters = document.getElementById('apply-filters');
  if (applyFilters) {
    applyFilters.addEventListener('click', async () => {
      console.log('APPLY FILTERS clicked');
      console.log('Before normalization - members:', selectedMemberIds, 'types:', selectedIncomeTypes);
      
      // Show filter loading overlay
      const filterLoading = document.getElementById('filter-loading');
      if (filterLoading) filterLoading.style.display = 'flex';
      
      // Normalize members based on actual checkbox state, not array content
      const memberCheckboxes = document.querySelectorAll('[data-filter-type="member"]');
      const checkedMembers = Array.from(memberCheckboxes).filter(cb => cb.checked);
      
      console.log('Total member checkboxes:', memberCheckboxes.length);
      console.log('Checked member checkboxes:', checkedMembers.length);
      memberCheckboxes.forEach(cb => {
        console.log(`  Checkbox ${cb.dataset.value}: ${cb.checked}`);
      });
      
      if (checkedMembers.length === 0) {
        // No members checked = show none
        console.log('No members checked -> show none (null)');
        selectedMemberIds = null; // Special value: show nothing
      } else if (checkedMembers.length === householdMembers.length) {
        // All members checked = show all
        console.log('All members checked -> show all (empty array)');
        selectedMemberIds = [];
      } else {
        // Some members checked = show only those
        console.log('Some members checked -> show only those');
        selectedMemberIds = checkedMembers.map(cb => cb.dataset.value);
      }
      
      // Normalize types based on actual checkbox state
      const typeCheckboxes = document.querySelectorAll('[data-filter-type="income-type"]');
      const checkedTypes = Array.from(typeCheckboxes).filter(cb => cb.checked);
      const categories = getIncomeTypeCategories();
      const allTypes = Object.values(categories).flat();
      
      console.log('Total type checkboxes:', typeCheckboxes.length);
      console.log('Checked type checkboxes:', checkedTypes.length);
      
      if (checkedTypes.length === 0) {
        // No types checked = show none
        console.log('No types checked -> show none (null)');
        selectedIncomeTypes = null; // Special value: show nothing
      } else if (checkedTypes.length === allTypes.length) {
        // All types checked = show all
        console.log('All types checked -> show all (empty array)');
        selectedIncomeTypes = [];
      } else {
        // Some types checked = show only those
        console.log('Some types checked -> show only those');
        selectedIncomeTypes = checkedTypes.map(cb => cb.dataset.value);
      }
      
      console.log('After normalization - members:', selectedMemberIds, 'types:', selectedIncomeTypes);
      
      isFilterOpen = false;
      const dropdown = document.getElementById('filter-dropdown');
      if (dropdown) {
        dropdown.style.display = 'none';
      }
      await loadIncomeData();
      refreshDisplay();
      
      // Hide filter loading overlay
      if (filterLoading) filterLoading.style.display = 'none';
    });
  }

  // Member checkboxes
  document.querySelectorAll('[data-filter-type="member"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const memberId = e.target.dataset.value;
      console.log('Member checkbox changed:', memberId, 'checked:', e.target.checked);
      console.log('Current selectedMemberIds:', selectedMemberIds);
      
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
      
      console.log('Updated selectedMemberIds:', selectedMemberIds);
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

  // Load income data
  await loadIncomeData();
  
  // Initial render of content - UPDATE THE DOM after loading data
  const contentContainer = document.querySelector('.dashboard-content');
  if (contentContainer && activeTab === 'ingresos') {
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
      
      // Update content
      const contentContainer = document.querySelector('.dashboard-content');
      if (contentContainer) {
        contentContainer.innerHTML = activeTab === 'ingresos' ? `
          ${renderMonthSelector()}
          
          <div class="total-display">
            <div class="total-label">Total</div>
            <div class="total-amount">${formatCurrency(incomeData?.totals?.total_amount || 0)}</div>
          </div>

          <div id="categories-container">
            ${renderIncomeCategories()}
          </div>
        ` : `
          <div class="coming-soon">
            <div class="coming-soon-icon">${activeTab === 'gastos' ? '🛒' : '💳'}</div>
            <p>Próximamente</p>
          </div>
        `;
        
        if (activeTab === 'ingresos') {
          setupMonthNavigation();
          setupCategoryListeners();
        }
      }
    });
  });

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
  if (container) {
    container.innerHTML = `
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
      await loadIncomeData();
      refreshDisplay();
    };
  }

  if (nextBtn) {
    nextBtn.onclick = async () => {
      currentMonth = nextMonth(currentMonth);
      showLoadingState();
      await loadIncomeData();
      refreshDisplay();
    };
  }
}
