import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFallbackSummary, summarizeRunnerSamples } from '../../../scripts/ci/summarize-runner-fallback.mjs';

test('attempt summary shows timeout path and final execution runner', () => {
  const text=buildFallbackSummary({status:'started',runner:'ubuntu-latest',attempts:[
    {attempt:1,runner:'ubuntu-24.04-arm',queueSeconds:45,outcome:'cancelled-after-timeout'},
    {attempt:2,runner:'ubuntu-latest',queueSeconds:7,outcome:'started'},
  ]});
  assert.match(text,/ubuntu-24\.04-arm.*45.*cancelled-after-timeout/s);
  assert.match(text,/Final execution runner:\s*`ubuntu-latest`/);
});

test('benchmark aggregation reports median queue execution total and success rate', () => {
  const rows=summarizeRunnerSamples([
    {runner:'ubuntu-latest',queuedAt:0,startedAt:10,completedAt:40,conclusion:'success'},
    {runner:'ubuntu-latest',queuedAt:100,startedAt:120,completedAt:170,conclusion:'success'},
    {runner:'windows-latest',queuedAt:0,startedAt:5,completedAt:55,conclusion:'failure'},
  ]);
  assert.deepEqual(rows[0],{runner:'ubuntu-latest',samples:2,medianQueueSeconds:15,medianExecutionSeconds:40,medianTotalSeconds:55,successRate:1});
  assert.equal(rows[1].runner,'windows-latest'); assert.equal(rows[1].successRate,0);
});
