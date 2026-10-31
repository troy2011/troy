'use strict';
if (globalThis.__troyExternalServicesBlocked) return;
globalThis.__troyExternalServicesBlocked = true;

// Test-only preload: never load the PlayFab SDK or permit an outgoing socket.
// An unexpected call fails the worker even if application code catches it.
const Module = require('node:module');
const originalLoad = Module._load;
function blocked(kind) {
  process.exitCode = 1;
  throw new Error(`ExternalServiceBlocked: ${kind}`);
}
const fakeApi = new Proxy({}, { get: (_target, name) => (...args) => {
  const callback = args.findLast(value => typeof value === 'function');
  const error = { error: 'TestPlayFabStub', errorMessage: `TestPlayFabStub: ${String(name)}` };
  if (callback) return callback(error, null);
  throw new Error(error.errorMessage);
} });
const fakePlayFab = { settings: {}, _internalSettings: {}, PlayFabServer: fakeApi, PlayFabAdmin: fakeApi,
  PlayFabAuthentication: fakeApi, PlayFabGroups: fakeApi, PlayFabData: fakeApi, PlayFabEconomy: fakeApi,
  PlayFabClient: fakeApi };
Module._load = function (request, parent, isMain) {
  if (request === 'playfab-sdk') return fakePlayFab;
  if (typeof request === 'string' && request.startsWith('playfab-sdk/')) return fakeApi;
  if (typeof request === 'string' && /[\\/]node_modules[\\/]playfab-sdk(?:[\\/]|$)/i.test(request))
    return /[\\/]playfab-sdk(?:[\\/]index\.js)?$/i.test(request) ? fakePlayFab : fakeApi;
  return originalLoad.call(this, request, parent, isMain);
};
const http = require('node:http'), https = require('node:https'), net = require('node:net');
for (const [name, module] of [['http', http], ['https', https]]) {
  module.request = () => blocked(`${name}.request`);
  module.get = () => blocked(`${name}.get`);
  module.Agent.prototype.addRequest = () => blocked(`${name}.Agent.addRequest`);
}
net.connect = net.createConnection = () => blocked('net.connect');
net.Socket.prototype.connect = () => blocked('socket.connect');
globalThis.fetch = () => blocked('fetch');
if ('WebSocket' in globalThis) globalThis.WebSocket = class { constructor() { blocked('WebSocket'); } };
