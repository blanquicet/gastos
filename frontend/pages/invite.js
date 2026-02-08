/**
 * Invitation Acceptance Page
 * 
 * Handles accepting household invitations via token from email link.
 * Shows a confirmation modal with household info before accepting.
 * The user must be logged in with the email that matches the invitation.
 */

import router from '../router.js';
import { API_URL } from '../config.js';

/**
 * Render the invitation page
 */
export function render() {
  return `
    <div class="auth-wrapper">
      <div class="auth-box">
        <div class="auth-header">
          <h1>🏠 Invitación a Hogar</h1>
        </div>
        
        <div id="invite-loading" class="invite-status">
          <p style="text-align: center; margin-bottom: 20px;">Cargando invitación...</p>
          <div class="loading-spinner-small" style="margin: 0 auto;"></div>
        </div>
        
        <div id="invite-confirm" style="display: none; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🏠</div>
          <p style="margin-bottom: 8px; font-size: 16px; color: #666;">
            <span id="inviter-name"></span> te invitó a unirte al hogar:
          </p>
          <p id="household-name" style="font-size: 24px; font-weight: 600; margin-bottom: 24px; color: #333;"></p>
          <p style="margin-bottom: 24px; font-size: 14px; color: #666;">
            ¿Deseas unirte a este hogar?
          </p>
          <div style="display: flex; gap: 12px;">
            <button id="decline-btn" class="btn btn-secondary" style="flex: 1;">Cancelar</button>
            <button id="accept-btn" class="btn btn-primary" style="flex: 1;">Unirme</button>
          </div>
        </div>
        
        <div id="invite-result" class="invite-result" style="display: none; text-align: center;">
          <div id="result-icon" style="font-size: 48px; margin-bottom: 16px;"></div>
          <p id="result-message" style="margin-bottom: 24px; font-size: 16px;"></p>
          <button id="continue-btn" class="btn btn-primary" style="width: 100%;">Ir al Inicio</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize the invitation page
 * @param {boolean} isAuthenticated - Whether the user is logged in
 */
export async function setup(isAuthenticated = false) {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (!token) {
    showError('Token de invitación no proporcionado');
    return;
  }
  
  // First, get invitation info (public endpoint, no auth required)
  try {
    const infoResponse = await fetch(`${API_URL}/invitations/${token}`);
    
    if (!infoResponse.ok) {
      const error = await infoResponse.json();
      if (infoResponse.status === 404) {
        showError('Invitación no encontrada');
      } else {
        showError(error.error || 'Error al cargar la invitación');
      }
      return;
    }
    
    const invitation = await infoResponse.json();
    
    // Check if already accepted
    if (invitation.is_accepted) {
      showError('Esta invitación ya fue aceptada');
      return;
    }
    
    // Check if expired
    if (invitation.is_expired) {
      showError('Esta invitación ha expirado');
      return;
    }
    
    // Show confirmation modal
    showConfirmation(invitation, token, isAuthenticated);
    
  } catch (error) {
    console.error('Error loading invitation:', error);
    showError('Error de conexión. Intenta de nuevo.');
  }
}

function showConfirmation(invitation, token, isAuthenticated) {
  document.getElementById('invite-loading').style.display = 'none';
  document.getElementById('invite-confirm').style.display = 'block';
  
  document.getElementById('inviter-name').textContent = invitation.inviter_name;
  document.getElementById('household-name').textContent = invitation.household_name;
  
  // Handle accept button
  document.getElementById('accept-btn').onclick = async () => {
    // If not authenticated, save URL and redirect to login
    if (!isAuthenticated) {
      sessionStorage.setItem('redirectAfterLogin', window.location.href);
      router.navigate('/login');
      return;
    }
    
    const acceptBtn = document.getElementById('accept-btn');
    const declineBtn = document.getElementById('decline-btn');
    
    acceptBtn.disabled = true;
    declineBtn.disabled = true;
    acceptBtn.textContent = 'Procesando...';
    
    try {
      const response = await fetch(`${API_URL}/invitations/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });
      
      if (response.ok) {
        showSuccess(`¡Te uniste a "${invitation.household_name}" exitosamente!`);
      } else {
        const error = await response.json();
        showError(error.error || 'Error al aceptar la invitación');
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      showError('Error de conexión. Intenta de nuevo.');
    }
  };
  
  // Handle decline button
  document.getElementById('decline-btn').onclick = () => {
    router.navigate('/');
  };
}

function showSuccess(message) {
  document.getElementById('invite-loading').style.display = 'none';
  document.getElementById('invite-confirm').style.display = 'none';
  const resultEl = document.getElementById('invite-result');
  resultEl.style.display = 'block';
  
  document.getElementById('result-icon').innerHTML = '✅';
  document.getElementById('result-message').textContent = message;
  
  const btn = document.getElementById('continue-btn');
  btn.onclick = () => router.navigate('/');
}

function showError(message) {
  document.getElementById('invite-loading').style.display = 'none';
  document.getElementById('invite-confirm').style.display = 'none';
  const resultEl = document.getElementById('invite-result');
  resultEl.style.display = 'block';
  
  document.getElementById('result-icon').innerHTML = '❌';
  document.getElementById('result-message').textContent = message;
  
  const btn = document.getElementById('continue-btn');
  btn.textContent = 'Volver al Inicio';
  btn.onclick = () => router.navigate('/');
}
