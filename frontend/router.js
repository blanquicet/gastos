// Simple vanilla JavaScript SPA router
class Router {
  constructor() {
    this.routes = {};
    this.currentRoute = null;
    this.authCheckCallback = null;
  }

  // Register a route
  route(path, handler) {
    this.routes[path] = handler;
    return this;
  }

  // Set auth check callback (runs before every route)
  beforeEach(callback) {
    this.authCheckCallback = callback;
    return this;
  }

  // Navigate to a path
  async navigate(path, replaceState = false) {
    if (this.currentRoute === path) return;

    // Run auth check if registered
    if (this.authCheckCallback) {
      const shouldContinue = await this.authCheckCallback(path);
      if (!shouldContinue) return;
    }

    const handler = this.routes[path];
    if (!handler) {
      console.warn(`No route registered for: ${path}`);
      return;
    }

    this.currentRoute = path;

    // Update browser history
    if (replaceState) {
      window.history.replaceState({ path }, '', path);
    } else {
      window.history.pushState({ path }, '', path);
    }

    // Clear app container and render new page
    const appContainer = document.getElementById('app');
    if (appContainer) {
      appContainer.innerHTML = '';
      await handler(appContainer);
    }
  }

  // Handle browser back/forward buttons
  init() {
    window.addEventListener('popstate', async (e) => {
      const path = e.state?.path || window.location.pathname;
      await this.navigate(path, true);
    });

    // Handle initial page load
    const initialPath = window.location.pathname;
    this.navigate(initialPath, true);
  }
}

// Export singleton instance
const router = new Router();
export default router;
