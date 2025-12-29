/**
 * Reset Password Page
 * 
 * Allows users to reset their password using a token from email.
 */

import { checkPasswordStrength } from '../auth-utils.js';
import router from '../router.js';

const API_URL = 'https://api.gastos.blanquicet.com.co';

/**
 * Render reset password page HTML
 */
export function render() {
  return `
    <div class="auth-wrapper">
      <div class="auth-box">
        <form id="resetPasswordForm">
          <h2>Restablecer Contraseña</h2>
          
          <p class="form-description">
            Ingresa tu nueva contraseña.
          </p>

          <div class="form-group password-field">
            <label for="newPassword">Nueva Contraseña</label>
            <div class="password-wrapper">
              <input
                type="password"
                id="newPassword"
                autocomplete="new-password"
                required
                minlength="8"
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                class="toggle-password"
                data-target="newPassword"
                aria-label="Mostrar contraseña"
              >
                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <div id="newPasswordStrength" class="password-strength hidden">
              <div class="strength-bar">
                <div class="strength-fill"></div>
              </div>
              <span class="strength-text"></span>
            </div>
          </div>

          <div class="form-group password-field">
            <label for="confirmPassword">Confirmar Contraseña</label>
            <div class="password-wrapper">
              <input
                type="password"
                id="confirmPassword"
                autocomplete="new-password"
                required
                minlength="8"
                placeholder="Repite tu contraseña"
              />
              <button
                type="button"
                class="toggle-password"
                data-target="confirmPassword"
                aria-label="Mostrar contraseña"
              >
                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <span id="confirmPasswordError" class="field-error hidden"></span>
          </div>

          <div id="resetError" class="error hidden"></div>
          <div id="resetSuccess" class="success hidden"></div>

          <button type="submit" id="resetBtn" class="btn btn-primary">
            Restablecer Contraseña
          </button>

          <p class="auth-switch">
            <a href="/" id="backToLogin">Volver al inicio de sesión</a>
          </p>
        </form>
      </div>
    </div>
  `;
}

/**
 * Initialize reset password page interactions
 */
export function init() {
  const form = document.getElementById('resetPasswordForm');
  const newPasswordInput = document.getElementById('newPassword');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const confirmPasswordError = document.getElementById('confirmPasswordError');
  const errorDiv = document.getElementById('resetError');
  const successDiv = document.getElementById('resetSuccess');
  const submitBtn = document.getElementById('resetBtn');
  const backToLoginLink = document.getElementById('backToLogin');

  // Get token from URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  // Check if token exists
  if (!token) {
    errorDiv.innerHTML = `
      <strong>Token inválido o faltante</strong><br>
      El enlace de restablecimiento no es válido. Por favor solicita uno nuevo.
    `;
    errorDiv.classList.remove('hidden');
    form.querySelector('.form-description').remove();
    form.querySelectorAll('.form-group').forEach(group => group.remove());
    submitBtn.remove();
    return;
  }

  // Password strength indicator
  const strengthIndicator = document.getElementById('newPasswordStrength');
  newPasswordInput.addEventListener('input', () => {
    const password = newPasswordInput.value;
    if (password.length === 0) {
      strengthIndicator.classList.add('hidden');
      return;
    }

    const strength = checkPasswordStrength(password);
    strengthIndicator.classList.remove('hidden');

    const strengthFill = strengthIndicator.querySelector('.strength-fill');
    const strengthText = strengthIndicator.querySelector('.strength-text');

    // Update strength bar
    strengthFill.className = 'strength-fill strength-' + strength.level;
    strengthFill.style.width = strength.percentage + '%';
    strengthText.textContent = strength.label;
  });

  // Password confirmation validation
  confirmPasswordInput.addEventListener('input', () => {
    const password = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (confirmPassword.length === 0) {
      confirmPasswordError.classList.add('hidden');
      confirmPasswordInput.classList.remove('invalid', 'valid');
      return;
    }

    if (password !== confirmPassword) {
      confirmPasswordError.textContent = 'Las contraseñas no coinciden';
      confirmPasswordError.classList.remove('hidden');
      confirmPasswordInput.classList.add('invalid');
      confirmPasswordInput.classList.remove('valid');
    } else {
      confirmPasswordError.classList.add('hidden');
      confirmPasswordInput.classList.remove('invalid');
      confirmPasswordInput.classList.add('valid');
    }
  });

  // Password visibility toggles
  document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.target;
      const input = document.getElementById(targetId);
      
      if (input.type === 'password') {
        input.type = 'text';
        button.classList.add('active');
      } else {
        input.type = 'password';
        button.classList.remove('active');
      }
    });
  });

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous messages
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      confirmPasswordError.textContent = 'Las contraseñas no coinciden';
      confirmPasswordError.classList.remove('hidden');
      confirmPasswordInput.focus();
      return;
    }

    // Validate password strength
    const strength = checkPasswordStrength(newPassword);
    if (strength.level === 'weak') {
      errorDiv.textContent = 'La contraseña es demasiado débil. Usa al menos 8 caracteres con mayúsculas, minúsculas y números.';
      errorDiv.classList.remove('hidden');
      newPasswordInput.focus();
      return;
    }

    // Disable button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Restableciendo...';

    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          new_password: newPassword,
          new_password_confirm: confirmPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Show success message
        successDiv.innerHTML = `
          <strong>¡Contraseña restablecida!</strong><br>
          Tu contraseña ha sido actualizada exitosamente.
          <br><br>
          Redirigiendo al inicio de sesión...
        `;
        successDiv.classList.remove('hidden');
        
        // Clear form
        form.reset();

        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.navigate('/');
        }, 3000);
      } else {
        errorDiv.textContent = data.error || 'Error al restablecer la contraseña';
        errorDiv.classList.remove('hidden');
        
        // If token is invalid/expired, show helpful message
        if (data.error && (data.error.includes('Token') || data.error.includes('expirado'))) {
          errorDiv.innerHTML = `
            <strong>${data.error}</strong><br>
            <a href="/forgot-password">Solicita un nuevo enlace de recuperación</a>
          `;
        }
      }
    } catch (error) {
      console.error('Reset password error:', error);
      errorDiv.textContent = 'Error de conexión. Intenta nuevamente.';
      errorDiv.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Restablecer Contraseña';
    }
  });

  // Back to login link
  backToLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    router.navigate('/');
  });

  // Auto-focus new password input
  newPasswordInput.focus();
}
