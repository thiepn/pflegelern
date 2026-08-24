import { initExamPlanUi, installExamPlanPatches } from './p16-exam-plan.js';
import { installAdaptiveMixPatches } from './p17-study-mix.js';

await installExamPlanPatches();
installAdaptiveMixPatches();
await import('./app.js');
await initExamPlanUi();
