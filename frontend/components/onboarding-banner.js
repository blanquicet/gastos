/**
 * Onboarding Guide Banner
 * 
 * Renders a "continue guide" banner on pages outside of home (e.g., /hogar, /perfil).
 * Shows the next step in the onboarding wizard so the user can navigate back.
 */

const ONBOARDING_STEP_TITLES = [
  'Categorías',
  'Cuenta bancaria',
  'Método de pago',
  'Miembros y contactos',
  '¡Registrar primer gasto!',
];

/**
 * Render the onboarding continue banner HTML.
 * @param {boolean} onboardingCompleted - from user.onboarding_completed
 */
export function renderOnboardingBanner(onboardingCompleted) {
  if (onboardingCompleted) return '';

  const currentStep = parseInt(localStorage.getItem('onboarding_current_step') || '-1');
  if (currentStep < 0) return '';

  const stepIndex = Math.min(currentStep, ONBOARDING_STEP_TITLES.length - 1);
  const stepLabel = ONBOARDING_STEP_TITLES[stepIndex];
  const progress = `${stepIndex + 1}/${ONBOARDING_STEP_TITLES.length}`;

  return `
    <div class="link-request-banner-stack" style="margin: 0 0 16px 0;">
      <div class="link-request-banner" id="onboarding-continue-banner" style="position:relative; cursor:pointer;">
        <div class="link-request-banner-icon">📋</div>
        <div class="link-request-banner-content">
          <div class="link-request-banner-title">Guía de configuración (${progress})</div>
          <div class="link-request-banner-subtitle">Siguiente: ${stepLabel}</div>
        </div>
        <div class="link-request-banner-arrow">›</div>
      </div>
    </div>
  `;
}

/**
 * Setup click handler for the continue banner.
 * @param {Function} navigate - Router navigate function
 */
export function setupOnboardingBanner(navigate) {
  const banner = document.getElementById('onboarding-continue-banner');
  if (!banner) return;

  banner.addEventListener('click', () => {
    navigate('/');
  });
}
