/**
 * Navbar Component
 * 
 * Hamburger menu (☰) with dropdown navigation
 * - Profile, Home, Salir
 * - Shows current user name
 * - Highlights active page
 * - Click outside to close
 */

import { logout } from '../auth-utils.js';
import router from '../router.js';

let isOpen = false;
let currentRoute = '/';

export function render(user, activeRoute = '/') {
  currentRoute = activeRoute;
  
  // Check if user is admin (hardcoded for now)
  const isAdmin = user && user.email === 'blanquicet@gmail.com';
  
  return `
    <button id="hamburger-btn" class="hamburger-btn" aria-label="Menú">
      ☰
      <span id="hamburger-badge" class="hamburger-badge" style="display:none;"></span>
    </button>

    <div id="dropdown-menu" class="dropdown-menu">
      <a href="/perfil" class="dropdown-item ${activeRoute === '/perfil' ? 'active' : ''}" data-route="/perfil">
        Perfil
      </a>
      <a href="/hogar" class="dropdown-item ${activeRoute === '/hogar' ? 'active' : ''}" data-route="/hogar">
        Hogar <span id="link-request-badge" class="nav-badge" style="display:none;"></span>
      </a>
      <a href="/" class="dropdown-item ${activeRoute === '/' ? 'active' : ''}" data-route="/">
        Mes a Mes
      </a>
      ${isAdmin ? `
      <a href="/admin/audit-logs" class="dropdown-item ${activeRoute === '/admin/audit-logs' ? 'active' : ''}" data-route="/admin/audit-logs">
        🔒 Audit Logs
      </a>
      ` : ''}
      <button id="dropdown-logout-btn" class="dropdown-item dropdown-logout">
        Salir
      </button>
    </div>

    <div id="dropdown-overlay" class="dropdown-overlay"></div>
  `;
}

export function setup() {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const dropdownMenu = document.getElementById('dropdown-menu');
  const overlay = document.getElementById('dropdown-overlay');
  const logoutBtn = document.getElementById('dropdown-logout-btn');
  const menuItems = document.querySelectorAll('.dropdown-item[data-route]');

  function openMenu() {
    isOpen = true;
    dropdownMenu?.classList.add('dropdown-menu-open');
    overlay?.classList.add('dropdown-overlay-visible');
  }

  function closeMenu() {
    isOpen = false;
    dropdownMenu?.classList.remove('dropdown-menu-open');
    overlay?.classList.remove('dropdown-overlay-visible');
  }

  hamburgerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  overlay?.addEventListener('click', closeMenu);

  // Navigate and close menu
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const route = item.getAttribute('data-route');
      closeMenu();
      router.navigate(route);
    });
  });

  // Logout handler
  logoutBtn?.addEventListener('click', async () => {
    closeMenu();
    await logout();
    router.navigate('/login');
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeMenu();
    }
  });

  // Fetch pending link request count for badge
  fetchLinkRequestCount();
}

async function fetchLinkRequestCount() {
  try {
    const resp = await fetch('/link-requests/count', { credentials: 'include' });
    if (!resp.ok) return;
    const data = await resp.json();
    const count = data.count || 0;

    const badge = document.getElementById('link-request-badge');
    const hamburgerBadge = document.getElementById('hamburger-badge');

    if (count > 0) {
      if (badge) {
        badge.textContent = count;
        badge.style.display = 'inline-block';
      }
      if (hamburgerBadge) {
        hamburgerBadge.style.display = 'block';
      }
    } else {
      if (badge) badge.style.display = 'none';
      if (hamburgerBadge) hamburgerBadge.style.display = 'none';
    }
  } catch (e) {
    // silently ignore
  }
}
