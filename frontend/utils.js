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
