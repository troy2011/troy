'use strict';

const { channel } = require('node:diagnostics_channel');
const { AsyncLocalStorage } = require('node:async_hooks');
const captureContext = new AsyncLocalStorage();
const START = channel('http.client.request.start');
const FINISH = channel('http.client.response.finish');

const OPERATIONS = new Set(['ensureTitleEntityToken', 'GetEntityToken', 'SearchItems', 'GetItems', 'NormalizeCatalog']);
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function describePlayFabCatalogFailure(operation, error, searchPage, http) {
    const stage = OPERATIONS.has(operation) ? operation : 'unknown';
    const info = { stage, kind: 'local_or_unknown' };
    if (stage === 'SearchItems' && Number.isSafeInteger(searchPage) && searchPage > 0) info.page = searchPage;
    const envelopeCode = Number.isInteger(error?.code) && error.code >= 100 && error.code <= 599 ? error.code : null;
    const errorCode = Number.isInteger(error?.errorCode) && error.errorCode >= 0 && error.errorCode <= 65535 ? error.errorCode : null;
    // The npm SDK discards HTTP metadata and uses this synthetic tuple for both non-JSON replies and socket failures.
    if (envelopeCode === 503 && errorCode === 2 && error?.error === 'Connection error') {
        info.kind = 'sdk_non_json_or_transport';
    } else if (envelopeCode !== null || errorCode !== null) {
        info.kind = 'playfab_envelope';
        if (envelopeCode !== null) info.envelopeCode = envelopeCode;
        if (errorCode !== null) info.playFabErrorCode = errorCode;
    }
    // A fixed label is safe even when the SDK puts arbitrary response text in errorMessage.
    if (typeof error?.errorMessage === 'string' && /request blocked due to incorrect formatting/i.test(error.errorMessage.slice(0, 16384))) {
        info.signal = 'upstream_request_blocked';
    }
    if (Number.isInteger(http?.httpStatus) && http.httpStatus >= 100 && http.httpStatus <= 599) info.httpStatus = http.httpStatus;
    // Only typed UUID-format request identifiers, never raw headers, response text, tokens, entity or title IDs.
    const requestIds = [http?.requestId];
    if (stage !== 'GetEntityToken' && stage !== 'ensureTitleEntityToken') {
        requestIds.push(error?.requestId, error?.RequestId, error?.correlationId, error?.CorrelationId);
    }
    for (const value of requestIds) {
        if (typeof value === 'string' && REQUEST_ID.test(value)) { info.requestId = value; break; }
    }
    return info;
}

async function observeHttpResponse(target, out, run) {
    if (!target) return run();
    const owned = new WeakSet();
    const context = {};
    function started({ request }) {
        if (captureContext.getStore() !== context || request.method !== 'POST' || request.path?.split('?', 1)[0] !== target.path) return;
        const host = request.getHeader('host');
        if (typeof host === 'string' && host.toLowerCase() === target.host) owned.add(request);
    }
    function finished({ request, response }) {
        if (!owned.has(request)) return;
        out.httpStatus = response.statusCode;
        const headers = response.headers || {};
        for (const name of ['x-playfab-request-id', 'x-ms-request-id', 'x-ms-correlation-request-id', 'x-request-id']) {
            const value = headers[name];
            if (typeof value === 'string' && REQUEST_ID.test(value)) { out.requestId = value; break; }
        }
    }
    START.subscribe(started);
    FINISH.subscribe(finished);
    try { return await captureContext.run(context, run); }
    finally { START.unsubscribe(started); FINISH.unsubscribe(finished); }
}

function playFabTarget(sdk, path) {
    try {
        // The pinned package exposes the transport under the nested PlayFab export.
        const parsed = new URL(sdk.PlayFab.GetServerUrl());
        if (parsed.protocol === 'https:' && /^[a-z0-9]+\.playfabapi\.com$/i.test(parsed.hostname) && !parsed.port && parsed.pathname === '/') {
            return { host: parsed.host.toLowerCase(), path };
        }
    } catch { /* Preserve the existing SDK behavior for invalid configuration. */ }
    return null;
}

const catalogSearchTarget = sdk => playFabTarget(sdk, '/Catalog/SearchItems');
const authenticationTokenTarget = sdk => playFabTarget(sdk, '/Authentication/GetEntityToken');

module.exports = { describePlayFabCatalogFailure, observeHttpResponse, catalogSearchTarget, authenticationTokenTarget };
