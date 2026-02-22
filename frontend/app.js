/**
 * App Initialization
 * 
 * Sets up router, routes, and authentication flow.
 * Pages are lazy-loaded on first navigation to reduce initial bundle size.
 */

import router from './router.js';
import { checkAuth } from './auth-utils.js';

// Store current user globally
let currentUser = null;

// Page module cache (populated on first navigation)
const pageCache = {};

async function loadPage(name) {
  if (!pageCache[name]) {
    switch (name) {
      case 'login': pageCache[name] = await import('./pages/login.js'); break;
      case 'forgot-password': pageCache[name] = await import('./pages/forgot-password.js'); break;
      case 'reset-password': pageCache[name] = await import('./pages/reset-password.js'); break;
      case 'home': pageCache[name] = await import('./pages/home.js'); break;
      case 'registrar-movimiento': pageCache[name] = await import('./pages/registrar-movimiento.js'); break;
      case 'profile': pageCache[name] = await import('./pages/profile.js'); break;
      case 'household': pageCache[name] = await import('./pages/household.js'); break;
      case 'admin-audit-logs': pageCache[name] = await import('./pages/admin-audit-logs.js'); break;
      case 'invite': pageCache[name] = await import('./pages/invite.js'); break;
      case 'chat': pageCache[name] = await import('./pages/chat.js'); break;
    }
  }
  return pageCache[name];
}

/**
 * Initialize router and define routes
 */
function initRouter() {
  // Register routes
  router.route('/login', async () => {
    const LoginPage = await loadPage('login');
    const appEl = document.getElementById('app');
    appEl.innerHTML = LoginPage.render();
    LoginPage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/forgot-password', async () => {
    const ForgotPasswordPage = await loadPage('forgot-password');
    const appEl = document.getElementById('app');
    appEl.innerHTML = ForgotPasswordPage.render();
    ForgotPasswordPage.init();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/reset-password', async () => {
    const ResetPasswordPage = await loadPage('reset-password');
    const appEl = document.getElementById('app');
    appEl.innerHTML = ResetPasswordPage.render();
    ResetPasswordPage.init();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/', async () => {
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    
    const urlParams = new URLSearchParams(window.location.search);
    const reloadParam = urlParams.get('reload');

    const HomePage = await loadPage('home');
    
    if (reloadParam) {
      const tabsToReload = reloadParam.split(',').filter(Boolean);
      HomePage.markTabsForReload(tabsToReload);
      urlParams.delete('reload');
      const newSearch = urlParams.toString();
      const newUrl = newSearch ? `/?${newSearch}` : '/';
      window.history.replaceState({ path: '/' }, '', newUrl);
    }
    
    const appEl = document.getElementById('app');
    
    // Show loading overlay while setup runs (reusing existing CSS classes)
    appEl.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Cargando...</p>
      </div>
    `;
    
    try {
      // Render the page content
      appEl.innerHTML = HomePage.render(user);
      
      // Setup event listeners (this is async and must complete for UI to work)
      await HomePage.setup();
    } catch (error) {
      console.error('Error loading home page:', error);
      appEl.innerHTML = `
        <div class="loading-spinner">
          <div class="error-icon">❌</div>
          <p class="error-title">Error al cargar la página</p>
          <p class="error-message">${error.message || 'Por favor recarga la página'}</p>
          <button class="btn-primary" onclick="window.location.reload()">Recargar</button>
        </div>
      `;
      return;
    }
    
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/registrar-movimiento', async () => {
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    const RegistrarMovimientoPage = await loadPage('registrar-movimiento');
    const appEl = document.getElementById('app');
    appEl.innerHTML = RegistrarMovimientoPage.render(user);
    await RegistrarMovimientoPage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/perfil', async () => {
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    const ProfilePage = await loadPage('profile');
    const appEl = document.getElementById('app');
    appEl.innerHTML = ProfilePage.render(user);
    await ProfilePage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/hogar', async () => {
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    currentUser = user;
    const HouseholdPage = await loadPage('household');
    const appEl = document.getElementById('app');
    appEl.innerHTML = HouseholdPage.render(user);
    await HouseholdPage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/admin/audit-logs', async () => {
    const { authenticated, user } = await checkAuth();
    
    if (!authenticated) {
      router.navigate('/login');
      return;
    }

    if (user.email !== 'blanquicet@gmail.com') {
      router.navigate('/');
      return;
    }

    currentUser = user;
    const AdminAuditLogsPage = await loadPage('admin-audit-logs');
    const appEl = document.getElementById('app');
    appEl.innerHTML = AdminAuditLogsPage.render(user);
    await AdminAuditLogsPage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/invite', async () => {
    const { authenticated, user } = await checkAuth();
    
    if (authenticated) {
      currentUser = user;
    }
    
    const InvitePage = await loadPage('invite');
    const appEl = document.getElementById('app');
    appEl.innerHTML = InvitePage.render();
    await InvitePage.setup(authenticated);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  router.route('/chat', async () => {
    const { authenticated, user } = await checkAuth();
    if (!authenticated) {
      router.navigate('/login');
      return;
    }
    currentUser = user;
    const ChatPage = await loadPage('chat');
    const appEl = document.getElementById('app');
    appEl.innerHTML = ChatPage.render();
    ChatPage.setup();
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
  });

  // Auth guard - check before every route
  router.beforeEach(async (to) => {
    // Public routes that don't require authentication
    const publicRoutes = ['/login', '/forgot-password', '/reset-password', '/invite'];
    const isPublicRoute = publicRoutes.includes(to) || to.startsWith('/invite');

    // Check authentication status
    const { authenticated } = await checkAuth();

    // If authenticated and trying to access login-type routes, redirect to main page
    // But NOT for /invite - authenticated users can still view invites
    const authOnlyPublicRoutes = ['/login', '/forgot-password', '/reset-password'];
    if (authenticated && authOnlyPublicRoutes.includes(to)) {
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
