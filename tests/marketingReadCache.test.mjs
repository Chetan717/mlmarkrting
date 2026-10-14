import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cachedMarketingRead,
  getSuccessfulSubscriptionRows,
  invalidateMarketingRead,
  clearMarketingReadCache,
} from '../src/Utils/marketingReadCache.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('same user and same query reuse reads, but different users never share', async () => {
  clearMarketingReadCache();
  let calls = 0;
  const load = async () => { calls++; return [{ id: calls }]; };
  assert.equal((await cachedMarketingRead('uid1', 'members', load))[0].id, 1);
  assert.equal((await cachedMarketingRead('uid1', 'members', load))[0].id, 1);
  assert.equal((await cachedMarketingRead('uid2', 'members', load))[0].id, 2);
  assert.equal(calls, 2);
});

test('without a Firebase user no data is cached', async () => {
  clearMarketingReadCache();
  let calls = 0;
  for (let i = 0; i < 2; i++) await cachedMarketingRead(null, 'team', () => ++calls);
  assert.equal(calls, 2);
});

test('force refresh and invalidation fetch again', async () => {
  clearMarketingReadCache();
  let calls = 0;
  const load = async () => [++calls];
  await cachedMarketingRead('owner', 'members', load);
  assert.deepEqual(await cachedMarketingRead('owner', 'members', load, {force:true}), [2]);
  invalidateMarketingRead('owner', 'members');
  assert.deepEqual(await cachedMarketingRead('owner', 'members', load), [3]);
});

test('concurrent identical reads share one query, and failure never cached', async () => {
  clearMarketingReadCache();
  let calls = 0;
  const load = async () => { calls++; await sleep(5); return ['ok']; };
  const vals = await Promise.all([cachedMarketingRead('owner','same',load), cachedMarketingRead('owner','same',load)]);
  assert.deepEqual(vals, [['ok'],['ok']]); assert.equal(calls,1);
  let attempts = 0;
  await assert.rejects(cachedMarketingRead('owner','error',async()=>{ attempts++; throw Error('oops'); }));
  await assert.rejects(cachedMarketingRead('owner','error',async()=>{ attempts++; throw Error('oops'); }));
  assert.equal(attempts,2);
});

test('invalidation during in-flight query cannot install stale cache', async () => {
  clearMarketingReadCache();
  let resolveFirst;
  const p = cachedMarketingRead('owner','lead', () => new Promise(resolve=>{resolveFirst=resolve;}));
  await sleep(0);
  invalidateMarketingRead('owner','lead');
  assert.deepEqual(await cachedMarketingRead('owner','lead', async()=>['new']), ['new']);
  resolveFirst(['old']);
  assert.deepEqual(await p, ['old']);
  assert.deepEqual(await cachedMarketingRead('owner','lead',async()=>['bad']), ['new']);
});

test('huge result sets are deliberately not held in cache', async () => {
  clearMarketingReadCache();
  let calls = 0;
  const load = async () => { calls++; return [1,2,3]; };
  await cachedMarketingRead('owner','big',load,{maxRows:2});
  await cachedMarketingRead('owner','big',load,{maxRows:2});
  assert.equal(calls,2);
});

test('different collection sources with same coupon never cross-contaminate', async () => {
  clearMarketingReadCache();
  const common = {uid:'owner',couponCode:'ABC'};
  const a = await getSuccessfulSubscriptionRows({...common,source:'subsA',load:async()=>['a']});
  const b = await getSuccessfulSubscriptionRows({...common,source:'subsB',load:async()=>['b']});
  assert.deepEqual(a,['a']); assert.deepEqual(b,['b']);
});
