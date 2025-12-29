/**
 * App Initialization
 * 
 * Sets up router, routes, and authentication flow.
 * Maintains API_URL auto-detection for local vs production.
 */

import router from './router.js';
import { checkAuth } from './auth-utils.js';
import * as LoginPage from './pages/login.js';
import * as ForgotPasswordPage from './pages/forgot-password.js';
import * as ResetPasswordPage from './pages/reset-password.js';
import * as RegistrarMovimientoPage from './pages/registrar-movimiento.js';

// Store current user globally
let currentUser = null;

/**
 * Initialize router and define routes
 */
function initRouter() {
  // Register routes
  router.route('/login', async () => {
    const appEl = document.getElementById('app');
    appEl.innerHTML = LoginPage.render();
    LoginPage.setup();
  });

  router.route('/forgot-password', async () => {
    const appEl = document.getElementById('app');
    appEl.innerHTML = ForgotPasswordPage.render();
    ForgotPasswordPage.init();
  });

  router.route('/reset-password', async () => {
    const appEl = document.getElementById('app');
    appEl.innerHTML = ResetPasswordPage.render();
    ResetPasswordPage.init();
  });

  router.route('/registrar-movimiento', async () => {
    // Check if user is authenticated
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    const appEl = document.getElementById('app');
    appEl.innerHTML = RegistrarMovimientoPage.render(user);
    RegistrarMovimientoPage.setup();
  });

  // Auth guard - check before every route
  router.beforeEach(async (to) => {
    // Hide loading spinner
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';

    // Public routes that don't require authentication
    const publicRoutes = ['/login', '/forgot-password', '/reset-password'];
    const isPublicRoute = publicRoutes.includes(to);

    // Check authentication status
    const { authenticated } = await checkAuth();

    // If authenticated and trying to access public route, redirect to main page
    if (authenticated && isPublicRoute) {
      router.navigate('/registrar-movimiento');
      return false;
    }

    // If not authenticated and trying to access protected route, redirect to login
    if (!authenticated && !isPublicRoute) {
      router.navigate('/login');
      return false;
    }

    return true;
  });

  // Initialize router
  router.init();
}

/**
 * App initialization on DOM ready
 */
async function init() {
  // Check initial auth state
  const { authenticated } = await checkAuth();
  
  // Initialize router
  initRouter();

  // Navigate to initial route
  const currentPath = window.location.pathname;
  
  if (currentPath === '/' || currentPath === '/registrar-movimiento' || currentPath === '/registrar-movimiento/') {
    // Default route - redirect based on auth
    if (authenticated) {
      router.navigate('/registrar-movimiento');
    } else {
      router.navigate('/login');
    }
  } else {
    // Let router handle current path
    router.navigate(currentPath);
  }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
