'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { add, subtract } = require('../src/index.js');

test('add returns the sum', () => {
  assert.strictEqual(add(2, 3), 5);
  assert.strictEqual(add(-1, 1), 0);
  assert.strictEqual(add(0.1, 0.2).toFixed(1), '0.3');
});

test('add rejects non-numbers', () => {
  assert.throws(() => add('2', 3), TypeError);
});

test('subtract returns the difference', () => {
  assert.strictEqual(subtract(5, 3), 2);
  assert.strictEqual(subtract(0, 4), -4);
});

test('subtract rejects non-numbers', () => {
  assert.throws(() => subtract(5, null), TypeError);
});
