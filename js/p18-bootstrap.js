import { initExamPlanUi, installExamPlanPatches } from './p16-exam-plan.js';
import { installAdaptiveMixPatches } from './p17-study-mix.js';
import { initMasteryInteractionBridge, installMasteryModelPatches } from './p18-mastery.js';
import { installWeaknessRemediationPatches } from './p19-remediation.js';

await installExamPlanPatches();
installAdaptiveMixPatches();
installMasteryModelPatches();
installWeaknessRemediationPatches();
initMasteryInteractionBridge();
await import('./app.js');
await initExamPlanUi();
