const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planSheets } = require('../duplex.js');
const ids = sheet => sheet.map(card => card?.id ?? null);
test('long-edge backs mirror columns and keep partial-sheet blanks aligned', () => {
  const cards = Array.from({length:7}, (_,i)=>({id:i+1}));
  const sheets = planSheets(cards);
  assert.deepEqual(ids(sheets[0].back), [2,1,4,3,6,5]);
  assert.deepEqual(ids(sheets[1].back), [null,7,null,null,null,null]);
});
test('short-edge backs mirror rows', () => {
  const cards = Array.from({length:6}, (_,i)=>({id:i+1}));
  assert.deepEqual(ids(planSheets(cards,'short')[0].back), [5,6,3,4,1,2]);
  assert.deepEqual(planSheets([]), []);
});
