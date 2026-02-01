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
        <h3>✓ ${title}</h3>
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
