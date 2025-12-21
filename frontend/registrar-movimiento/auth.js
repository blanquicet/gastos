// Auth configuration - auto-detect local vs production
// Use empty string for same-origin requests (works with cookies)
const API_URL = window.location.hostname === "localhost" 
  ? "" 
  : "https://api.gastos.blanquicet.com.co";

// Auth state
let currentUser = null;

// DOM elements (will be set after DOM loads)
let authContainer, appContainer, loginForm, registerForm;
let loginEmail, loginPassword, registerEmail, registerPassword, registerConfirm;
let loginError, registerError, logoutBtn, userEmailDisplay;
let showRegisterLink, showLoginLink;

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
  registerEmail = document.getElementById("registerEmail");
  registerPassword = document.getElementById("registerPassword");
  registerConfirm = document.getElementById("registerConfirm");
  loginError = document.getElementById("loginError");
  registerError = document.getElementById("registerError");
  logoutBtn = document.getElementById("logoutBtn");
  userEmailDisplay = document.getElementById("userEmail");
  showRegisterLink = document.getElementById("showRegister");
  showLoginLink = document.getElementById("showLogin");

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
  }
}

/**
 * Handle register form submission
 */
async function handleRegister(e) {
  e.preventDefault();
  clearErrors();

  const email = registerEmail.value.trim();
  const password = registerPassword.value;
  const confirm = registerConfirm.value;

  if (!email || !password) {
    showError(registerError, "Por favor completa todos los campos");
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

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
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
    userEmailDisplay.textContent = currentUser.email;
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
}

/**
 * Show register form, hide login form
 */
function showRegisterForm() {
  loginForm.classList.add("hidden");
  registerForm.classList.remove("hidden");
  clearErrors();
  registerEmail.value = "";
  registerPassword.value = "";
  registerConfirm.value = "";
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

// Initialize auth when DOM is ready
document.addEventListener("DOMContentLoaded", initAuth);
