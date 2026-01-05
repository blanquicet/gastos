/**
 * Navbar Component
 * 
 * Hamburger menu (☰) with dropdown navigation
 * - Profile, Gastos, Salir
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
  
  return `
    <button id="hamburger-btn" class="hamburger-btn" aria-label="Menú">
      ☰
    </button>

    <div id="dropdown-menu" class="dropdown-menu">
      <a href="/" class="dropdown-item ${activeRoute === '/' ? 'active' : ''}" data-route="/">
        Home
      </a>
      <a href="/registrar-movimiento" class="dropdown-item ${activeRoute === '/registrar-movimiento' ? 'active' : ''}" data-route="/registrar-movimiento">
        Registrar movimientos
      </a>
      <a href="/perfil" class="dropdown-item ${activeRoute === '/perfil' ? 'active' : ''}" data-route="/perfil">
        Perfil
      </a>
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
}
