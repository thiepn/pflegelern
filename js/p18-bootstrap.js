import { initExamPlanUi, installExamPlanPatches } from './p16-exam-plan.js';
import { installAdaptiveMixPatches } from './p17-study-mix.js';
import { initMasteryInteractionBridge, installMasteryModelPatches } from './p18-mastery.js';

await installExamPlanPatches();
installAdaptiveMixPatches();
installMasteryModelPatches();
initMasteryInteractionBridge();
await import('./app.js');
await initExamPlanUi();
