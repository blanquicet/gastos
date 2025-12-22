// Auth state
let currentUser = null;

// DOM elements (will be set after DOM loads)
let authContainer, appContainer, loginForm, registerForm;
let loginEmail, loginPassword, registerName, registerEmail, registerPassword, registerConfirm;
let loginError, registerError, logoutBtn, userEmailDisplay;
let showRegisterLink, showLoginLink;
let loginBtn, registerBtn, passwordMatchHint, passwordStrength;

// Email validation regex - requires format: text@text.text
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Initialize auth system
 */
async function initAuth() {
  // Get DOM elements
  authContainer = document.getElementById("authContainer");
  appContainer = document.getElementById("appContainer");
  loginForm = document.getElementById("loginForm");
  registerForm = document.getElementById("registerForm");
  loginEmail = document.getElementById("loginEmail");
  loginPassword = document.getElementById("loginPassword");
  registerName = document.getElementById("registerName");
  registerEmail = document.getElementById("registerEmail");
  registerPassword = document.getElementById("registerPassword");
  registerConfirm = document.getElementById("registerConfirm");
  loginError = document.getElementById("loginError");
  registerError = document.getElementById("registerError");
  logoutBtn = document.getElementById("logoutBtn");
  userEmailDisplay = document.getElementById("userEmail");
  showRegisterLink = document.getElementById("showRegister");
  showLoginLink = document.getElementById("showLogin");
  loginBtn = document.getElementById("loginBtn");
  registerBtn = document.getElementById("registerBtn");
  passwordMatchHint = document.getElementById("passwordMatch");
  passwordStrength = document.getElementById("passwordStrength");

  // Set up event listeners
  loginForm?.addEventListener("submit", handleLogin);
  registerForm?.addEventListener("submit", handleRegister);
  logoutBtn?.addEventListener("click", handleLogout);
  showRegisterLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showRegisterForm();
  });
  showLoginLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showLoginForm();
  });

  // Password match validation
  registerPassword?.addEventListener("input", () => {
    checkPasswordStrength();
    checkPasswordMatch();
  });
  registerConfirm?.addEventListener("input", checkPasswordMatch);

  // Email validation
  loginEmail?.addEventListener("blur", () => validateEmail(loginEmail));
  registerEmail?.addEventListener("blur", () => validateEmail(registerEmail));

  // Toggle password visibility
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", togglePasswordVisibility);
  });

  // Check if user is already logged in
  await checkAuth();
}

/**
 * Check authentication status
 */
async function checkAuth() {
  try {
    const response = await fetch(`${API_URL}/me`, {
      credentials: "include",
    });

    if (response.ok) {
      currentUser = await response.json();
      showApp();
    } else {
      showAuth();
    }
  } catch (error) {
    console.error("Auth check failed:", error);
    showAuth();
  }
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
  e.preventDefault();
  clearErrors();

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    showError(loginError, "Por favor ingresa email y contraseña");
    return;
  }

  if (!EMAIL_REGEX.test(email)) {
    showError(loginError, "Por favor ingresa un email válido (ej: usuario@ejemplo.com)");
    return;
  }

  // Set loading state
  setButtonLoading(loginBtn, true);

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      await checkAuth();
    } else {
      showError(loginError, data.error || "Error al iniciar sesión");
    }
  } catch (error) {
    console.error("Login failed:", error);
    showError(loginError, "Error de conexión. Intenta de nuevo.");
  } finally {
    setButtonLoading(loginBtn, false);
  }
}

/**
 * Handle register form submission
 */
async function handleRegister(e) {
  e.preventDefault();
  clearErrors();

  const name = registerName.value.trim();
  const email = registerEmail.value.trim();
  const password = registerPassword.value;
  const confirm = registerConfirm.value;

  if (!name || !email || !password) {
    showError(registerError, "Por favor completa todos los campos");
    return;
  }

  if (!EMAIL_REGEX.test(email)) {
    showError(registerError, "Por favor ingresa un email válido (ej: usuario@ejemplo.com)");
    return;
  }

  if (password !== confirm) {
    showError(registerError, "Las contraseñas no coinciden");
    return;
  }

  if (password.length < 8) {
    showError(registerError, "La contraseña debe tener al menos 8 caracteres");
    return;
  }

  // Password strength validation
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (!hasLower || !hasUpper || (!hasNumber && !hasSymbol)) {
    showError(registerError, "La contraseña debe tener: mayúsculas, minúsculas y números o símbolos");
    return;
  }

  // Set loading state
  setButtonLoading(registerBtn, true);

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, name, password }),
    });

    const data = await response.json();

    if (response.ok) {
      // Registration already creates a session, just check auth
      await checkAuth();
    } else {
      showError(registerError, data.error || "Error al registrarse");
    }
  } catch (error) {
    console.error("Register failed:", error);
    showError(registerError, "Error de conexión. Intenta de nuevo.");
  } finally {
    setButtonLoading(registerBtn, false);
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error("Logout failed:", error);
  }

  currentUser = null;
  showAuth();
}

/**
 * Show authentication container, hide app
 */
function showAuth() {
  authContainer.classList.remove("hidden");
  appContainer.classList.add("hidden");
  showLoginForm();
}

/**
 * Show app container, hide auth
 */
function showApp() {
  authContainer.classList.add("hidden");
  appContainer.classList.remove("hidden");

  if (userEmailDisplay && currentUser) {
    userEmailDisplay.textContent = currentUser.name;
  }
}

/**
 * Show login form, hide register form
 */
function showLoginForm() {
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  clearErrors();
  loginEmail.value = "";
  loginPassword.value = "";
  // Auto-focus on email field
  setTimeout(() => loginEmail.focus(), 100);
}

/**
 * Show register form, hide login form
 */
function showRegisterForm() {
  loginForm.classList.add("hidden");
  registerForm.classList.remove("hidden");
  clearErrors();
  registerName.value = "";
  registerEmail.value = "";
  registerPassword.value = "";
  registerConfirm.value = "";
  passwordMatchHint.classList.add("hidden");
  passwordStrength.classList.add("hidden");
  // Auto-focus on name field
  setTimeout(() => registerName.focus(), 100);
}

/**
 * Show error message
 */
function showError(element, message) {
  if (element) {
    element.textContent = message;
    element.classList.remove("hidden");
  }
}

/**
 * Clear all error messages
 */
function clearErrors() {
  loginError?.classList.add("hidden");
  registerError?.classList.add("hidden");
}

/**
 * Check if passwords match and show visual feedback
 */
function checkPasswordMatch() {
  const password = registerPassword.value;
  const confirm = registerConfirm.value;
  const confirmField = registerConfirm.closest(".password-field");

  // Only show feedback if user has started typing confirmation
  if (confirm.length === 0) {
    passwordMatchHint.classList.add("hidden");
    confirmField.classList.remove("valid", "invalid");
    return;
  }

  if (password === confirm) {
    passwordMatchHint.textContent = "✓ Las contraseñas coinciden";
    passwordMatchHint.classList.remove("hidden", "no-match");
    passwordMatchHint.classList.add("match");
    confirmField.classList.remove("invalid");
    confirmField.classList.add("valid");
  } else {
    passwordMatchHint.textContent = "✗ Las contraseñas no coinciden";
    passwordMatchHint.classList.remove("hidden", "match");
    passwordMatchHint.classList.add("no-match");
    confirmField.classList.remove("valid");
    confirmField.classList.add("invalid");
  }
}

/**
 * Toggle password visibility
 */
function togglePasswordVisibility(e) {
  const button = e.currentTarget;
  const targetId = button.dataset.target;
  const input = document.getElementById(targetId);
  const eyeIcon = button.querySelector(".eye-icon");

  if (!input || !eyeIcon) return;

  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  button.setAttribute("aria-label", isPassword ? "Ocultar contraseña" : "Mostrar contraseña");

  // Toggle between eye and eye-off icon
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
 * Set loading state on submit button
 */
function setButtonLoading(button, loading) {
  if (!button) return;

  if (loading) {
    button.disabled = true;
    button.classList.add("loading");
  } else {
    button.disabled = false;
    button.classList.remove("loading");
  }
}

/**
 * Validate email format and show visual feedback
 */
function validateEmail(input) {
  if (!input) return true;

  const email = input.value.trim();

  // Don't validate empty field (required attribute handles that)
  if (email === "") {
    input.classList.remove("valid", "invalid");
    return true;
  }

  const isValid = EMAIL_REGEX.test(email);

  if (isValid) {
    input.classList.remove("invalid");
    input.classList.add("valid");
  } else {
    input.classList.remove("valid");
    input.classList.add("invalid");
  }

  return isValid;
}

/**
 * Check password strength and show visual indicator
 */
function checkPasswordStrength() {
  const password = registerPassword.value;

  if (!password || password.length === 0) {
    passwordStrength.classList.add("hidden");
    return;
  }

  // Check basic requirements first (for "Aceptable" minimum)
  const hasMinLength = password.length >= 8;
  const hasLowerCase = /[a-z]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^a-zA-Z0-9]/.test(password);

  // Basic requirements: 8+ chars + lowercase + uppercase + (number OR symbol)
  const meetsBasicRequirements = hasMinLength && hasLowerCase && hasUpperCase && (hasNumber || hasSpecialChar);

  let strength = 0;

  // Only count points if basic requirements are met
  if (meetsBasicRequirements) {
    strength = 2; // Start at "Aceptable" level

    // Additional points for making it stronger
    if (password.length >= 12) strength++; // Longer password
    if (hasNumber && hasSpecialChar) strength++; // Both numbers AND special chars
  } else {
    // Doesn't meet basic requirements = Débil
    strength = 0;
  }

  // Determine strength level
  const strengthBar = passwordStrength.querySelector(".strength-bar-fill");
  const strengthText = passwordStrength.querySelector(".strength-text");

  passwordStrength.classList.remove("hidden");

  // Remove all strength classes
  strengthBar.classList.remove("weak", "acceptable", "good", "strong");

  if (strength === 0) {
    strengthBar.classList.add("weak");
    strengthText.textContent = "Débil";
    strengthBar.style.width = "25%";
  } else if (strength === 2) {
    strengthBar.classList.add("acceptable");
    strengthText.textContent = "Aceptable";
    strengthBar.style.width = "50%";
  } else if (strength === 3) {
    strengthBar.classList.add("good");
    strengthText.textContent = "Buena";
    strengthBar.style.width = "75%";
  } else {
    strengthBar.classList.add("strong");
    strengthText.textContent = "Fuerte";
    strengthBar.style.width = "100%";
  }
}

// Initialize auth when DOM is ready
document.addEventListener("DOMContentLoaded", initAuth);
