'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const guard = path.join(__dirname, 'no-external-services.cjs');

test('PlayFab SDK calls and submodule imports resolve to a local fake', () => {
  const child = spawnSync(process.execPath, ['--require', guard, '-e', "for(const api of [require('playfab-sdk').PlayFabServer,require('playfab-sdk/Scripts/PlayFab/PlayFabServer')])api.GetUserReadOnlyData({},(error)=>{if(error?.error!=='TestPlayFabStub')process.exitCode=2})"], { encoding: 'utf8' });
  assert.equal(child.status, 0);
});

for (const [name, operation] of [
  ['HTTP', "require('node:http').get('http://example.invalid')"],
  ['HTTPS', "require('node:https').request('https://example.invalid')"],
  ['socket', "require('node:net').connect(443,'example.invalid')"],
  ['fetch', "fetch('https://example.invalid')"]
]) {
  test(`${name} is stopped before sending, even if the caller catches it`, () => {
    const code = `try { ${operation}; } catch (error) { console.error(error.message); }`;
    const child = spawnSync(process.execPath, ['--require', guard, '-e', code], { encoding: 'utf8' });
    assert.equal(child.status, 1); assert.match(child.stderr, /ExternalServiceBlocked/);
  });
}
