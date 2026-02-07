/**
 * Show a confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {string} confirmText - Text for confirm button
 * @param {boolean} requiresTyping - If true, user must type confirmation word
 * @returns {Promise<boolean>} - Resolves to true if confirmed
 */
export function showConfirmation(title, message, confirmText = 'Confirmar', requiresTyping = false) {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3>${title}</h3>
      </div>
      <div class="modal-body">
        <p>${message}</p>
        ${requiresTyping ? `
          <div class="field" style="margin-top: 16px;">
            <label>
              <span>Escribe "<strong>${requiresTyping}</strong>" para confirmar:</span>
              <input type="text" id="confirm-input" autocomplete="off" />
            </label>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button id="modal-cancel" class="btn-secondary">Cancelar</button>
        <button id="modal-confirm" class="btn-danger" ${requiresTyping ? 'disabled' : ''}>${confirmText}</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Focus input if required
    const input = modal.querySelector('#confirm-input');
    if (input) {
      input.focus();
      input.addEventListener('input', () => {
        const confirmBtn = modal.querySelector('#modal-confirm');
        confirmBtn.disabled = input.value !== requiresTyping;
      });
    }
    
    // Handle buttons
    modal.querySelector('#modal-cancel').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(false);
    });
    
    modal.querySelector('#modal-confirm').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(true);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(false);
      }
    });
    
    // Close on escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', escHandler);
        resolve(false);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * Show an input modal to capture a value
 * @param {string} title - Modal title
 * @param {string} label - Input label
 * @param {string} defaultValue - Default input value
 * @param {string} inputType - Input type (text, number, etc.)
 * @returns {Promise<string|null>} - The input value or null if cancelled
 */
export function showInputModal(title, label, defaultValue = '', inputType = 'text') {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3>${title}</h3>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>
            <span>${label}</span>
            <input type="${inputType}" id="modal-input" value="${defaultValue}" ${inputType === 'number' ? 'min="0" step="0.01"' : ''} autocomplete="off" />
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button id="modal-cancel" class="btn-secondary">Cancelar</button>
        <button id="modal-confirm" class="btn-primary">Confirmar</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Focus input
    const input = modal.querySelector('#modal-input');
    input.focus();
    input.select();
    
    // Handle confirm
    const confirmHandler = () => {
      const value = input.value.trim();
      document.body.removeChild(overlay);
      resolve(value || null);
    };
    
    // Handle cancel
    const cancelHandler = () => {
      document.body.removeChild(overlay);
      resolve(null);
    };
    
    // Handle buttons
    modal.querySelector('#modal-cancel').addEventListener('click', cancelHandler);
    modal.querySelector('#modal-confirm').addEventListener('click', confirmHandler);
    
    // Handle enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmHandler();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelHandler();
      }
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        cancelHandler();
      }
    });
  });
}

/**
 * Get simplified category name by removing group prefix
 * @param {string} category - Full category name (e.g., "Casa - Gastos fijos")
 * @param {string} groupName - Group name (e.g., "Casa")
 * @returns {string} - Simplified name (e.g., "Gastos fijos")
 */
export function getSimplifiedCategoryName(category, groupName) {
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
 * Show a success modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @returns {Promise<void>}
 */
export function showSuccess(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3>${title}</h3>
      </div>
      <div class="modal-body">
        <p>${message}</p>
      </div>
      <div class="modal-footer">
        <button id="modal-ok" class="btn-primary">OK</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Handle OK button
    modal.querySelector('#modal-ok').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve();
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve();
      }
    });
    
    // Close on escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', escHandler);
        resolve();
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * Show an error modal
 * @param {string} titleOrMessage - Modal title, or message if only one param is passed
 * @param {string} [message] - Error message (optional if first param is the message)
 * @returns {Promise<void>}
 */
export function showError(titleOrMessage, message) {
  // If only one parameter is passed, use it as message with default title
  const title = message ? titleOrMessage : 'Error';
  const errorMessage = message || titleOrMessage;
  
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3>⚠ ${title}</h3>
      </div>
      <div class="modal-body">
        <p style="color: #dc2626;">${errorMessage}</p>
      </div>
      <div class="modal-footer">
        <button id="modal-ok" class="btn-secondary">OK</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Handle OK button
    modal.querySelector('#modal-ok').addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve();
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve();
      }
    });
    
    // Close on escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', escHandler);
        resolve();
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * Show a modal to create a household
 * @param {string} apiUrl - The API URL base
 * @returns {Promise<Object|null>} - The created household or null if cancelled
 */
export function showCreateHouseholdModal(apiUrl) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'create-household-modal';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '400px';
    
    modal.innerHTML = `
      <div class="modal-header">
        <h3>🏠 Crear hogar</h3>
      </div>
      <div class="modal-body">
        <div class="field">
          <label for="household-name-input">
            <span>Nombre del hogar</span>
            <input 
              type="text" 
              id="household-name-input" 
              placeholder="Ej: Casa de Jose y Caro"
              maxlength="100"
              autofocus
            />
            <small style="color: #6b7280; font-size: 12px; margin-top: 4px; display: block;">
              El nombre que identificará a tu hogar
            </small>
          </label>
        </div>
        <div id="household-error" class="error" style="display: none; margin-top: 8px;"></div>
      </div>
      <div class="modal-footer">
        <button id="household-cancel-btn" class="btn-secondary">Cancelar</button>
        <button id="household-create-btn" class="btn-primary">Crear hogar</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = modal.querySelector('#household-name-input');
    const createBtn = modal.querySelector('#household-create-btn');
    const cancelBtn = modal.querySelector('#household-cancel-btn');
    const errorEl = modal.querySelector('#household-error');
    
    input.focus();
    
    const closeModal = () => {
      document.body.removeChild(overlay);
    };
    
    const showModalError = (message) => {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    };
    
    const handleCreate = async () => {
      const name = input.value.trim();
      
      if (!name) {
        showModalError('Por favor ingresa un nombre para el hogar');
        input.focus();
        return;
      }
      
      if (name.length > 100) {
        showModalError('El nombre es demasiado largo (máximo 100 caracteres)');
        return;
      }
      
      // Disable button and show loading
      createBtn.disabled = true;
      createBtn.textContent = 'Creando...';
      errorEl.style.display = 'none';
      
      try {
        const response = await fetch(`${apiUrl}/households`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
          closeModal();
          resolve(data);
        } else {
          showModalError(data.error || 'Error al crear el hogar');
          createBtn.disabled = false;
          createBtn.textContent = 'Crear hogar';
        }
      } catch (error) {
        console.error('Error creating household:', error);
        showModalError('Error de conexión. Por favor, intenta de nuevo.');
        createBtn.disabled = false;
        createBtn.textContent = 'Crear hogar';
      }
    };
    
    // Event listeners
    createBtn.addEventListener('click', handleCreate);
    
    cancelBtn.addEventListener('click', () => {
      closeModal();
      resolve(null);
    });
    
    // Submit on Enter
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCreate();
      }
    });
    
    // Clear error on input
    input.addEventListener('input', () => {
      errorEl.style.display = 'none';
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
        resolve(null);
      }
    });
    
    // Close on escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escHandler);
        resolve(null);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * Determine if category is required based on movement type and participants
 * 
 * Category is required when:
 * - HOUSEHOLD: always (real household expense)
 * - SPLIT: only when at least one participant is a household member
 *   (if all participants are contacts, it's a loan to external parties - no category needed)
 * - DEBT_PAYMENT/LOAN: never (just money movement back and forth)
 * 
 * @param {Object} params - Parameters object
 * @param {string} params.effectiveTipo - The effective movement type (HOUSEHOLD, SPLIT, DEBT_PAYMENT)
 * @param {string} params.tipo - The UI type selected (could be LOAN which converts to SPLIT or DEBT_PAYMENT)
 * @param {Array} params.participants - List of participants (either {name} or {user_id} format)
 * @param {Object|Array} params.usersData - Either usersMap object or users array for lookup
 * @returns {boolean} - Whether category is required
 */
export function isCategoryRequired({ effectiveTipo, tipo, participants, usersData }) {
  // LOAN type never requires category (it's just money movement)
  if (tipo === 'LOAN') return false;
  
  // DEBT_PAYMENT never requires category (just money movement back and forth)
  if (effectiveTipo === 'DEBT_PAYMENT') return false;
  
  // HOUSEHOLD always requires category (it's a real household expense)
  if (effectiveTipo === 'HOUSEHOLD') return true;
  
  // SPLIT: check if any participant is a household member
  if (effectiveTipo === 'SPLIT') {
    // If no participants yet, don't require category (they might be adding contacts)
    if (!participants || participants.length === 0) return false;
    
    // Check if any participant is a household member
    const hasHouseholdParticipant = participants.some(p => {
      // Support both formats: {name} from registrar-movimiento or {user_id} from template modal
      let user = null;
      
      if (p.name && typeof usersData === 'object' && !Array.isArray(usersData)) {
        // usersMap format: usersData[name] = {type: 'member'|'contact', ...}
        user = usersData[p.name];
      } else if (p.user_id && Array.isArray(usersData)) {
        // users array format: [{id, type: 'member'|'contact', ...}, ...]
        user = usersData.find(u => u.id === p.user_id);
      }
      
      return user && user.type === 'member';
    });
    
    return hasHouseholdParticipant;
  }
  
  return false;
}
