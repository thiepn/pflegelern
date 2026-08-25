import { initExamPlanUi, installExamPlanPatches } from './p16-exam-plan.js';
import { installAdaptiveMixPatches } from './p17-study-mix.js';
import { initMasteryInteractionBridge, installMasteryModelPatches } from './p18-mastery.js';
import { installRemediationMigrationPatch } from './p19-remediation-migration.js';
import { installWeaknessRemediationPatches } from './p19-remediation.js';
import { installMockExamPatches } from './p20-exam.js';
import { initMockExamUi } from './p20-exam-ui.js';
import { initCareThemeUi } from './p21-care-ui.js';
import { initClinicalAccessibilityTokens } from './p22-accessibility.js';

// P22 visual migration: preserve explicit dark mode, otherwise move legacy/system
// preferences to the light-first Clinical Clean default.
try {
  const savedTheme = localStorage.getItem('pflege-theme');
  const resolvedTheme = savedTheme === 'dark' ? 'dark' : 'light';
  if (savedTheme !== resolvedTheme) localStorage.setItem('pflege-theme', resolvedTheme);
  document.documentElement.dataset.theme = resolvedTheme;
} catch {
  document.documentElement.dataset.theme = 'light';
}

initClinicalAccessibilityTokens();
await installExamPlanPatches();
installAdaptiveMixPatches();
installMasteryModelPatches();
installRemediationMigrationPatch();
installWeaknessRemediationPatches();
installMockExamPatches();
initMasteryInteractionBridge();
await import('./app.js');
await initExamPlanUi();
initMockExamUi();
initCareThemeUi();
