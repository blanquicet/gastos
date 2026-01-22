/**
 * Movement Form Component
 * 
 * Shared form logic for movement registration and template creation.
 * This module provides reusable functions for:
 * - Dynamic field visibility based on movement type
 * - Participant management for SPLIT movements
 * - Payment method filtering
 * - Form state management
 */

/**
 * Movement form state manager
 */
export class MovementFormState {
  constructor(options = {}) {
    this.formId = options.formId || 'movement-form';
    this.users = options.users || [];
    this.paymentMethods = options.paymentMethods || [];
    this.categoryGroups = options.categoryGroups || [];
    this.currentUser = options.currentUser || null;
    
    // Participant management
    this.participants = [];
    
    // Internal maps for quick lookup
    this.usersMap = {};
    this.paymentMethodsMap = {};
    
    this._buildMaps();
  }
  
  _buildMaps() {
    // Build user map
    this.users.forEach(u => {
      this.usersMap[u.name] = u;
      this.usersMap[u.id] = u;
    });
    
    // Build payment method map
    this.paymentMethods.forEach(pm => {
      this.paymentMethodsMap[pm.name] = pm;
      this.paymentMethodsMap[pm.id] = pm;
    });
  }
  
  /**
   * Get payment methods available for a specific payer
   */
  getPaymentMethodsForPayer(payerIdOrName) {
    const payer = this.usersMap[payerIdOrName];
    if (!payer) return [];
    
    return this.paymentMethods.filter(pm => {
      // Include if: (1) owned by payer, OR (2) shared with household
      return pm.owner_id === payer.id || pm.is_shared;
    });
  }
  
  /**
   * Check if user is a household member (not contact)
   */
  isHouseholdMember(userIdOrName) {
    const user = this.usersMap[userIdOrName];
    return user && user.type === 'member';
  }
  
  /**
   * Add participant to the list
   */
  addParticipant(userId, percentage = 0) {
    const user = this.usersMap[userId];
    if (!user) return;
    
    // Avoid duplicates
    if (this.participants.find(p => p.user_id === userId)) return;
    
    this.participants.push({
      user_id: userId,
      name: user.name,
      percentage: percentage
    });
  }
  
  /**
   * Remove participant from list
   */
  removeParticipant(userId) {
    this.participants = this.participants.filter(p => p.user_id !== userId);
  }
  
  /**
   * Update participant percentage
   */
  updateParticipantPercentage(userId, percentage) {
    const participant = this.participants.find(p => p.user_id === userId);
    if (participant) {
      participant.percentage = parseFloat(percentage) || 0;
    }
  }
  
  /**
   * Get total percentage
   */
  getTotalPercentage() {
    return this.participants.reduce((sum, p) => sum + (p.percentage || 0), 0);
  }
  
  /**
   * Validate participants
   */
  validateParticipants() {
    if (this.participants.length === 0) {
      return { valid: false, error: 'Debes agregar al menos un participante' };
    }
    
    const total = this.getTotalPercentage();
    if (Math.abs(total - 100) > 0.01) {
      return { 
        valid: false, 
        error: `La suma de porcentajes debe ser 100%. Actualmente: ${total.toFixed(2)}%` 
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Clear all participants
   */
  clearParticipants() {
    this.participants = [];
  }
  
  /**
   * Compute equitable percentages
   * Properly handles rounding to ensure sum is exactly 100%
   */
  computeEquitable() {
    if (this.participants.length === 0) return;
    
    const n = this.participants.length;
    // Calculate base percentage (rounded down to 2 decimals)
    const base = Math.floor(10000 / n) / 100;
    let total = 0;
    
    // Assign base percentage to all participants
    for (let i = 0; i < this.participants.length; i++) {
      this.participants[i].percentage = base;
      total += base;
    }
    
    // Calculate remainder and add to last participant
    const remainder = Math.round((100 - total) * 100) / 100;
    if (remainder !== 0) {
      this.participants[this.participants.length - 1].percentage = 
        Math.round((base + remainder) * 100) / 100;
    }
  }
}

/**
 * Form field controller
 * Manages visibility and state of form fields based on movement type
 */
export class FormFieldController {
  constructor(formState, elements) {
    this.state = formState;
    this.el = elements; // Object with DOM element references
  }
  
  /**
   * Update form fields based on movement type
   */
  updateFieldsForType(type, loanDirection = 'LEND') {
    const isHousehold = type === 'HOUSEHOLD';
    const isLoan = type === 'LOAN';
    const isSplit = type === 'SPLIT';
    const isDebtPayment = type === 'DEBT_PAYMENT';
    const isIncome = type === 'INGRESO';
    
    const isPagoDeuda = isDebtPayment || isLoan;
    
    // Loan direction selector
    this.toggleField('loanDirectionWrap', isLoan);
    
    // Payer/Receiver row (for DEBT_PAYMENT and LOAN)
    this.toggleField('pagadorTomadorRow', isPagoDeuda);
    
    // Payer for SPLIT
    this.toggleField('pagadorWrap', isSplit);
    
    // Participants for SPLIT
    this.toggleField('participantesWrap', isSplit);
    
    // Income fields
    this.toggleField('ingresoMiembroWrap', isIncome);
    this.toggleField('ingresoTipoWrap', isIncome);
    this.toggleField('ingresoCuentaWrap', isIncome);
    
    // Category field
    // Hidden when: no type, INGRESO, or DEBT_PAYMENT (until payer selected)
    const shouldHideCategoria = !type || isIncome || isPagoDeuda;
    this.toggleField('categoriaWrap', !shouldHideCategoria);
    
    // Payment method
    // Hidden for INGRESO
    if (isIncome) {
      this.toggleField('metodoWrap', false);
      if (this.el.metodo) {
        this.el.metodo.required = false;
        this.el.metodo.value = '';
      }
    } else {
      this.toggleField('metodoWrap', true);
      if (this.el.metodo) {
        this.el.metodo.required = true;
      }
    }
    
    // Update labels for LOAN
    if (isLoan) {
      this.updateLoanLabels(loanDirection);
    } else if (isDebtPayment) {
      this.resetDebtPaymentLabels();
    }
    
    // For HOUSEHOLD: show payment methods for current user
    if (isHousehold && this.state.currentUser) {
      this.updatePaymentMethodsForPayer(this.state.currentUser.id);
    }
  }
  
  /**
   * Toggle field visibility
   */
  toggleField(fieldId, show) {
    const field = document.getElementById(fieldId);
    if (field) {
      field.classList.toggle('hidden', !show);
    }
  }
  
  /**
   * Update loan labels based on direction
   */
  updateLoanLabels(direction) {
    const pagadorLabel = document.getElementById('pagadorLabel');
    const tomadorLabel = document.querySelector('#pagadorTomadorRow label:nth-child(2) span');
    
    if (direction === 'LEND') {
      if (pagadorLabel) pagadorLabel.textContent = '¿Quién prestó?';
      if (tomadorLabel) tomadorLabel.textContent = '¿Quién recibió?';
    } else {
      if (pagadorLabel) pagadorLabel.textContent = '¿Quién pagó?';
      if (tomadorLabel) tomadorLabel.textContent = '¿Quién recibió?';
    }
  }
  
  /**
   * Reset debt payment labels to defaults
   */
  resetDebtPaymentLabels() {
    const pagadorLabel = document.getElementById('pagadorLabel');
    const tomadorLabel = document.querySelector('#pagadorTomadorRow label:nth-child(2) span');
    if (pagadorLabel) pagadorLabel.textContent = '¿Quién pagó?';
    if (tomadorLabel) tomadorLabel.textContent = '¿Quién recibió?';
  }
  
  /**
   * Update payment methods dropdown for specific payer
   */
  updatePaymentMethodsForPayer(payerIdOrName) {
    if (!this.el.metodo) return;
    
    const methods = this.state.getPaymentMethodsForPayer(payerIdOrName);
    const currentValue = this.el.metodo.value;
    
    // Rebuild dropdown
    this.el.metodo.innerHTML = '<option value="">Selecciona...</option>';
    methods.forEach(pm => {
      const option = document.createElement('option');
      option.value = pm.id;
      option.textContent = pm.name;
      this.el.metodo.appendChild(option);
    });
    
    // Restore previous value if still valid
    if (currentValue && methods.find(pm => pm.id === currentValue)) {
      this.el.metodo.value = currentValue;
    }
  }
}

/**
 * Participant renderer
 * Renders participant UI for SPLIT movements
 */
export class ParticipantRenderer {
  constructor(formState, containerId) {
    this.state = formState;
    this.containerId = containerId;
  }
  
  /**
   * Render participants list
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    
    if (this.state.participants.length === 0) {
      container.innerHTML = '<p style="color: #6b7280; font-size: 14px; text-align: center; padding: 16px;">No hay participantes agregados</p>';
      return;
    }
    
    const html = this.state.participants.map((p, index) => `
      <div class="participant-row" data-user-id="${p.user_id}" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 8px;">
        <span style="flex: 1; font-weight: 500;">${p.name}</span>
        <input 
          type="number" 
          class="participant-percentage" 
          data-user-id="${p.user_id}"
          value="${p.percentage || 0}" 
          placeholder="%" 
          min="0" 
          max="100" 
          step="0.01"
          style="width: 80px; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; text-align: right;"
        />
        <button 
          type="button" 
          class="participant-remove-btn" 
          data-user-id="${p.user_id}"
          style="padding: 6px 12px; background: #fee2e2; color: #991b1b; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;"
        >
          Quitar
        </button>
      </div>
    `).join('');
    
    container.innerHTML = html;
    
    // Attach event listeners
    this.attachListeners(container);
  }
  
  /**
   * Attach event listeners to participant controls
   */
  attachListeners(container) {
    // Percentage inputs
    container.querySelectorAll('.participant-percentage').forEach(input => {
      input.addEventListener('input', (e) => {
        const userId = e.target.dataset.userId;
        const value = parseFloat(e.target.value) || 0;
        this.state.updateParticipantPercentage(userId, value);
        this.updateTotalDisplay();
      });
    });
    
    // Remove buttons
    container.querySelectorAll('.participant-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.target.dataset.userId;
        this.state.removeParticipant(userId);
        this.render();
        this.updateTotalDisplay();
      });
    });
  }
  
  /**
   * Update total percentage display
   */
  updateTotalDisplay() {
    const totalEl = document.getElementById('participants-total');
    if (totalEl) {
      const total = this.state.getTotalPercentage();
      const isValid = Math.abs(total - 100) < 0.01;
      totalEl.textContent = `Total: ${total.toFixed(2)}%`;
      totalEl.style.color = isValid ? '#059669' : '#dc2626';
    }
  }
}

/**
 * Create participant selector modal
 */
export function showParticipantSelector(formState, onAdd) {
  const availableUsers = formState.users.filter(u => {
    // Don't show users already in participants
    return !formState.participants.find(p => p.user_id === u.id);
  });
  
  if (availableUsers.length === 0) {
    alert('Todos los usuarios ya están agregados como participantes');
    return;
  }
  
  const modalHtml = `
    <div class="modal-overlay" id="participant-selector-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;">
      <div class="modal-content" style="background: white; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%;">
        <h3 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Agregar Participante</h3>
        <select id="participant-user-select" style="width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; font-size: 14px;">
          <option value="">Selecciona...</option>
          ${availableUsers.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
        </select>
        <div style="display: flex; gap: 12px;">
          <button id="participant-cancel-btn" type="button" style="flex: 1; padding: 10px; background: #f3f4f6; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">Cancelar</button>
          <button id="participant-add-btn" type="button" style="flex: 1; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500;">Agregar</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const overlay = document.getElementById('participant-selector-overlay');
  const userSelect = document.getElementById('participant-user-select');
  const cancelBtn = document.getElementById('participant-cancel-btn');
  const addBtn = document.getElementById('participant-add-btn');
  
  const closeModal = () => overlay.remove();
  
  cancelBtn.addEventListener('click', closeModal);
  
  addBtn.addEventListener('click', () => {
    const userId = userSelect.value;
    if (!userId) {
      alert('Selecciona un usuario');
      return;
    }
    
    formState.addParticipant(userId, 0);
    if (onAdd) onAdd();
    closeModal();
  });
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}
