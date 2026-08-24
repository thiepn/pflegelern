import * as db from './storage.js';
import { StudyEngine } from './study-engine.js';
import { onFailure } from './p19-remediation-core.js';

const MIGRATION_FLAG = Symbol.for('pflegelern.p19.remediationMigrationPatched');

export function installRemediationMigrationPatch() {
  if (StudyEngine.prototype[MIGRATION_FLAG]) return;
  StudyEngine.prototype[MIGRATION_FLAG] = true;
  const previousInit = StudyEngine.prototype.init;
  StudyEngine.prototype.init = async function p19InitWithLegacyMistakes() {
    const result = await previousInit.call(this);
    for (const mistake of this.mistakes.values()) {
      if (mistake.resolved || mistake.p19) continue;
      const occurred = mistake.occurredAt ? new Date(mistake.occurredAt) : new Date();
      const when = Number.isNaN(occurred.getTime()) ? new Date() : occurred;
      mistake.p19 = onFailure(null, when);
      mistake.p19.failureCount = Math.max(1, Number(mistake.count || 1));
      this.mistakes.set(mistake.id, mistake);
      await db.put('mistakes', mistake);
    }
    return result;
  };
}
