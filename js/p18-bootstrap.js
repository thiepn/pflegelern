import { initExamPlanUi, installExamPlanPatches } from './p16-exam-plan.js';
import { installAdaptiveMixPatches } from './p17-study-mix.js';
import { initMasteryInteractionBridge, installMasteryModelPatches } from './p18-mastery.js';
import { installRemediationMigrationPatch } from './p19-remediation-migration.js';
import { installWeaknessRemediationPatches } from './p19-remediation.js';
import { installMockExamPatches } from './p20-exam.js';
import { initMockExamUi } from './p20-exam-ui.js';
import { initCareThemeUi } from './p21-care-ui.js';
import { initClinicalAccessibilityTokens } from './p22-accessibility.js';
import { initP24RegressionUi } from './p24-ui.js';
import { installQuestionRepetitionPatches } from './p25b-repetition.js';

try {
  const savedTheme = localStorage.getItem('pflege-theme');
  const resolvedTheme = savedTheme === 'dark' ? 'dark' : 'light';
  if (savedTheme !== resolvedTheme) localStorage.setItem('pflege-theme', resolvedTheme);
  document.documentElement.dataset.theme = resolvedTheme;
} catch {
  document.documentElement.dataset.theme = 'light';
}

initClinicalAccessibilityTokens();
initP24RegressionUi();
await installExamPlanPatches();
installAdaptiveMixPatches();
installQuestionRepetitionPatches();
installMasteryModelPatches();
installRemediationMigrationPatch();
installWeaknessRemediationPatches();
installMockExamPatches();
initMasteryInteractionBridge();
await import('./app.js');
await initExamPlanUi();
initMockExamUi();
initCareThemeUi();
