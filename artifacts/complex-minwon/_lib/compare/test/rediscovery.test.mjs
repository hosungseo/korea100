import test from 'node:test';
import assert from 'node:assert/strict';
import { rediscovered, isolated } from '../check-rediscovery.mjs';

const procs = [
  { pid: 'a', legal: [{ law: 'X법', article: '제26조제1항' }] },
  { pid: 'b', legal: [{ law: 'X법', article: '제11조제5항' }] },
  { pid: 'c', legal: [{ law: 'Y법', article: '제1조' }] },
];
const target = { name: 't', must: [{ law: 'X법', article: '제26조' }, { law: 'X법', article: '제11조' }], minMatch: 2 };

test('a cluster containing procedures for at least minMatch must-articles counts as rediscovered', () => {
  assert.equal(rediscovered(target, [{ cid: 'k', pids: ['a', 'b'] }], procs).found, 'k');
  assert.equal(rediscovered(target, [{ cid: 'k', pids: ['a', 'c'] }], procs).found, null);
});

test('isolated reports a cluster mixing the isolated milestone with others', () => {
  assert.equal(isolated('N32', [{ cid: 'k', pids: ['N32:a:P01', 'N14:b:P02'] }]), 'k');
  assert.equal(isolated('N32', [{ cid: 'k', pids: ['N32:a:P01', 'N32:a:P02'] }, { cid: 'j', pids: ['N14:b:P01', 'N11:c:P01'] }]), null);
});

test('article match is prefix-based on the same law', () => {
  assert.equal(rediscovered({ ...target, must: [{ law: 'X법', article: '제26조' }], minMatch: 1 }, [{ cid: 'k', pids: ['a'] }], procs).found, 'k');
  assert.equal(rediscovered({ ...target, must: [{ law: 'Z법', article: '제26조' }], minMatch: 1 }, [{ cid: 'k', pids: ['a'] }], procs).found, null);
});
