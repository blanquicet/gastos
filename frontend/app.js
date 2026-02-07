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
import * as HomePage from './pages/home.js';
import * as RegistrarMovimientoPage from './pages/registrar-movimiento.js';
import * as ProfilePage from './pages/profile.js';
import * as HouseholdPage from './pages/household.js';
import * as AdminAuditLogsPage from './pages/admin-audit-logs.js';

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
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/forgot-password', async () => {
    const appEl = document.getElementById('app');
    appEl.innerHTML = ForgotPasswordPage.render();
    ForgotPasswordPage.init();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/reset-password', async () => {
    const appEl = document.getElementById('app');
    appEl.innerHTML = ResetPasswordPage.render();
    ResetPasswordPage.init();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/', async () => {
    // Check if user is authenticated
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    
    // Check if we need to reload data (coming from registrar-movimiento)
    const urlParams = new URLSearchParams(window.location.search);
    const reloadParam = urlParams.get('reload');
    
    if (reloadParam) {
      // Parse tabs that need reload
      const tabsToReload = reloadParam.split(',').filter(Boolean);
      
      // Mark tabs for lazy reload
      HomePage.markTabsForReload(tabsToReload);
      
      // Remove reload param from URL
      urlParams.delete('reload');
      const newSearch = urlParams.toString();
      const newUrl = newSearch ? `/?${newSearch}` : '/';
      window.history.replaceState({ path: '/' }, '', newUrl);
    }
    
    const appEl = document.getElementById('app');
    appEl.innerHTML = HomePage.render(user);
    await HomePage.setup();
    
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
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
    await RegistrarMovimientoPage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/perfil', async () => {
    // Check if user is authenticated
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    const appEl = document.getElementById('app');
    appEl.innerHTML = ProfilePage.render(user);
    await ProfilePage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/hogar', async () => {
    // Check if user is authenticated
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    const appEl = document.getElementById('app');
    appEl.innerHTML = HouseholdPage.render(user);
    await HouseholdPage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/admin/audit-logs', async () => {
    // Check if user is authenticated
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    // Check if user is admin (hardcoded for now)
    if (user.email !== 'blanquicet@gmail.com') {
      router.navigate('/');
      return;
    }

    currentUser = user;
    const appEl = document.getElementById('app');
    appEl.innerHTML = AdminAuditLogsPage.render(user);
    await AdminAuditLogsPage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  // Auth guard - check before every route
  router.beforeEach(async (to) => {
    // Public routes that don't require authentication
    const publicRoutes = ['/login', '/forgot-password', '/reset-password'];
    const isPublicRoute = publicRoutes.includes(to);

    // Check authentication status
    const { authenticated } = await checkAuth();

    // If authenticated and trying to access public route, redirect to main page
    if (authenticated && isPublicRoute) {
      router.navigate('/');
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
  // Initialize router
  initRouter();

  // Navigate to initial route
  const currentPath = window.location.pathname;
  const search = window.location.search;
  const fullPath = currentPath + search;
  
  if (currentPath === '/') {
    // Default route - let beforeEach guard handle auth check
    router.navigate('/');
  } else {
    // Let router handle current path (with query params)
    router.navigate(fullPath);
  }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
