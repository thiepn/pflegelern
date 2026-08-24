import assert from 'node:assert/strict';
import { StudyEngine } from '../js/study-engine.js';
import { installMockExamPatches } from '../js/p20-exam.js';

let tests = 0;
const check = (fn) => { fn(); tests += 1; };

const beforeCreate = StudyEngine.prototype.createExam;
installMockExamPatches();
const afterCreate = StudyEngine.prototype.createExam;
check(() => assert.notEqual(afterCreate, beforeCreate));
check(() => assert.equal(typeof StudyEngine.prototype.p20ExamOverview, 'function'));
check(() => assert.equal(typeof StudyEngine.prototype.p20ExamBreakdown, 'function'));
check(() => assert.equal(typeof StudyEngine.prototype.finalizeExam, 'function'));

// Installation is idempotent.
installMockExamPatches();
check(() => assert.equal(StudyEngine.prototype.createExam, afterCreate));

const engine = Object.create(StudyEngine.prototype);
engine.content = {
  questionById: new Map([
    ['s', { id:'s', type:'single_choice', options:[{id:'a'}] }],
    ['o', { id:'o', type:'ordering', options:[{id:'a'},{id:'b'}] }],
    ['m', { id:'m', type:'matching', options:[{id:'a'},{id:'b'}] }]
  ])
};
const attempt = {
  currentIndex: 1,
  markedForReview: ['m'],
  questions: [{id:'s'},{id:'o'},{id:'m'}],
  answers: {
    s: { selected:['a'] },
    o: {},
    m: { matches:{ a:'x', b:'y' } }
  }
};
const overview = engine.p20ExamOverview(attempt);
check(() => assert.equal(overview.length, 3));
check(() => assert.equal(overview[0].answered, true));
check(() => assert.equal(overview[1].answered, false));
check(() => assert.equal(overview[1].current, true));
check(() => assert.equal(overview[2].flagged, true));
check(() => assert.equal(overview[2].answered, true));
check(() => assert.equal(overview.filter((x)=>x.answered).length, 2));

console.log(JSON.stringify({ phase: 'P20-runtime', tests, errors: 0 }, null, 2));
