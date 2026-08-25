export function initClinicalAccessibilityTokens() {
  if (typeof document === 'undefined' || document.querySelector('link[data-p22-accessibility]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/p22-accessibility.css';
  link.dataset.p22Accessibility = 'true';
  document.head.append(link);
}
