import assert from 'node:assert/strict';
import { calibrationModel, extractKeyPoints, isRubricEligibleQuestion } from '../js/p14-calibration.js';

assert.equal(isRubricEligibleQuestion('Welche drei Faktoren gehören zur Virchow-Trias?'), true);
assert.equal(isRubricEligibleQuestion('Was ist eine Transplantation?'), false);
assert.deepEqual(
  extractKeyPoints('• Blutfluss\n• Gefäßwand\n• Gerinnungsneigung'),
  ['Blutfluss', 'Gefäßwand', 'Gerinnungsneigung']
);
assert.deepEqual(
  extractKeyPoints('Symptome:\n- Schmerzen\n- Schwellung\n- Instabilität'),
  ['Schmerzen', 'Schwellung', 'Instabilität']
);
assert.deepEqual(extractKeyPoints('Dies ist ein normaler Fließtext ohne Listenstruktur.'), []);
assert.deepEqual(extractKeyPoints('Ein längerer Absatz.\nEin weiterer längerer Absatz, der eher Erklärung als kompakten Antwortpunkt darstellt und deshalb nicht als Kernpunkt-Rubrik gedacht ist, weil er unnötig viel Text wiederholen würde.'), []);

const model = calibrationModel({
  questionText: 'Welche Symptome werden genannt?',
  answerText: '• Dyspnoe\n• Tachykardie'
});
assert.equal(model.keyPoints.length, 2);
assert.match(model.ratings[3], /Alle wesentlichen Punkte/);
assert.match(model.ratings[2], /wichtiger Punkt fehlte/);
assert.match(model.ratings[1], /nicht erinnert/);

console.log(JSON.stringify({ phase: 'P14', tests: 9, errors: 0 }, null, 2));
