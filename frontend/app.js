/**
 * App Initialization
 * 
 * Sets up router, routes, and authentication flow.
 * Maintains API_URL auto-detection for local vs production.
 */

import router from './router.js';
import { checkAuth } from './auth-utils.js';
import * as LoginPage from './pages/login.js';
import * as RegistrarPage from './pages/registrar.js';

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

  router.route('/registrar-movimiento', async () => {
    // Check if user is authenticated
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    const appEl = document.getElementById('app');
    appEl.innerHTML = RegistrarPage.render(user);
    RegistrarPage.setup();
  });

  // Auth guard - check before every route
  router.beforeEach(async (to) => {
    // Hide loading spinner
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';

    // Check authentication status
    const { authenticated } = await checkAuth();

    // If authenticated and trying to access login, redirect to main page
    if (to === '/login' && authenticated) {
      router.navigate('/registrar-movimiento');
      return false;
    }

    // If not authenticated and trying to access protected route, redirect to login
    if (!authenticated && to !== '/login') {
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
