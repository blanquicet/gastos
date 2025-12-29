/**
 * Login/Register Page
 * 
 * Handles authentication UI and interactions.
 * Imports auth utilities and uses router for navigation.
 */

import { login, register, validateEmail, checkPasswordStrength } from '../auth-utils.js';
import router from '../router.js';

let currentForm = 'login'; // 'login' or 'register'

/**
 * Render login/register page HTML
 */
export function render() {
  // Always start with login form
  currentForm = 'login';

  return `
    <div class="auth-wrapper">
      <div class="auth-box">
        <!-- Login Form -->
        <form id="loginForm" class="${currentForm === 'login' ? '' : 'hidden'}">
          <h2>Iniciar Sesión</h2>

          <div class="form-group">
            <label for="loginEmail">Email</label>
            <input
              type="email"
              id="loginEmail"
              autocomplete="email"
              required
              placeholder="tu@email.com"
            />
          </div>

          <div class="form-group password-field">
            <label for="loginPassword">Contraseña</label>
            <div class="password-wrapper">
              <input
                type="password"
                id="loginPassword"
                autocomplete="current-password"
                required
                minlength="8"
                placeholder="Tu contraseña"
              />
              <button
                type="button"
                class="toggle-password"
                data-target="loginPassword"
                aria-label="Mostrar contraseña"
              >
                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
          </div>

          <div id="loginError" class="error hidden"></div>

          <button type="submit" id="loginBtn" class="btn btn-primary">
            Iniciar Sesión
          </button>

          <p class="auth-switch">
            <a href="/forgot-password" id="forgotPasswordLink">¿Olvidaste tu contraseña?</a>
          </p>

          <p class="auth-switch">
            ¿No tienes cuenta?
            <a href="#" id="showRegister">Regístrate</a>
          </p>
        </form>

        <!-- Register Form -->
        <form id="registerForm" class="${currentForm === 'register' ? '' : 'hidden'}">
          <h2>Crear Cuenta</h2>

          <div class="form-group">
            <label for="registerName">Nombre</label>
            <input
              type="text"
              id="registerName"
              autocomplete="name"
              required
              placeholder="Tu nombre"
            />
          </div>

          <div class="form-group">
            <label for="registerEmail">Email</label>
            <input
              type="email"
              id="registerEmail"
              autocomplete="email"
              required
              placeholder="tu@email.com"
            />
          </div>

          <div class="form-group password-field">
            <label for="registerPassword">Contraseña</label>
            <div class="password-wrapper">
              <input
                type="password"
                id="registerPassword"
                autocomplete="new-password"
                required
                minlength="8"
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                class="toggle-password"
                data-target="registerPassword"
                aria-label="Mostrar contraseña"
              >
                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <div id="passwordStrength" class="password-strength hidden">
              <div class="strength-bar">
                <div class="strength-bar-fill"></div>
              </div>
              <span class="strength-text"></span>
            </div>
          </div>

          <div class="form-group password-field">
            <label for="registerConfirm">Confirmar Contraseña</label>
            <div class="password-wrapper">
              <input
                type="password"
                id="registerConfirm"
                autocomplete="new-password"
                required
                minlength="8"
                placeholder="Repite tu contraseña"
              />
              <button
                type="button"
                class="toggle-password"
                data-target="registerConfirm"
                aria-label="Mostrar contraseña"
              >
                <svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
            </div>
            <div id="passwordMatch" class="password-match hidden"></div>
          </div>

          <div id="registerError" class="error hidden"></div>

          <button type="submit" id="registerBtn" class="btn btn-primary">
            Registrarse
          </button>

          <p class="auth-switch">
            ¿Ya tienes cuenta?
            <a href="#" id="showLogin">Inicia sesión</a>
          </p>
        </form>
      </div>
    </div>
  `;
}

/**
 * Setup event listeners after page is rendered
 */
export function setup() {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const showRegisterLink = document.getElementById('showRegister');
  const showLoginLink = document.getElementById('showLogin');
  const loginEmail = document.getElementById('loginEmail');
  const registerEmail = document.getElementById('registerEmail');
  const registerPassword = document.getElementById('registerPassword');
  const registerConfirm = document.getElementById('registerConfirm');

  // Form submission handlers
  loginForm.addEventListener('submit', handleLoginSubmit);
  registerForm.addEventListener('submit', handleRegisterSubmit);

  // Form switching
  showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    showRegisterForm();
  });

  showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    showLoginForm();
  });

  // Email validation on blur
  loginEmail.addEventListener('blur', () => {
    const email = loginEmail.value.trim();
    if (email) {
      const isValid = validateEmail(email);
      loginEmail.classList.toggle('valid', isValid);
      loginEmail.classList.toggle('invalid', !isValid);
    }
  });

  registerEmail.addEventListener('blur', () => {
    const email = registerEmail.value.trim();
    if (email) {
      const isValid = validateEmail(email);
      registerEmail.classList.toggle('valid', isValid);
      registerEmail.classList.toggle('invalid', !isValid);
    }
  });

  // Password strength indicator
  registerPassword.addEventListener('input', () => {
    updatePasswordStrength();
    updatePasswordMatch();
  });

  registerConfirm.addEventListener('input', updatePasswordMatch);

  // Password visibility toggles
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', handlePasswordToggle);
  });

  // Auto-focus on appropriate field
  setTimeout(() => {
    if (currentForm === 'login') {
      loginEmail.focus();
    } else {
      document.getElementById('registerName').focus();
    }
  }, 100);
}

/**
 * Handle login form submission
 */
async function handleLoginSubmit(e) {
  e.preventDefault();
  clearErrors();

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');

  setButtonLoading(loginBtn, true);

  const result = await login(email, password);

  if (result.success) {
    // Navigate to registrar-movimiento page
    router.navigate('/registrar-movimiento');
  } else {
    showError(loginError, result.error);
  }

  setButtonLoading(loginBtn, false);
}

/**
 * Handle register form submission
 */
async function handleRegisterSubmit(e) {
  e.preventDefault();
  clearErrors();

  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirm').value;
  const registerBtn = document.getElementById('registerBtn');
  const registerError = document.getElementById('registerError');

  setButtonLoading(registerBtn, true);

  const result = await register(name, email, password, confirmPassword);

  if (result.success) {
    // Navigate to registrar-movimiento page
    router.navigate('/registrar-movimiento');
  } else {
    showError(registerError, result.error);
  }

  setButtonLoading(registerBtn, false);
}

/**
 * Show login form, hide register form
 */
function showLoginForm() {
  currentForm = 'login';
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  clearErrors();
  setTimeout(() => document.getElementById('loginEmail').focus(), 100);
}

/**
 * Show register form, hide login form
 */
function showRegisterForm() {
  currentForm = 'register';
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
  clearErrors();
  setTimeout(() => document.getElementById('registerName').focus(), 100);
}

/**
 * Update password strength indicator
 */
function updatePasswordStrength() {
  const password = document.getElementById('registerPassword').value;
  const strengthContainer = document.getElementById('passwordStrength');
  const strengthBar = strengthContainer.querySelector('.strength-bar-fill');
  const strengthText = strengthContainer.querySelector('.strength-text');

  if (!password || password.length === 0) {
    strengthContainer.classList.add('hidden');
    return;
  }

  const strength = checkPasswordStrength(password);
  
  strengthContainer.classList.remove('hidden');
  strengthBar.className = 'strength-bar-fill ' + strength.className;
  strengthBar.style.width = strength.width;
  strengthText.textContent = strength.text;
}

/**
 * Update password match indicator
 */
function updatePasswordMatch() {
  const password = document.getElementById('registerPassword').value;
  const confirm = document.getElementById('registerConfirm').value;
  const matchHint = document.getElementById('passwordMatch');
  const confirmField = document.getElementById('registerConfirm').closest('.password-field');

  if (confirm.length === 0) {
    matchHint.classList.add('hidden');
    confirmField.classList.remove('valid', 'invalid');
    return;
  }

  matchHint.classList.remove('hidden');

  if (password === confirm) {
    matchHint.textContent = '✓ Las contraseñas coinciden';
    matchHint.className = 'password-match match';
    confirmField.classList.remove('invalid');
    confirmField.classList.add('valid');
  } else {
    matchHint.textContent = '✗ Las contraseñas no coinciden';
    matchHint.className = 'password-match no-match';
    confirmField.classList.remove('valid');
    confirmField.classList.add('invalid');
  }
}

/**
 * Toggle password visibility
 */
function handlePasswordToggle(e) {
  const button = e.currentTarget;
  const targetId = button.dataset.target;
  const input = document.getElementById(targetId);
  const eyeIcon = button.querySelector('.eye-icon');

  if (!input || !eyeIcon) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  button.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');

  if (isPassword) {
    // Show eye-off (password is visible)
    eyeIcon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
  } else {
    // Show eye (password is hidden)
    eyeIcon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
  }
}

/**
 * Show error message
 */
function showError(element, message) {
  if (element) {
    element.textContent = message;
    element.classList.remove('hidden');
  }
}

/**
 * Clear all error messages
 */
function clearErrors() {
  const loginError = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');
  loginError?.classList.add('hidden');
  registerError?.classList.add('hidden');
}

/**
 * Set button loading state
 */
function setButtonLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.classList.toggle('loading', loading);
}
