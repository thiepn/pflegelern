import { initExamPlanUi, installExamPlanPatches } from './p16-exam-plan.js';

await installExamPlanPatches();
await import('./app.js');
await initExamPlanUi();
