import * as db from './storage.js';
import { StudyEngine } from './study-engine.js';
import { buildRecentSessionExposure, mergeSessionExposure } from './p25b-repetition-core.js';

const PATCH_FLAG = Symbol.for('pflegelern.p25b.repetitionPatched');

export function installQuestionRepetitionPatches() {
  if (StudyEngine.prototype[PATCH_FLAG]) return;
  StudyEngine.prototype[PATCH_FLAG] = true;

  const previousInit = StudyEngine.prototype.init;
  StudyEngine.prototype.init = async function p25bInit(...args) {
    const result = await previousInit.apply(this, args);
    const sessions = await db.getAll('sessions');
    this.p25bSessionExposure = buildRecentSessionExposure(sessions);
    return result;
  };

  const previousCreateSession = StudyEngine.prototype.createSession;
  StudyEngine.prototype.createSession = async function p25bCreateSession(config) {
    const session = await previousCreateSession.call(this, config);
    if (session) {
      this.p25bSessionExposure = mergeSessionExposure(this.p25bSessionExposure, session);
    }
    return session;
  };
}
