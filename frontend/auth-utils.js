/**
 * Auth Utilities Module
 * 
 * Provides reusable authentication functions for SPA pages.
 * Maintains API_URL auto-detection for local vs production environments.
 */

// API URL auto-detection
const API_URL = window.location.hostname === "localhost"
  ? ""
  : "https://api.gastos.blanquicet.com.co";

// Email validation regex - requires format: text@text.text
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check if user is authenticated
 * @returns {Promise<{authenticated: boolean, user: Object|null}>}
 */
export async function checkAuth() {
  try {
    const response = await fetch(`${API_URL}/me`, {
      credentials: "include",
    });

    if (response.ok) {
      const user = await response.json();
      return { authenticated: true, user };
    } else {
      return { authenticated: false, user: null };
    }
  } catch (error) {
    console.error("Auth check failed:", error);
    return { authenticated: false, user: null };
  }
}

/**
 * Login user with email and password
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
export async function login(email, password) {
  email = email.trim();

  if (!email || !password) {
    return { success: false, error: "Por favor ingresa email y contraseña" };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { success: false, error: "Por favor ingresa un email válido (ej: usuario@ejemplo.com)" };
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
      return { success: true, user: data };
    } else {
      return { success: false, error: data.error || "Error al iniciar sesión" };
    }
  } catch (error) {
    console.error("Login failed:", error);
    return { success: false, error: "Error de conexión. Intenta de nuevo." };
  }
}

/**
 * Register new user
 * @param {string} name 
 * @param {string} email 
 * @param {string} password 
 * @param {string} confirmPassword 
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
export async function register(name, email, password, confirmPassword) {
  name = name.trim();
  email = email.trim();

  if (!name || !email || !password) {
    return { success: false, error: "Por favor completa todos los campos" };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { success: false, error: "Por favor ingresa un email válido (ej: usuario@ejemplo.com)" };
  }

  if (password !== confirmPassword) {
    return { success: false, error: "Las contraseñas no coinciden" };
  }

  if (password.length < 8) {
    return { success: false, error: "La contraseña debe tener al menos 8 caracteres" };
  }

  // Password strength validation
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (!hasLower || !hasUpper || (!hasNumber && !hasSymbol)) {
    return { success: false, error: "La contraseña debe tener: mayúsculas, minúsculas y números o símbolos" };
  }

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
      return { success: true, user: data };
    } else {
      return { success: false, error: data.error || "Error al registrarse" };
    }
  } catch (error) {
    console.error("Register failed:", error);
    return { success: false, error: "Error de conexión. Intenta de nuevo." };
  }
}

/**
 * Logout current user
 * @returns {Promise<void>}
 */
export async function logout() {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error("Logout failed:", error);
  }
}

/**
 * Validate email format
 * @param {string} email 
 * @returns {boolean}
 */
export function validateEmail(email) {
  if (!email || email.trim() === "") return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Check password strength
 * @param {string} password 
 * @returns {{level: number, text: string, width: string, className: string}}
 */
export function checkPasswordStrength(password) {
  if (!password || password.length === 0) {
    return { level: 0, text: "", width: "0%", className: "" };
  }

  // Check basic requirements
  const hasMinLength = password.length >= 8;
  const hasLowerCase = /[a-z]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^a-zA-Z0-9]/.test(password);

  // Basic requirements: 8+ chars + lowercase + uppercase + (number OR symbol)
  const meetsBasicRequirements = hasMinLength && hasLowerCase && hasUpperCase && (hasNumber || hasSpecialChar);

  let strength = 0;

  if (meetsBasicRequirements) {
    strength = 2; // Start at "Aceptable"
    if (password.length >= 12) strength++; // Longer password
    if (hasNumber && hasSpecialChar) strength++; // Both numbers AND special chars
  }

  // Map strength to display values
  const strengthMap = {
    0: { text: "Débil", width: "25%", className: "weak" },
    2: { text: "Aceptable", width: "50%", className: "acceptable" },
    3: { text: "Buena", width: "75%", className: "good" },
    4: { text: "Fuerte", width: "100%", className: "strong" }
  };

  return { level: strength, ...strengthMap[strength] };
}

/**
 * Get API URL for movements endpoint
 * @returns {string}
 */
export function getMovementsApiUrl() {
  return `${API_URL}/movements`;
}

/**
 * Get current API URL
 * @returns {string}
 */
export function getApiUrl() {
  return API_URL;
}
