/**
 * Forgot Password Page
 * 
 * Allows users to request a password reset email.
 */

import { validateEmail } from '../auth-utils.js';
import router from '../router.js';

const API_URL = 'https://api.gastos.blanquicet.com.co';

/**
 * Render forgot password page HTML
 */
export function render() {
  return `
    <div class="auth-wrapper">
      <div class="auth-box">
        <form id="forgotPasswordForm">
          <h2>Recuperar Contraseña</h2>
          
          <p class="form-description">
            Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
          </p>

          <div class="form-group">
            <label for="forgotEmail">Email</label>
            <input
              type="email"
              id="forgotEmail"
              autocomplete="email"
              required
              placeholder="tu@email.com"
            />
            <span id="forgotEmailError" class="field-error hidden"></span>
          </div>

          <div id="forgotError" class="error hidden"></div>
          <div id="forgotSuccess" class="success hidden"></div>

          <button type="submit" id="forgotBtn" class="btn btn-primary">
            Enviar Enlace de Recuperación
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
 * Initialize forgot password page interactions
 */
export function init() {
  const form = document.getElementById('forgotPasswordForm');
  const emailInput = document.getElementById('forgotEmail');
  const emailError = document.getElementById('forgotEmailError');
  const errorDiv = document.getElementById('forgotError');
  const successDiv = document.getElementById('forgotSuccess');
  const submitBtn = document.getElementById('forgotBtn');
  const backToLoginLink = document.getElementById('backToLogin');

  // Email validation on blur
  emailInput.addEventListener('blur', () => {
    const email = emailInput.value.trim();
    if (!email) return;

    if (!validateEmail(email)) {
      emailError.textContent = 'Email inválido';
      emailError.classList.remove('hidden');
      emailInput.classList.add('invalid');
    } else {
      emailError.classList.add('hidden');
      emailInput.classList.remove('invalid');
    }
  });

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous messages
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    const email = emailInput.value.trim();

    // Validate email
    if (!validateEmail(email)) {
      errorDiv.textContent = 'Por favor ingresa un email válido';
      errorDiv.classList.remove('hidden');
      return;
    }

    // Disable button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        // Show success message
        successDiv.innerHTML = `
          <strong>¡Enlace enviado!</strong><br>
          Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
          <br><br>
          <small>Revisa tu bandeja de entrada y spam. El enlace expira en 1 hora.</small>
        `;
        successDiv.classList.remove('hidden');
        
        // Clear form
        form.reset();

        // Redirect to login after 5 seconds
        setTimeout(() => {
          router.navigate('/');
        }, 5000);
      } else {
        errorDiv.textContent = data.error || 'Error al enviar el enlace';
        errorDiv.classList.remove('hidden');
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      errorDiv.textContent = 'Error de conexión. Intenta nuevamente.';
      errorDiv.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar Enlace de Recuperación';
    }
  });

  // Back to login link
  backToLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    router.navigate('/');
  });

  // Auto-focus email input
  emailInput.focus();
}
