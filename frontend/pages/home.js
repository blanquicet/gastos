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
let selectedMemberId = null; // null = "Todos"

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
    'savings_withdrawal': '📦',
    'previous_balance': '📊',
    'adjustment': '⚖️'
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
 * Render member filter (same style as month selector)
 */
function renderMemberFilter() {
  const members = [
    { id: null, name: 'Todo el hogar' },
    ...householdMembers.map(m => ({ id: m.user_id, name: m.name }))
  ];

  const currentIndex = members.findIndex(m => m.id === selectedMemberId);
  const selectedMember = members[currentIndex] || members[0];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < members.length - 1;

  return `
    <div class="member-filter-nav">
      <button id="prev-member-btn" class="month-nav-btn" ${!hasPrev ? 'disabled' : ''}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"/>
        </svg>
      </button>
      <div class="month-display">${selectedMember.name}</div>
      <button id="next-member-btn" class="month-nav-btn" ${!hasNext ? 'disabled' : ''}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"/>
        </svg>
      </button>
    </div>
  `;
}

/**
 * Render income categories
 */
function renderIncomeCategories() {
  if (!incomeData || !incomeData.income_entries || incomeData.income_entries.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>No hay ingresos registrados este mes</p>
        <button id="add-income-btn" class="btn-primary">+ Agregar ingreso</button>
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
                  <div class="entry-description-row">
                    <span class="entry-description">${entry.description || entry.member_name}</span>
                    <span class="entry-member-badge">${entry.member_name}</span>
                  </div>
                  <span class="entry-amount">${formatCurrency(entry.amount)}</span>
                </div>
                <div class="entry-actions">
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
    <button id="add-income-btn" class="btn-add-floating">+</button>
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
        <h1 class="dashboard-title">Resumen</h1>
        ${Navbar.render(user, '/')}
      </header>

      ${renderTabs()}
      
      <div class="dashboard-content">
        ${activeTab === 'ingresos' ? `
          ${renderMonthSelector()}
          ${renderMemberFilter()}
          
          <div class="total-display">
            <div class="total-label">Total</div>
            <div class="total-amount">${formatCurrency(totalAmount)}</div>
          </div>

          <div id="categories-container">
            ${renderIncomeCategories()}
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
    if (selectedMemberId) {
      url += `&member_id=${selectedMemberId}`;
    }
    
    const response = await fetch(url, {
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
 * Refresh display
 */
function refreshDisplay() {
  const container = document.getElementById('categories-container');
  if (container) {
    container.innerHTML = renderIncomeCategories();
    setupCategoryListeners();
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

  // Update member filter
  const memberFilterNav = document.querySelector('.member-filter-nav');
  if (memberFilterNav) {
    memberFilterNav.outerHTML = renderMemberFilter();
    setupMonthNavigation(); // Re-setup listeners
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

  // Add income button
  const addBtn = document.getElementById('add-income-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      router.navigate('/registrar-movimiento?tipo=INGRESO');
    });
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

  // Load household members for filter
  await loadHouseholdMembers();

  // Load income data
  await loadIncomeData();
  
  // Initial render of content - UPDATE THE DOM after loading data
  const contentContainer = document.querySelector('.dashboard-content');
  if (contentContainer && activeTab === 'ingresos') {
    contentContainer.innerHTML = `
      ${renderMonthSelector()}
      ${renderMemberFilter()}
      
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
          ${renderMemberFilter()}
          
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
 * Setup month navigation listeners
 */
function setupMonthNavigation() {
  const prevBtn = document.getElementById('prev-month-btn');
  const nextBtn = document.getElementById('next-month-btn');
  const prevMemberBtn = document.getElementById('prev-member-btn');
  const nextMemberBtn = document.getElementById('next-member-btn');

  if (prevBtn) {
    // Remove old listener if exists
    const newPrevBtn = prevBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
    
    newPrevBtn.addEventListener('click', async () => {
      currentMonth = previousMonth(currentMonth);
      await loadIncomeData();
      refreshDisplay();
    });
  }

  if (nextBtn) {
    // Remove old listener if exists
    const newNextBtn = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    
    newNextBtn.addEventListener('click', async () => {
      currentMonth = nextMonth(currentMonth);
      await loadIncomeData();
      refreshDisplay();
    });
  }

  // Member navigation
  if (prevMemberBtn) {
    prevMemberBtn.addEventListener('click', async () => {
      const members = [
        { id: null, name: 'Todo el hogar' },
        ...householdMembers.map(m => ({ id: m.user_id, name: m.name }))
      ];
      const currentIndex = members.findIndex(m => m.id === selectedMemberId);
      if (currentIndex > 0) {
        selectedMemberId = members[currentIndex - 1].id;
        await loadIncomeData();
        refreshDisplay();
      }
    });
  }

  if (nextMemberBtn) {
    nextMemberBtn.addEventListener('click', async () => {
      const members = [
        { id: null, name: 'Todo el hogar' },
        ...householdMembers.map(m => ({ id: m.user_id, name: m.name }))
      ];
      const currentIndex = members.findIndex(m => m.id === selectedMemberId);
      if (currentIndex < members.length - 1) {
        selectedMemberId = members[currentIndex + 1].id;
        await loadIncomeData();
        refreshDisplay();
      }
    });
  }
}
