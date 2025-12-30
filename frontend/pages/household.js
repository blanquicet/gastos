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
      // No household - redirect to create
      router.navigate('/hogar/crear');
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

    // Render content
    contentEl.innerHTML = renderHouseholdContent();
    setupEventHandlers();

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
          ${canLeave ? '<button id="leave-household-btn" class="btn-secondary btn-small">Salir del hogar</button>' : ''}
          ${isOwner ? '<button id="delete-household-btn" class="btn-danger btn-small">Eliminar hogar</button>' : ''}
        </div>
      </div>
    </div>

    <div class="household-section">
      <div class="section-header">
        <h3 class="section-title">Miembros (${members.length})</h3>
        ${isOwner ? '<button id="invite-member-btn" class="btn-secondary btn-small">+ Invitar miembro</button>' : ''}
      </div>
      <p class="section-description">Personas que viven en este hogar con acceso a todos los movimientos.</p>
      <div id="invite-form-container" style="display: none;">
        ${renderInviteForm()}
      </div>
      ${renderMembersList(isOwner)}
    </div>

    <div class="household-section">
      <div class="section-header">
        <h3 class="section-title">Contactos (${contacts.length})</h3>
        <button id="add-contact-btn" class="btn-secondary btn-small">+ Agregar contacto</button>
      </div>
      <p class="section-description">Personas con las que tienes transacciones ocasionales (amigos, familia externa, etc.). Solo ven movimientos donde participan.</p>
      <div id="contact-form-container" style="display: none;">
        ${renderContactForm()}
      </div>
      ${renderContactsList()}
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
            ${member.role === 'owner' ? '👑 Dueño' : 'Miembro'}
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
  
  if (!isOwner && !isSelf) return '';
  
  let actions = '';
  
  if (isSelf && !isLastOwner) {
    actions += `<button class="btn-link text-sm" data-action="leave" data-user-id="${member.user_id}">Salir del hogar</button>`;
  }
  
  if (isOwner && !isSelf) {
    if (member.role === 'member') {
      actions += `<button class="btn-link text-sm" data-action="promote" data-user-id="${member.user_id}">Promover a dueño</button>`;
    } else if (!isLastOwner) {
      actions += `<button class="btn-link text-sm" data-action="demote" data-user-id="${member.user_id}">Quitar como dueño</button>`;
    }
    actions += `<button class="btn-link text-sm text-danger" data-action="remove" data-user-id="${member.user_id}">Remover</button>`;
  }
  
  return actions ? `<div class="member-actions">${actions}</div>` : '';
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

  return `
    <div class="contacts-list">
      ${contacts.map(contact => `
        <div class="contact-item">
          <div class="contact-avatar">${contact.name.charAt(0).toUpperCase()}</div>
          <div class="contact-info">
            <div class="contact-name">
              ${contact.name}
              ${contact.is_registered ? '<span class="linked-badge">🔗 Registrado</span>' : ''}
            </div>
            <div class="contact-details">
              ${contact.email ? contact.email : ''}
              ${contact.phone ? (contact.email ? ' · ' : '') + contact.phone : ''}
            </div>
          </div>
          <div class="contact-actions">
            ${isOwner && contact.is_registered ? `<button class="btn-link text-sm" data-action="promote-contact" data-contact-id="${contact.id}">Promover a miembro</button>` : ''}
            <button class="btn-link text-sm" data-action="edit-contact" data-contact-id="${contact.id}">Editar</button>
            <button class="btn-link text-sm text-danger" data-action="delete-contact" data-contact-id="${contact.id}">Eliminar</button>
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
 * Setup event handlers
 */
function setupEventHandlers() {
  // Leave household button
  const leaveBtn = document.getElementById('leave-household-btn');
  leaveBtn?.addEventListener('click', handleLeaveHousehold);

  // Delete household button
  const deleteBtn = document.getElementById('delete-household-btn');
  deleteBtn?.addEventListener('click', handleDeleteHousehold);

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

  // Member actions
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      const userId = e.target.dataset.userId;
      const contactId = e.target.dataset.contactId;

      if (action === 'remove') await handleRemoveMember(userId);
      else if (action === 'leave') await handleLeaveMember();
      else if (action === 'promote') await handlePromoteMember(userId);
      else if (action === 'demote') await handleDemoteMember(userId);
      else if (action === 'promote-contact') await handlePromoteContact(contactId);
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
 * Setup contact form handlers
 */
function setupContactFormHandlers() {
  const contactForm = document.getElementById('contact-form');
  contactForm?.addEventListener('submit', handleContactSubmit);
  
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

    const data = await response.json();
    
    // Check if user was auto-added (has member ID but no token)
    if (data.id && !data.token) {
      await showSuccess('Miembro agregado', `El usuario ${email} ha sido agregado al hogar automáticamente.`);
      // Reload to show new member
      await loadHousehold();
    } else {
      await showSuccess('Invitación creada', `Se ha creado una invitación para ${email}. Será notificado cuando implementemos el sistema de emails.`);
    }
    
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
  if (!await showConfirmation('Promover a dueño', '¿Promover este miembro a dueño del hogar?', 'Promover')) return;

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
  if (!await showConfirmation('Cambiar rol', '¿Quitar permisos de dueño a este miembro?', 'Cambiar')) return;

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
 * Handle promote contact to member
 */
async function handlePromoteContact(contactId) {
  if (!await showConfirmation('Promover contacto', '¿Promover este contacto a miembro del hogar?', 'Promover')) return;

  try {
    const response = await fetch(`${API_URL}/households/${household.id}/contacts/${contactId}/promote`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error al promover contacto');
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

  // Setup validation handlers
  setupContactFormHandlers();

  const form = document.getElementById('contact-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleUpdateContact(contactId);
  });

  document.getElementById('cancel-contact-btn').addEventListener('click', () => {
    container.style.display = 'none';
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
