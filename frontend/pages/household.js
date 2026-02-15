/**
 * Household Page (Read-Only First)
 * 
 * Display household details:
 * - Household name and info
 * - List of members with roles
 * - List of contacts with linkage status
 */

import { API_URL } from '../config.js';
import router from '../router.js';
import * as Navbar from '../components/navbar.js';
import { showConfirmation, showSuccess, showError } from '../utils.js';
import { validateEmail } from '../auth-utils.js';

// Phone validation regex
// Allows: 3001234567 (10-14 digits) or +573001234567 (+ plus up to 13 digits)
const PHONE_REGEX = /^(\+\d{1,13}|\d{10,14})$/;

let currentUser = null;
let household = null;
let members = [];
let contacts = [];
let sharedPaymentMethods = [];
let categoryGroups = [];
let categories = [];

/**
 * Render household page
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
          <h1>Mi hogar</h1>
          ${Navbar.render(user, '/hogar')}
        </div>
        <p class="subtitle">Administra tu hogar, miembros y contactos.</p>
      </header>

      <div id="household-content">
        <div class="loading-section">
          <div class="spinner-small"></div>
          <p>Cargando información del hogar...</p>
        </div>
      </div>
    </main>
  `;
}

/**
 * Setup household page
 */
export async function setup() {
  Navbar.setup();
  
  // Setup back link
  const backLink = document.getElementById('back-to-profile');
  backLink?.addEventListener('click', (e) => {
    e.preventDefault();
    router.navigate('/perfil');
  });
  
  await loadHousehold();
}

/**
 * Load household data
 */
async function loadHousehold() {
  const contentEl = document.getElementById('household-content');
  
  try {
    // Fetch user's households
    const householdsResponse = await fetch(`${API_URL}/households`, {
      credentials: 'include'
    });

    if (!householdsResponse.ok) {
      throw new Error('Error al cargar hogares');
    }

    const data = await householdsResponse.json();
    const households = data.households || [];
    
    if (households.length === 0) {
      // No household - redirect to home where modal can be shown
      router.navigate('/');
      return;
    }

    household = households[0];

    // Fetch household details (members and contacts)
    const detailsResponse = await fetch(`${API_URL}/households/${household.id}`, {
      credentials: 'include'
    });

    if (!detailsResponse.ok) {
      throw new Error('Error al cargar detalles del hogar');
    }

    const details = await detailsResponse.json();
    members = details.members || [];
    contacts = details.contacts || [];
    sharedPaymentMethods = details.shared_payment_methods || [];

    // Fetch category groups and categories
    const [groupsRes, catsRes] = await Promise.all([
      fetch(`${API_URL}/category-groups?include_inactive=true`, { credentials: 'include' }),
      fetch(`${API_URL}/categories?include_inactive=true`, { credentials: 'include' }),
    ]);
    if (groupsRes.ok) {
      categoryGroups = await groupsRes.json();
    }
    if (catsRes.ok) {
      const catsData = await catsRes.json();
      categories = catsData.categories || [];
    }

    // Render content
    contentEl.innerHTML = renderHouseholdContent();
    setupEventHandlers();
    loadAndRenderLinkRequests();

  } catch (error) {
    console.error('Error loading household:', error);
    contentEl.innerHTML = `
      <div class="error-box">
        <p>Error al cargar tu hogar. Por favor, intenta de nuevo.</p>
        <button id="retry-btn" class="btn-secondary">Reintentar</button>
      </div>
    `;
    
    document.getElementById('retry-btn')?.addEventListener('click', loadHousehold);
  }
}

/**
 * Render household content
 */
function renderHouseholdContent() {
  const userMember = members.find(m => m.user_id === currentUser.id);
  const isOwner = userMember?.role === 'owner';
  const isLastOwner = userMember?.role === 'owner' && members.filter(m => m.role === 'owner').length === 1;
  const canLeave = !isLastOwner;

  return `
    <div class="household-section">
      <div class="household-header-card">
        <div class="household-icon-large">🏠</div>
        <div class="household-info-large">
          <h2>${household.name}</h2>
          <p class="household-meta">Creado el ${formatDate(household.created_at)}</p>
        </div>
        <div class="household-header-actions">
          <button class="three-dots-btn" id="household-menu-btn">⋮</button>
          <div class="three-dots-menu" id="household-menu">
            ${canLeave ? '<button class="menu-item" data-action="leave-household">Salir del hogar</button>' : ''}
            ${isOwner ? '<button class="menu-item menu-item-danger" data-action="delete-household">Eliminar hogar</button>' : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="household-section">
      <div class="section-header">
        <h3 class="section-title">Miembros</h3>
        ${isOwner ? '<button id="invite-member-btn" class="btn-secondary btn-small">+ Invitar miembro</button>' : ''}
      </div>
      <p class="section-description">Personas que viven en este hogar con acceso a todos los movimientos.</p>
      <div id="invite-form-container" style="display: none;">
        ${renderInviteForm()}
      </div>
      <div class="scroll-fade-container">
        ${renderMembersList(isOwner)}
      </div>
    </div>

    <div id="link-requests-section"></div>

    <div class="household-section">
      <div class="section-header">
        <h3 class="section-title">Contactos</h3>
        <button id="add-contact-btn" class="btn-secondary btn-small">+ Agregar contacto</button>
      </div>
      <p class="section-description">Personas con las que tienes transacciones ocasionales (amigos, familia externa, etc.). Solo ven movimientos donde participan.</p>
      <div id="contact-form-container" style="display: none;">
        ${renderContactForm()}
      </div>
      <div class="scroll-fade-container">
        ${renderContactsList()}
      </div>
    </div>

    <div class="household-section">
      <div class="section-header">
        <h3 class="section-title">Métodos de Pago Compartidos</h3>
      </div>
      <p class="section-description">Métodos de pago que todos los miembros del hogar pueden usar para registrar movimientos. Gestiona tus métodos de pago desde tu perfil.</p>
      <div class="scroll-fade-container">
        ${renderSharedPaymentMethods()}
      </div>
    </div>

    <div class="household-section">
      <div class="section-header">
        <h3 class="section-title">Grupos y Categorías</h3>
        <button id="add-group-btn" class="btn-secondary btn-small">+ Agregar grupo</button>
      </div>
      <p class="section-description">Organiza tus gastos en grupos y categorías.</p>
      <div class="scroll-fade-container">
        <div id="categories-content">
          ${renderCategoriesSection()}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render members list
 */
function renderMembersList(isOwner) {
  if (members.length === 0) {
    return `
      <div class="empty-state">
        <p>No hay miembros en este hogar todavía.</p>
      </div>
    `;
  }

  const userMember = members.find(m => m.user_id === currentUser.id);
  
  return `
    <div class="members-list">
      ${members.map(member => `
        <div class="member-item">
          <div class="member-avatar">${member.user_name?.charAt(0).toUpperCase() || '?'}</div>
          <div class="member-info">
            <div class="member-name">${member.user_name || 'Usuario'}</div>
            <div class="member-email">${member.user_email || ''}</div>
          </div>
          <div class="member-role ${member.role === 'owner' ? 'role-owner' : 'role-member'}">
            ${member.role === 'owner' ? 'Dueño' : 'Miembro'}
          </div>
          ${renderMemberActions(member, isOwner, userMember)}
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render member action buttons
 */
function renderMemberActions(member, isOwner, userMember) {
  // Can't act on yourself if you're the last owner
  const isLastOwner = member.role === 'owner' && members.filter(m => m.role === 'owner').length === 1;
  const isSelf = member.user_id === currentUser.id;
  
  let menuItems = [];
  
  if (isSelf && !isLastOwner) {
    menuItems.push(`<button class="menu-item" data-action="leave" data-user-id="${member.user_id}">Salir del hogar</button>`);
  }
  
  if (isOwner && !isSelf) {
    if (member.role === 'member') {
      menuItems.push(`<button class="menu-item" data-action="promote" data-user-id="${member.user_id}">Promover a dueño</button>`);
    } else if (!isLastOwner) {
      menuItems.push(`<button class="menu-item" data-action="demote" data-user-id="${member.user_id}">Quitar como dueño</button>`);
    }
    menuItems.push(`<button class="menu-item menu-item-danger" data-action="remove" data-user-id="${member.user_id}">Remover</button>`);
  }
  
  // Always return a div for consistent spacing, even if empty
  if (menuItems.length === 0) {
    return '<div class="member-actions"></div>';
  }
  
  return `
    <div class="member-actions">
      <button class="three-dots-btn" data-member-id="${member.user_id}">⋮</button>
      <div class="three-dots-menu" id="member-menu-${member.user_id}">
        ${menuItems.join('')}
      </div>
    </div>
  `;
}

/**
 * Render contacts list
 */
function renderContactsList() {
  if (contacts.length === 0) {
    return `
      <div class="empty-state">
        <p>No hay contactos registrados todavía.</p>
      </div>
    `;
  }

  const userMember = members.find(m => m.user_id === currentUser.id);
  const isOwner = userMember?.role === 'owner';

  const sortedContacts = [...contacts].sort((a, b) => {
    if (a.is_active === b.is_active) return 0;
    return a.is_active ? -1 : 1;
  });

  return `
    <div class="contacts-list">
      ${sortedContacts.map(contact => `
        <div class="contact-item">
          <div class="contact-avatar">${contact.name.charAt(0).toUpperCase()}</div>
          <div class="contact-info">
            <div class="contact-name">${contact.name}</div>
            <div class="contact-details">
              ${contact.email ? contact.email : ''}
              ${contact.phone ? (contact.email ? ' · ' : '') + contact.phone : ''}
            </div>
          </div>
          <div class="contact-badges">
            ${contact.link_status === 'ACCEPTED' ? '<span class="linked-badge linked-accepted">Vinculado</span>' : ''}
            ${contact.link_status === 'PENDING' ? '<span class="linked-badge linked-pending">Pendiente</span>' : ''}
            ${contact.link_status === 'REJECTED' ? '<span class="linked-badge linked-rejected">Rechazado</span>' : ''}
            ${!contact.is_active ? '<span class="inactive-badge">Inactivo</span>' : ''}
          </div>
          <div class="contact-actions">
            <button class="three-dots-btn" data-contact-id="${contact.id}">⋮</button>
            <div class="three-dots-menu" id="contact-menu-${contact.id}">
              <button class="menu-item" data-action="toggle-active" data-contact-id="${contact.id}" data-is-active="${contact.is_active}">
                ${contact.is_active ? 'Desactivar' : 'Activar'}
              </button>
              <button class="menu-item" data-action="edit-contact" data-contact-id="${contact.id}">Editar</button>
              <button class="menu-item menu-item-danger" data-action="delete-contact" data-contact-id="${contact.id}">Eliminar</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render shared payment methods list
 */
function renderSharedPaymentMethods() {
  if (sharedPaymentMethods.length === 0) {
    return `
      <div class="empty-state">
        <p>No hay métodos de pago compartidos todavía.</p>
        <p class="hint">Los miembros pueden compartir sus métodos de pago desde su perfil.</p>
      </div>
    `;
  }

  const getPaymentMethodIcon = (type) => {
    const icons = {
      credit_card: '💳',
      debit_card: '💳',
      bank_account: '🏦',
      cash: '💵',
      digital_wallet: '📱',
      other: '💰'
    };
    return icons[type] || '💰';
  };

  const PAYMENT_METHOD_TYPES = {
    credit_card: 'Tarjeta de Crédito',
    debit_card: 'Tarjeta de Débito',
    bank_account: 'Cuenta Bancaria',
    cash: 'Efectivo',
    digital_wallet: 'Billetera Digital',
    other: 'Otro'
  };

  return `
    <div class="contacts-list">
      ${sharedPaymentMethods.map(pm => `
        <div class="contact-item">
          <div class="contact-avatar">${getPaymentMethodIcon(pm.type)}</div>
          <div class="contact-info">
            <div class="contact-name">
              ${pm.name}
              ${!pm.is_active ? '<span class="inactive-badge">❌ Inactivo</span>' : ''}
            </div>
            <div class="contact-details">
              ${PAYMENT_METHOD_TYPES[pm.type] || pm.type}
              ${pm.institution ? ' · ' + pm.institution : ''}
              ${pm.last4 ? ' · •••• ' + pm.last4 : ''}
              · Propiedad de ${pm.owner_name}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Format date to readable format
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-CO', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

/**
 * Render invite member form
 */
function renderInviteForm() {
  return `
    <div class="form-card">
      <h4>Invitar miembro al hogar</h4>
      <div id="invite-error" class="error-message" style="display: none;"></div>
      <form id="invite-form" class="grid">
        <div class="field">
          <label>
            <span>Email del miembro</span>
            <input type="email" id="invite-email" required placeholder="ejemplo@correo.com" />
            <span class="field-hint" id="invite-email-hint" style="display: none; color: #dc2626;">Formato de email inválido</span>
          </label>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">Enviar invitación</button>
          <button type="button" id="cancel-invite-btn" class="btn-secondary">Cancelar</button>
        </div>
      </form>
    </div>
  `;
}

/**
 * Render contact form
 */
function renderContactForm(contact = null) {
  return `
    <div class="form-card">
      <h4>${contact ? 'Editar contacto' : 'Agregar contacto'}</h4>
      <div id="contact-error" class="error-message" style="display: none;"></div>
      <form id="contact-form" class="grid">
        <div class="field">
          <label>
            <span>Nombre *</span>
            <input type="text" id="contact-name" required maxlength="100" value="${contact?.name || ''}" placeholder="Nombre del contacto" />
          </label>
        </div>
        <div class="field">
          <label>
            <span>Email</span>
            <input type="email" id="contact-email" value="${contact?.email || ''}" placeholder="email@ejemplo.com (opcional)" />
            <span class="field-hint" id="email-hint" style="display: none; color: #dc2626;">Formato de email inválido</span>
          </label>
        </div>
        <div class="field">
          <label>
            <span>Teléfono</span>
            <input type="tel" id="contact-phone" value="${contact?.phone || ''}" placeholder="3001234567 o +573001234567 (opcional)" />
            <span class="field-hint" id="phone-hint" style="display: none; color: #dc2626;">Formato: 10-14 dígitos o +[país][número]</span>
          </label>
        </div>
        <div class="field">
          <label>
            <span>Notas</span>
            <textarea id="contact-notes" rows="2" placeholder="Notas adicionales (opcional)">${contact?.notes || ''}</textarea>
          </label>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">${contact ? 'Guardar' : 'Agregar'}</button>
          <button type="button" id="cancel-contact-btn" class="btn-secondary">Cancelar</button>
        </div>
      </form>
    </div>
  `;
}

/**
 * Setup scroll fade indicators on scrollable list containers.
 * Shows a bottom gradient when the list can be scrolled further down.
 */
function setupScrollFadeIndicators() {
  document.querySelectorAll('.scroll-fade-container').forEach(container => {
    const scrollable = container.querySelector('.members-list, .contacts-list, #categories-content');
    if (!scrollable) return;

    const update = () => {
      const canScrollDown = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight > 2;
      container.classList.toggle('has-overflow', canScrollDown);
    };

    scrollable.addEventListener('scroll', update);
    update();
  });
}

/**
 * Setup event handlers
 */
function setupEventHandlers() {
  setupScrollFadeIndicators();

  // Household three-dots menu toggle
  const householdMenuBtn = document.getElementById('household-menu-btn');
  householdMenuBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const menu = document.getElementById('household-menu');
    const isOpen = menu.style.display === 'block';
    
    // Close all menus
    document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
    
    // Toggle this menu
    if (!isOpen) {
      menu.style.display = 'block';
    }
  });

  // Contact three-dots menu toggle
  document.querySelectorAll('.three-dots-btn[data-contact-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const contactId = e.currentTarget.dataset.contactId;
      const menu = document.getElementById(`contact-menu-${contactId}`);
      const isOpen = menu.style.display === 'block';
      
      // Close all menus
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
      
      // Toggle this menu
      if (!isOpen) {
        menu.style.display = 'block';
      }
    });
  });

  // Member three-dots menu toggle
  document.querySelectorAll('.three-dots-btn[data-member-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const memberId = e.currentTarget.dataset.memberId;
      const menu = document.getElementById(`member-menu-${memberId}`);
      const isOpen = menu.style.display === 'block';
      
      // Close all menus
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
      
      // Toggle this menu
      if (!isOpen) {
        menu.style.display = 'block';
      }
    });
  });

  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.contact-actions') && 
        !e.target.closest('.household-header-actions') && 
        !e.target.closest('.member-actions') &&
        !e.target.closest('.cat-group-right') &&
        !e.target.closest('.cat-item-actions')) {
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
    }
  });

  // Invite member button
  const inviteBtn = document.getElementById('invite-member-btn');
  inviteBtn?.addEventListener('click', () => {
    const container = document.getElementById('invite-form-container');
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
  });

  // Add contact button
  const addContactBtn = document.getElementById('add-contact-btn');
  addContactBtn?.addEventListener('click', () => {
    const container = document.getElementById('contact-form-container');
    
    if (container.style.display === 'block') {
      container.style.display = 'none';
    } else {
      container.innerHTML = renderContactForm();
      container.style.display = 'block';
      setupContactFormHandlers();
    }
  });

  // All action buttons (including those in three-dots menus)
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = e.target.dataset.action;
      const userId = e.target.dataset.userId;
      const contactId = e.target.dataset.contactId;

      // Close all menus
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');

      // Handle actions
      if (action === 'leave-household') await handleLeaveHousehold();
      else if (action === 'delete-household') await handleDeleteHousehold();
      else if (action === 'remove') await handleRemoveMember(userId);
      else if (action === 'leave') await handleLeaveMember();
      else if (action === 'promote') await handlePromoteMember(userId);
      else if (action === 'demote') await handleDemoteMember(userId);
      else if (action === 'toggle-active') await handleToggleContactActive(contactId, e.target.dataset.isActive === 'true');
      else if (action === 'edit-contact') handleEditContact(contactId);
      else if (action === 'delete-contact') await handleDeleteContact(contactId);
    });
  });

  // Invite form
  const inviteForm = document.getElementById('invite-form');
  inviteForm?.addEventListener('submit', handleInviteSubmit);
  
  // Setup invite email validation
  const inviteEmailInput = document.getElementById('invite-email');
  inviteEmailInput?.addEventListener('blur', validateInviteEmail);
  inviteEmailInput?.addEventListener('input', () => {
    const hint = document.getElementById('invite-email-hint');
    if (hint && inviteEmailInput.value.trim() === '') {
      hint.style.display = 'none';
      inviteEmailInput.classList.remove('invalid', 'valid');
    }
  });
  
  document.getElementById('cancel-invite-btn')?.addEventListener('click', () => {
    document.getElementById('invite-form-container').style.display = 'none';
  });

  setupContactFormHandlers();
  setupCategoriesHandlers();
}

/**
 * Validate invite email
 */
function validateInviteEmail() {
  const emailInput = document.getElementById('invite-email');
  const hint = document.getElementById('invite-email-hint');
  const email = emailInput.value.trim();
  
  // Empty is not OK (required field)
  if (email === '') {
    hint.style.display = 'none';
    emailInput.classList.remove('invalid', 'valid');
    return false;
  }
  
  const isValid = validateEmail(email);
  
  if (isValid) {
    hint.style.display = 'none';
    emailInput.classList.remove('invalid');
    emailInput.classList.add('valid');
  } else {
    hint.style.display = 'block';
    emailInput.classList.remove('valid');
    emailInput.classList.add('invalid');
  }
  
  return isValid;
}

/**
 * Setup contact form validation handlers (without submit handler)
 */
function setupContactFormValidationHandlers() {
  // Setup real-time validation
  const emailInput = document.getElementById('contact-email');
  const phoneInput = document.getElementById('contact-phone');
  
  emailInput?.addEventListener('blur', validateContactEmail);
  emailInput?.addEventListener('input', () => {
    // Clear error on input
    const hint = document.getElementById('email-hint');
    if (hint && emailInput.value.trim() === '') {
      hint.style.display = 'none';
      emailInput.classList.remove('invalid', 'valid');
    }
  });
  
  phoneInput?.addEventListener('blur', validateContactPhone);
  phoneInput?.addEventListener('input', () => {
    // Clear error on input
    const hint = document.getElementById('phone-hint');
    if (hint && phoneInput.value.trim() === '') {
      hint.style.display = 'none';
      phoneInput.classList.remove('invalid', 'valid');
    }
  });
  
  document.getElementById('cancel-contact-btn')?.addEventListener('click', () => {
    document.getElementById('contact-form-container').style.display = 'none';
  });
}

/**
 * Setup contact form handlers for creating new contacts
 */
function setupContactFormHandlers() {
  const contactForm = document.getElementById('contact-form');
  contactForm?.addEventListener('submit', handleContactSubmit);
  setupContactFormValidationHandlers();
}

/**
 * Validate contact email
 */
function validateContactEmail() {
  const emailInput = document.getElementById('contact-email');
  const hint = document.getElementById('email-hint');
  const email = emailInput.value.trim();
  
  // Empty is OK (optional field)
  if (email === '') {
    hint.style.display = 'none';
    emailInput.classList.remove('invalid', 'valid');
    return true;
  }
  
  const isValid = validateEmail(email);
  
  if (isValid) {
    hint.style.display = 'none';
    emailInput.classList.remove('invalid');
    emailInput.classList.add('valid');
  } else {
    hint.style.display = 'block';
    emailInput.classList.remove('valid');
    emailInput.classList.add('invalid');
  }
  
  return isValid;
}

/**
 * Validate contact phone
 */
function validateContactPhone() {
  const phoneInput = document.getElementById('contact-phone');
  const hint = document.getElementById('phone-hint');
  const phone = phoneInput.value.trim();
  
  // Empty is OK (optional field)
  if (phone === '') {
    hint.style.display = 'none';
    phoneInput.classList.remove('invalid', 'valid');
    return true;
  }
  
  const isValid = PHONE_REGEX.test(phone);
  
  if (isValid) {
    hint.style.display = 'none';
    phoneInput.classList.remove('invalid');
    phoneInput.classList.add('valid');
  } else {
    hint.style.display = 'block';
    phoneInput.classList.remove('valid');
    phoneInput.classList.add('invalid');
  }
  
  return isValid;
}

/**
 * Handle invite member submission
 */
async function handleInviteSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('invite-email').value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('invite-error');

  // Hide previous errors
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  // Validate email format
  if (!validateInviteEmail()) {
    if (errorEl) {
      errorEl.textContent = 'Por favor corrija el formato del email';
      errorEl.style.display = 'block';
    }
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/invitations`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al enviar invitación');
    }

    // Always show invitation sent message (all users must accept via email now)
    await showSuccess('Invitación enviada', `Se envió la invitación a ${email}. Debe aceptarla desde el link en su correo.`);
    
    document.getElementById('invite-form-container').style.display = 'none';
    document.getElementById('invite-email').value = '';
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
}

/**
 * Handle contact form submission
 */
async function handleContactSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('contact-name').value.trim();
  const email = document.getElementById('contact-email').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  const notes = document.getElementById('contact-notes').value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('contact-error');

  // Hide previous errors
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  if (!name) {
    showModal('Error', 'El nombre es requerido');
    return;
  }

  // Validate email if provided
  if (email && !validateContactEmail()) {
    if (errorEl) {
      errorEl.textContent = 'Por favor corrija el formato del email';
      errorEl.style.display = 'block';
    }
    return;
  }

  // Validate phone if provided
  if (phone && !validateContactPhone()) {
    if (errorEl) {
      errorEl.textContent = 'Por favor corrija el formato del teléfono';
      errorEl.style.display = 'block';
    }
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/contacts`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: email || null, phone: phone || null, notes: notes || null })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al agregar contacto');
    }

    await loadHousehold();
  } catch (error) {
    showModal('Error', error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
}

/**
 * Handle remove member
 */
async function handleRemoveMember(userId) {
  if (!await showConfirmation('Remover miembro', '¿Estás seguro de remover este miembro del hogar?', 'Remover')) return;

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/members/${userId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al remover miembro');
    }

    await loadHousehold();
  } catch (error) {
    await showError('Error', error.message);
  }
}

/**
 * Handle leave household
 */
async function handleLeaveMember() {
  if (!await showConfirmation('Salir del hogar', '¿Estás seguro de salir de este hogar?', 'Salir')) return;

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/leave`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al salir del hogar');
    }

    router.navigate('/perfil');
  } catch (error) {
    await showError('Error', error.message);
  }
}

/**
 * Handle promote member
 */
async function handlePromoteMember(userId) {
  const message = `
    <p><strong>¿Cuál es la diferencia?</strong></p>
    <ul style="text-align: left; margin: 12px 0; padding-left: 20px;">
      <li><strong>Miembro:</strong> Puede ver y registrar movimientos del hogar.</li>
      <li><strong>Dueño:</strong> Además puede invitar personas, gestionar miembros, y eliminar el hogar.</li>
    </ul>
    <p>¿Deseas promover este miembro a dueño?</p>
  `;
  if (!await showConfirmation('Promover a dueño', message, 'Promover')) return;

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/members/${userId}/role`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'owner' })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al promover miembro');
    }

    await loadHousehold();
  } catch (error) {
    await showError('Error', error.message);
  }
}

/**
 * Handle demote member
 */
async function handleDemoteMember(userId) {
  const message = `
    <p><strong>¿Cuál es la diferencia?</strong></p>
    <ul style="text-align: left; margin: 12px 0; padding-left: 20px;">
      <li><strong>Dueño:</strong> Puede invitar personas, gestionar miembros, y eliminar el hogar.</li>
      <li><strong>Miembro:</strong> Solo puede ver y registrar movimientos del hogar.</li>
    </ul>
    <p>¿Deseas quitar los permisos de dueño a este miembro?</p>
  `;
  if (!await showConfirmation('Quitar como dueño', message, 'Cambiar')) return;

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/members/${userId}/role`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'member' })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al cambiar rol');
    }

    await loadHousehold();
  } catch (error) {
    await showError('Error', error.message);
  }
}

/**
 * Handle edit contact
 */
function handleEditContact(contactId) {
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;

  const container = document.getElementById('contact-form-container');
  container.innerHTML = renderContactForm(contact);
  container.style.display = 'block';

  // Setup validation handlers ONLY (not the submit handler that creates new contacts)
  setupContactFormValidationHandlers();

  const form = document.getElementById('contact-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleUpdateContact(contactId);
  });
}

/**
 * Handle update contact
 */
async function handleUpdateContact(contactId) {
  const name = document.getElementById('contact-name').value.trim();
  const email = document.getElementById('contact-email').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();
  const notes = document.getElementById('contact-notes').value.trim();
  const submitBtn = document.querySelector('#contact-form button[type="submit"]');

  if (!name) {
    showModal('Error', 'El nombre es requerido');
    return;
  }

  // Validate email if provided
  if (email && !validateContactEmail()) {
    return;
  }

  // Validate phone if provided
  if (phone && !validateContactPhone()) {
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add('loading');

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/contacts/${contactId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: email || null, phone: phone || null, notes: notes || null })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al actualizar contacto');
    }

    await loadHousehold();
  } catch (error) {
    showModal('Error', error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('loading');
  }
}

/**
 * Handle delete contact
 */
/**
 * Handle toggle contact active/inactive
 */
async function handleToggleContactActive(contactId, currentIsActive) {
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;

  const newIsActive = !currentIsActive;
  const actionText = newIsActive ? 'activar' : 'desactivar';
  
  if (!await showConfirmation(
    `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} contacto`,
    `¿Estás seguro de ${actionText} a ${contact.name}?`,
    actionText.charAt(0).toUpperCase() + actionText.slice(1)
  )) return;

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: contact.name,
        is_active: newIsActive
      })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || `Error al ${actionText} contacto`);
    }

    showSuccess('Éxito', `Contacto ${newIsActive ? 'activado' : 'desactivado'} correctamente`);
    await loadHousehold();
  } catch (error) {
    await showError('Error', error.message);
  }
}

async function handleDeleteContact(contactId) {
  if (!await showConfirmation('Eliminar contacto', '¿Estás seguro de eliminar este contacto?', 'Eliminar')) return;

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/contacts/${contactId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al eliminar contacto');
    }

    await loadHousehold();
  } catch (error) {
    await showError('Error', error.message);
  }
}

/**
 * Handle leave household (from header button)
 */
async function handleLeaveHousehold() {
  if (!await showConfirmation('Salir del hogar', '¿Estás seguro de salir de este hogar?', 'Salir')) return;

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/leave`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al salir del hogar');
    }

    router.navigate('/perfil');
  } catch (error) {
    await showError('Error', error.message);
  }
}

/**
 * Handle delete household
 */
async function handleDeleteHousehold() {
  const confirmed = await showConfirmation(
    'Eliminar hogar',
    `¿Estás seguro de eliminar el hogar "${household.name}"? Esta acción no se puede deshacer y eliminará todos los datos asociados.`,
    'Eliminar hogar',
    'eliminar'
  );
  
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_URL}/households/${household.id}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      // Try to get error message
      let errorMessage = 'Error al eliminar hogar';
      try {
        const data = await response.json();
        errorMessage = data.error || errorMessage;
      } catch (e) {
        // Ignore JSON parse error
      }
      throw new Error(errorMessage);
    }

    // Success - navigate to profile
    router.navigate('/perfil');
  } catch (error) {
    await showError('Error', error.message);
  }
}

// ═══════════════════════════════════════════════════════════
// CATEGORIES & GROUPS
// ═══════════════════════════════════════════════════════════

function renderCategoriesSection() {
  const sorted = [...categoryGroups].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  if (sorted.length === 0) {
    return `<div class="empty-state"><p>No hay categorías configuradas aún.</p></div>`;
  }

  let html = '';
  sorted.forEach(group => {
    const cats = (group.categories || []).sort((a, b) => {
      if (a.is_active !== false && b.is_active === false) return -1;
      if (a.is_active === false && b.is_active !== false) return 1;
      return a.name.localeCompare(b.name, 'es');
    });
    const inactiveClass = group.is_active === false ? ' cat-inactive' : '';
    html += `
      <div class="cat-group-card${inactiveClass}" data-group-id="${group.id}">
        <div class="cat-group-header" data-toggle-group="${group.id}">
          <div class="cat-group-left">
            ${group.icon ? `<span class="cat-group-icon">${group.icon}</span>` : '<span class="cat-group-icon">📦</span>'}
            <span class="cat-group-name">${group.name}</span>
            <span class="cat-group-count">${cats.length}</span>
          </div>
          <div class="cat-group-right">
            <button class="three-dots-btn" data-group-menu="${group.id}">⋮</button>
            <div class="three-dots-menu" id="group-menu-${group.id}">
              ${group.is_active !== false ? `
                <button class="menu-item" data-action="edit-group" data-group-id="${group.id}">Editar</button>
                <button class="menu-item" data-action="add-category" data-group-id="${group.id}">Agregar categoría</button>
                <button class="menu-item" data-action="deactivate-group" data-group-id="${group.id}">Desactivar</button>
                <button class="menu-item menu-item-danger" data-action="delete-group" data-group-id="${group.id}">Eliminar</button>
              ` : `
                <button class="menu-item" data-action="reactivate-group" data-group-id="${group.id}">Reactivar</button>
                <button class="menu-item menu-item-danger" data-action="delete-group" data-group-id="${group.id}">Eliminar</button>
              `}
            </div>
            <svg class="cat-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
        <div class="cat-group-body hidden" id="group-body-${group.id}">
          ${cats.length === 0
            ? '<div class="cat-empty">Sin categorías en este grupo.</div>'
            : cats.map(c => renderCategoryItem(c)).join('')}
          ${group.is_active !== false ? `
            <button class="cat-add-btn" data-action="add-category" data-group-id="${group.id}">+ Agregar categoría</button>
          ` : ''}
        </div>
      </div>`;
  });

  return html;
}

function renderCategoryItem(cat) {
  const inactiveClass = !cat.is_active ? ' cat-inactive' : '';
  return `
    <div class="cat-item${inactiveClass}" data-cat-id="${cat.id}">
      <span class="cat-item-name">${cat.name}</span>
      <div class="cat-item-actions">
        <button class="three-dots-btn" data-cat-menu="${cat.id}">⋮</button>
        <div class="three-dots-menu" id="cat-menu-${cat.id}">
          ${cat.is_active ? `
            <button class="menu-item" data-action="edit-category" data-cat-id="${cat.id}">Editar</button>
            <button class="menu-item" data-action="deactivate-category" data-cat-id="${cat.id}">Desactivar</button>
            <button class="menu-item menu-item-danger" data-action="delete-category" data-cat-id="${cat.id}">Eliminar</button>
          ` : `
            <button class="menu-item" data-action="reactivate-category" data-cat-id="${cat.id}">Reactivar</button>
            <button class="menu-item menu-item-danger" data-action="delete-category" data-cat-id="${cat.id}">Eliminar</button>
          `}
        </div>
      </div>
    </div>`;
}

function setupCategoriesHandlers() {
  // Toggle group expand/collapse
  document.querySelectorAll('[data-toggle-group]').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.three-dots-btn') || e.target.closest('.three-dots-menu')) return;
      const groupId = header.dataset.toggleGroup;
      const body = document.getElementById(`group-body-${groupId}`);
      const chevron = header.querySelector('.cat-chevron');
      body?.classList.toggle('hidden');
      chevron?.classList.toggle('rotated');
    });
  });

  // Group three-dots menu toggle
  document.querySelectorAll('[data-group-menu]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const gid = btn.dataset.groupMenu;
      const menu = document.getElementById(`group-menu-${gid}`);
      const isOpen = menu.style.display === 'block';
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
      if (!isOpen) menu.style.display = 'block';
    });
  });

  // Category three-dots menu toggle
  document.querySelectorAll('[data-cat-menu]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cid = btn.dataset.catMenu;
      const menu = document.getElementById(`cat-menu-${cid}`);
      const isOpen = menu.style.display === 'block';
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
      if (!isOpen) menu.style.display = 'block';
    });
  });

  // Action buttons
  document.querySelectorAll('#categories-content [data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.three-dots-menu').forEach(m => m.style.display = 'none');
      const action = e.currentTarget.dataset.action;
      const groupId = e.currentTarget.dataset.groupId;
      const catId = e.currentTarget.dataset.catId;

      if (action === 'edit-group') showGroupModal(groupId);
      else if (action === 'delete-group') await handleDeleteGroup(groupId);
      else if (action === 'deactivate-group') await handleDeactivateGroup(groupId);
      else if (action === 'reactivate-group') await handleReactivateGroup(groupId);
      else if (action === 'add-category') showCategoryModal(null, groupId);
      else if (action === 'edit-category') showCategoryModal(catId);
      else if (action === 'deactivate-category') await handleDeactivateCategory(catId);
      else if (action === 'delete-category') await handleDeleteCategory(catId);
      else if (action === 'reactivate-category') await handleReactivateCategory(catId);
    });
  });

  // Add group button
  document.getElementById('add-group-btn')?.addEventListener('click', () => showGroupModal(null));
}

async function refreshCategories() {
  const [groupsRes, catsRes] = await Promise.all([
    fetch(`${API_URL}/category-groups?include_inactive=true`, { credentials: 'include' }),
    fetch(`${API_URL}/categories?include_inactive=true`, { credentials: 'include' }),
  ]);
  if (groupsRes.ok) categoryGroups = await groupsRes.json();
  if (catsRes.ok) { const d = await catsRes.json(); categories = d.categories || []; }
  const el = document.getElementById('categories-content');
  if (el) { el.innerHTML = renderCategoriesSection(); setupCategoriesHandlers(); }
  setupScrollFadeIndicators();
}

// ── Group Modal ──

function showGroupModal(groupId) {
  const existing = groupId ? categoryGroups.find(g => g.id === groupId) : null;
  const title = existing ? 'Editar grupo' : 'Crear grupo';

  // Remove any previous group modal
  document.getElementById('group-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'group-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 420px;">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">${title}</h3>
      <form id="group-form" style="display: flex; flex-direction: column; gap: 16px;">
        <label class="field">
          <span>Nombre *</span>
          <input type="text" id="group-name" required maxlength="100" value="${existing?.name || ''}" placeholder="ej. Hogar, Transporte">
        </label>
        <div class="field">
          <span>Icono *</span>
          <div id="icon-grid" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
            ${['🏠','🚗','🏎️','👨','👩','👸','🤴','🏦','📈','🎉','💊','🛒','🎁','💡','🐾','👶','✈️','🍽️','📚','💳','⚕️','🏋️','🎮','💼','🔧','📱','🌐','💰','🏫','💸','📦'].map(e =>
              `<button type="button" class="icon-pick${(existing?.icon || '').startsWith(e) ? ' selected' : ''}" data-icon="${e}"
                 style="width:36px;height:36px;font-size:20px;border:2px solid ${(existing?.icon || '').startsWith(e) ? '#10b981' : '#e5e7eb'};border-radius:8px;background:${(existing?.icon || '').startsWith(e) ? '#ecfdf5' : '#fff'};cursor:pointer;display:flex;align-items:center;justify-content:center;">${e}</button>`
            ).join('')}
          </div>
          <input type="hidden" id="group-icon" value="${existing?.icon || ''}">
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
          <button type="button" class="btn-secondary" id="group-cancel">Cancelar</button>
          <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById('group-cancel').addEventListener('click', () => modal.remove());
  document.getElementById('group-name').focus();

  document.getElementById('icon-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-pick');
    if (!btn) return;
    document.querySelectorAll('#icon-grid .icon-pick').forEach(b => {
      b.style.borderColor = '#e5e7eb'; b.style.background = '#fff'; b.classList.remove('selected');
    });
    btn.style.borderColor = '#10b981'; btn.style.background = '#ecfdf5'; btn.classList.add('selected');
    document.getElementById('group-icon').value = btn.dataset.icon;
  });

  document.getElementById('group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('group-name').value.trim();
    const icon = document.getElementById('group-icon').value.trim();
    if (!name) return;
    if (!icon) { showError('Campo requerido', 'Selecciona un ícono para el grupo'); return; }

    try {
      const url = existing ? `${API_URL}/category-groups/${groupId}` : `${API_URL}/category-groups`;
      const method = existing ? 'PATCH' : 'POST';
      const body = existing ? {} : { name };
      if (existing) body.name = name;
      body.icon = icon;

      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg;
        try { msg = JSON.parse(text).error; } catch { msg = text; }
        throw new Error(msg || 'Error al guardar grupo');
      }
      modal.remove();
      await refreshCategories();
    } catch (err) {
      await showError('Error', err.message);
    }
  });
}

// ── Category Modal ──

function showCategoryModal(catId, preselectedGroupId) {
  const existing = catId ? categories.find(c => c.id === catId) : null;
  const title = existing ? 'Editar categoría' : 'Crear categoría';
  const activeGroups = categoryGroups.filter(g => g.is_active !== false).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const selectedGroupId = existing?.category_group_id || preselectedGroupId || '';

  // Remove any previous category modal
  document.getElementById('category-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'category-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 420px;">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">${title}</h3>
      <form id="category-form" style="display: flex; flex-direction: column; gap: 16px;">
        <label class="field">
          <span>Nombre *</span>
          <input type="text" id="cat-name" required maxlength="100" value="${existing?.name || ''}" placeholder="ej. Mercado, Servicios">
        </label>
        <label class="field">
          <span>Grupo *</span>
          <select id="cat-group" required>
            <option value="" disabled ${!selectedGroupId ? 'selected' : ''}>Selecciona un grupo</option>
            ${activeGroups.map(g => `<option value="${g.id}" ${g.id === selectedGroupId ? 'selected' : ''}>${g.icon || ''} ${g.name}</option>`).join('')}
          </select>
        </label>
        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
          <button type="button" class="btn-secondary" id="cat-cancel">Cancelar</button>
          <button type="submit" class="btn-primary">${existing ? 'Guardar' : 'Crear'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById('cat-cancel').addEventListener('click', () => modal.remove());
  document.getElementById('cat-name').focus();

  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value.trim();
    const groupIdVal = document.getElementById('cat-group').value || null;
    if (!name) return;

    try {
      const url = existing ? `${API_URL}/categories/${catId}` : `${API_URL}/categories`;
      const method = existing ? 'PATCH' : 'POST';
      const body = { name };
      if (groupIdVal) body.category_group_id = groupIdVal;

      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg; try { msg = JSON.parse(text).error; } catch { msg = text; }
        throw new Error(msg || 'Error al guardar categoría');
      }
      modal.remove();
      await refreshCategories();
    } catch (err) {
      await showError('Error', err.message);
    }
  });
}

// ── Delete/Deactivate Handlers ──

async function handleDeleteGroup(groupId) {
  const group = categoryGroups.find(g => g.id === groupId);
  if (!group) return;

  const confirmed = await showConfirmation(
    'Eliminar grupo',
    `¿Eliminar el grupo "${group.name}"?\n\nEsto eliminará el grupo permanentemente. Solo es posible si no tiene categorías.`,
    'Eliminar', 'eliminar'
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_URL}/category-groups/${groupId}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (res.status === 409) {
      await showError('No se puede eliminar', 'Este grupo tiene categorías. Mueve o elimina las categorías primero, o desactiva el grupo.');
    } else if (!res.ok) {
      const text = await res.text();
      let msg; try { msg = JSON.parse(text).error; } catch { msg = text; }
      throw new Error(msg || 'Error al eliminar grupo');
    }
    await refreshCategories();
  } catch (err) {
    await showError('Error', err.message);
  }
}

async function handleDeactivateGroup(groupId) {
  const group = categoryGroups.find(g => g.id === groupId);
  if (!group) return;

  const confirmed = await showConfirmation(
    'Desactivar grupo',
    `¿Desactivar el grupo "${group.name}"?\n\nEl grupo y sus categorías dejarán de aparecer en formularios y presupuestos, pero los movimientos existentes se conservarán.`,
    'Desactivar'
  );
  if (!confirmed) return;

  try {
    await fetch(`${API_URL}/category-groups/${groupId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    await refreshCategories();
  } catch (err) {
    await showError('Error', err.message);
  }
}

async function handleReactivateGroup(groupId) {
  try {
    await fetch(`${API_URL}/category-groups/${groupId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    });
    await refreshCategories();
  } catch (err) {
    await showError('Error', err.message);
  }
}

async function handleDeactivateCategory(catId) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return;

  const confirmed = await showConfirmation(
    'Desactivar categoría',
    `¿Desactivar la categoría "${cat.name}"?\n\nLa categoría dejará de aparecer en formularios y presupuestos, pero los movimientos existentes se conservarán.`,
    'Desactivar'
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_URL}/categories/${catId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg; try { msg = JSON.parse(text).error; } catch { msg = text; }
      throw new Error(msg || 'Error al desactivar categoría');
    }
    await refreshCategories();
  } catch (err) {
    await showError('Error', err.message);
  }
}

async function handleDeleteCategory(catId) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return;

  const confirmed = await showConfirmation(
    'Eliminar categoría',
    `¿Eliminar la categoría "${cat.name}"?\n\nEsta acción es permanente. Solo se puede eliminar si no tiene movimientos asociados.`,
    'Eliminar', 'eliminar'
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_URL}/categories/${catId}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (res.status === 409) {
      const deactivate = await showConfirmation(
        'No se puede eliminar',
        'Esta categoría tiene movimientos o gastos presupuestados asociados y no se puede eliminar.\n\nSi la desactivas, dejará de aparecer en formularios y presupuestos, pero los movimientos existentes se conservarán.',
        'Desactivar'
      );
      if (deactivate) {
        await fetch(`${API_URL}/categories/${catId}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        });
      }
    } else if (!res.ok) {
      const text = await res.text();
      let msg; try { msg = JSON.parse(text).error; } catch { msg = text; }
      throw new Error(msg || 'Error al eliminar categoría');
    }
    await refreshCategories();
  } catch (err) {
    await showError('Error', err.message);
  }
}

async function handleReactivateCategory(catId) {
  try {
    await fetch(`${API_URL}/categories/${catId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    });
    await refreshCategories();
  } catch (err) {
    await showError('Error', err.message);
  }
}

/**
 * Load and render pending link requests
 */
async function loadAndRenderLinkRequests() {
  const section = document.getElementById('link-requests-section');
  if (!section) return;

  try {
    const res = await fetch(`${API_URL}/link-requests`, { credentials: 'include' });
    if (!res.ok) return;

    const requests = await res.json();
    if (!requests || requests.length === 0) {
      section.innerHTML = '';
      return;
    }

    section.innerHTML = `
      <div class="household-section">
        <div class="section-header">
          <h3 class="section-title">Solicitudes de vinculación</h3>
        </div>
        <p class="section-description">Otros hogares quieren compartir gastos contigo.</p>
        <div class="link-requests-list">
          ${requests.map(req => `
            <div class="member-item link-request-card" data-action="view-link" data-contact-id="${req.contact_id}" data-requester-name="${req.requester_name}" data-household-name="${req.household_name}" style="cursor:pointer;position:relative;">
              <div class="member-avatar">${req.requester_name?.charAt(0).toUpperCase() || '?'}</div>
              <div class="member-info">
                <div class="member-name">${req.requester_name}</div>
                <div class="member-email">${req.household_name}</div>
              </div>
              <span class="link-request-chevron">›</span>
              <span class="link-request-dot"></span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    setupLinkRequestHandlers();
  } catch (e) {
    // Ignore errors silently
  }
}

function setupLinkRequestHandlers() {
  document.querySelectorAll('[data-action="view-link"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const contactId = btn.dataset.contactId;
      const requesterName = btn.dataset.requesterName;
      const householdName = btn.dataset.householdName;
      showLinkRequestModal(contactId, requesterName, householdName);
    });
  });
}

function showLinkRequestModal(contactId, requesterName, householdName) {
  const existingOptions = contacts.filter(c => !c.linked_user_id && c.is_active)
    .map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>Solicitud de vinculación</h3>
      </div>
      <div class="modal-body">
        <p><strong>${requesterName}</strong> del hogar <strong>${householdName}</strong> quiere compartir gastos contigo.</p>

        <p><strong>¿Qué significa aceptar?</strong></p>
        <ul>
          <li>Las personas de ese hogar podrán ver <em>solo</em> los gastos en los que ellos participen.</li>
          <li>No tendrán acceso a todos tus movimientos.</li>
          <li>Se creará un contacto vinculado en tu hogar.</li>
        </ul>

        <p><strong>¿Cómo quieres guardar este contacto?</strong></p>
        <div class="form-group">
          <label>Nombre del contacto</label>
          <input type="text" id="modal-accept-name" value="${requesterName}" />
        </div>
        <div class="form-group">
          <label>O vincular con contacto existente</label>
          <select id="modal-accept-existing">
            <option value="">Crear nuevo contacto</option>
            ${existingOptions}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="modal-reject-btn" style="color:#dc3545;">Rechazar</button>
        <button class="btn-secondary" id="modal-cancel-btn">Cancelar</button>
        <button class="btn-primary" id="modal-accept-btn">Aceptar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.getElementById('modal-cancel-btn').addEventListener('click', () => overlay.remove());

  // Accept
  document.getElementById('modal-accept-btn').addEventListener('click', async () => {
    const contactName = document.getElementById('modal-accept-name').value.trim();
    const existingContactId = document.getElementById('modal-accept-existing').value || null;

    if (!contactName && !existingContactId) {
      await showError('Error', 'Debes ingresar un nombre o seleccionar un contacto existente.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/link-requests/${contactId}/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_name: contactName,
          existing_contact_id: existingContactId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al aceptar la solicitud');
      }

      overlay.remove();
      await showSuccess('Solicitud aceptada', 'El contacto ha sido vinculado.');
      await loadHousehold();
    } catch (err) {
      await showError('Error', err.message);
    }
  });

  // Reject
  document.getElementById('modal-reject-btn').addEventListener('click', async () => {
    const confirmed = await showConfirmation(
      '¿Rechazar solicitud?',
      'Esta persona no podrá compartir gastos contigo.'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_URL}/link-requests/${contactId}/reject`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al rechazar la solicitud');
      }

      overlay.remove();
      await showSuccess('Solicitud rechazada', '');
      await loadHousehold();
    } catch (err) {
      await showError('Error', err.message);
    }
  });
}
