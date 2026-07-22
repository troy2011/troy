const crypto = require('node:crypto');

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BUSINESS_INFORMATION_API_BASE_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const DEFAULT_TIMEOUT_MS = 10_000;
const VALIDATED_SPECIAL_HOURS_TICKET_TTL_MS = 60_000;
const MAX_LOCATION_PAGE_SIZE = 100;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LOCATION_ENV_DESCRIPTION = 'GOOGLE_BUSINESS_PROFILE_LOCATION_NAME or GOOGLE_BUSINESS_PROFILE_LOCATION_ID';
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

class GoogleBusinessProfileError extends Error {
    constructor(message, {
        code = 'GOOGLE_BUSINESS_PROFILE_ERROR',
        status = 0,
        retryable = false,
        details,
        cause
    } = {}) {
        super(String(message || 'Google Business Profile operation failed.'), cause ? { cause } : undefined);
        this.name = 'GoogleBusinessProfileError';
        this.code = String(code || 'GOOGLE_BUSINESS_PROFILE_ERROR');
        this.status = Number.isFinite(Number(status)) ? Number(status) : 0;
        this.statusCode = this.status;
        this.httpStatus = this.status;
        this.retryable = retryable === true;
        if (details !== undefined) this.details = details;
        if (Error.captureStackTrace) Error.captureStackTrace(this, GoogleBusinessProfileError);
    }
}

function validationError(message, details, code = 'GBP_VALIDATION_ERROR') {
    return new GoogleBusinessProfileError(message, {
        code,
        status: 400,
        retryable: false,
        details
    });
}

function parseBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) return true;
    if (FALSE_VALUES.has(normalized)) return false;
    return fallback;
}

function normalizeLocationName(value) {
    let raw = String(value || '').trim();
    if (!raw) return '';

    if (/^https?:\/\//i.test(raw)) {
        try {
            raw = new URL(raw).pathname;
        } catch {
            return '';
        }
    }

    raw = raw.replace(/^\/+|\/+$/g, '');
    const namedMatch = raw.match(/(?:^|\/)locations\/([^/?#\s]+)$/i);
    const locationId = namedMatch ? namedMatch[1] : (/^[^/?#\s]+$/.test(raw) ? raw : '');
    return locationId ? `locations/${locationId}` : '';
}

function readGoogleBusinessProfileConfig(env = process.env) {
    const source = env && typeof env === 'object' ? env : {};
    const enabled = parseBoolean(source.GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED, false);
    const locationName = normalizeLocationName(source.GOOGLE_BUSINESS_PROFILE_LOCATION_NAME)
        || normalizeLocationName(source.GOOGLE_BUSINESS_PROFILE_LOCATION_ID);
    const allowedLocationName = normalizeLocationName(
        source.GOOGLE_BUSINESS_PROFILE_ALLOWED_LOCATION_NAME
    );
    const clientId = String(source.GOOGLE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(source.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
    const refreshToken = String(source.GOOGLE_OAUTH_REFRESH_TOKEN || '').trim();
    const timeoutCandidate = Number(source.GOOGLE_BUSINESS_PROFILE_REQUEST_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0
        ? Math.floor(timeoutCandidate)
        : DEFAULT_TIMEOUT_MS;
    const validateOnly = parseBoolean(source.GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY, true);
    const validateBeforeUpdate = parseBoolean(source.GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE, false);
    const productionWritesEnabled = parseBoolean(
        source.GOOGLE_BUSINESS_PROFILE_PRODUCTION_WRITES_ENABLED,
        false
    );
    const missing = [];

    if (!locationName) missing.push(LOCATION_ENV_DESCRIPTION);
    if (!clientId) missing.push('GOOGLE_OAUTH_CLIENT_ID');
    if (!clientSecret) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
    if (!refreshToken) missing.push('GOOGLE_OAUTH_REFRESH_TOKEN');
    if (enabled && !allowedLocationName) {
        missing.push('GOOGLE_BUSINESS_PROFILE_ALLOWED_LOCATION_NAME');
    } else if (enabled && locationName && allowedLocationName !== locationName) {
        missing.push('GOOGLE_BUSINESS_PROFILE_ALLOWED_LOCATION_NAME must match the configured location');
    }
    if (!validateOnly && !productionWritesEnabled) {
        missing.push('GOOGLE_BUSINESS_PROFILE_PRODUCTION_WRITES_ENABLED=true');
    }
    if (!validateOnly && !validateBeforeUpdate) {
        missing.push('GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE=true');
    }

    return {
        enabled,
        configured: missing.length === 0,
        missing,
        locationName,
        allowedLocationName,
        clientId,
        clientSecret,
        refreshToken,
        validateOnly,
        validateBeforeUpdate,
        productionWritesEnabled,
        timeoutMs
    };
}

function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidDateParts(year, month, day) {
    return Number.isInteger(year)
        && Number.isInteger(month)
        && Number.isInteger(day)
        && year >= 1
        && year <= 9999
        && month >= 1
        && month <= 12
        && day >= 1
        && day <= daysInMonth(year, month);
}

function parseDateText(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw validationError(`Invalid calendar date "${raw}"; expected YYYY-MM-DD.`, { value: raw });
    const date = {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
    };
    if (!isValidDateParts(date.year, date.month, date.day)) {
        throw validationError(`Invalid calendar date "${raw}".`, { value: raw });
    }
    return date;
}

function parseTimeText(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{2}):(\d{2})$/);
    if (!match) throw validationError(`Invalid calendar time "${raw}"; expected HH:mm.`, { value: raw });
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw validationError(`Invalid calendar time "${raw}".`, { value: raw });
    }
    return { hours, minutes };
}

function dateObjectToKey(value) {
    const year = Number(value?.year);
    const month = Number(value?.month);
    const day = Number(value?.day);
    if (!isValidDateParts(year, month, day)) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysToDateObject(value, days = 1) {
    const dateKey = dateObjectToKey(value);
    const dayCount = Number(days);
    if (!dateKey || !Number.isInteger(dayCount)) {
        throw validationError('A valid date and an integer day offset are required.', { value, days });
    }
    const date = new Date(Date.UTC(value.year, value.month - 1, value.day + dayCount));
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate()
    };
}

function getJstTodayKey(nowMs = Date.now()) {
    const numericNow = Number(nowMs);
    const safeNow = Number.isFinite(numericNow) ? numericNow : Date.now();
    const date = new Date(safeNow + JST_OFFSET_MS);
    return dateObjectToKey({
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate()
    });
}

function minutesSinceMidnight(time) {
    return (Number(time.hours) * 60) + Number(time.minutes);
}

function updatedAtMsOf(entry) {
    const value = Number(entry?.updatedAtMs);
    return Number.isFinite(value) ? value : 0;
}

function buildDesiredSpecialHours(entries, { nowMs = Date.now() } = {}) {
    if (!Array.isArray(entries)) {
        throw validationError('Calendar entries must be an array.');
    }

    const latestByDate = new Map();
    for (const entry of entries) {
        const date = parseDateText(entry?.date);
        const dateKey = dateObjectToKey(date);
        const current = latestByDate.get(dateKey);
        if (!current || updatedAtMsOf(entry) >= updatedAtMsOf(current)) {
            latestByDate.set(dateKey, entry);
        }
    }

    const todayKey = getJstTodayKey(nowMs);
    const yesterdayKey = dateObjectToKey(addDaysToDateObject(parseDateText(todayKey), -1));
    const numericNowMs = Number(nowMs);
    const safeNowMs = Number.isFinite(numericNowMs) ? numericNowMs : Date.now();
    const managedDates = [];
    const specialHourPeriods = [];

    for (const dateKey of [...latestByDate.keys()].sort()) {
        const entry = latestByDate.get(dateKey);
        const status = String(entry?.status || 'open').trim().toLowerCase();
        if (dateKey < todayKey) {
            if (dateKey !== yesterdayKey || status !== 'open') continue;
            const previousOpenTime = parseTimeText(entry?.openTime);
            const previousCloseTime = parseTimeText(entry?.closeTime);
            const previousOpenMinutes = minutesSinceMidnight(previousOpenTime);
            const previousCloseMinutes = minutesSinceMidnight(previousCloseTime);
            if (previousCloseMinutes > previousOpenMinutes) continue;
            const previousStartDate = parseDateText(dateKey);
            const previousEndDate = addDaysToDateObject(previousStartDate, 1);
            const previousCloseAtMs = Date.UTC(
                previousEndDate.year,
                previousEndDate.month - 1,
                previousEndDate.day,
                previousCloseTime.hours,
                previousCloseTime.minutes
            ) - JST_OFFSET_MS;
            if (safeNowMs >= previousCloseAtMs) continue;
        }
        const startDate = parseDateText(dateKey);
        managedDates.push(dateKey);

        if (status === 'tentative') continue;
        if (status === 'closed' || status === 'private') {
            specialHourPeriods.push({ startDate, closed: true });
            continue;
        }
        if (status !== 'open') {
            throw validationError(`Unsupported calendar status "${status}" on ${dateKey}.`, {
                date: dateKey,
                status
            });
        }

        const openTime = parseTimeText(entry?.openTime);
        const closeTime = parseTimeText(entry?.closeTime);
        const openMinutes = minutesSinceMidnight(openTime);
        const closeMinutes = minutesSinceMidnight(closeTime);
        const overnight = closeMinutes <= openMinutes;
        let endDate = startDate;

        if (overnight) {
            const durationMinutes = (24 * 60 - openMinutes) + closeMinutes;
            if (closeMinutes >= 12 * 60 || durationMinutes >= 24 * 60) {
                throw validationError(
                    `Invalid overnight hours on ${dateKey}: next-day closing time must be before 12:00 and the period must be shorter than 24 hours.`,
                    {
                        date: dateKey,
                        openTime: entry?.openTime,
                        closeTime: entry?.closeTime,
                        durationMinutes
                    },
                    'GBP_INVALID_OVERNIGHT_HOURS'
                );
            }
            endDate = addDaysToDateObject(startDate, 1);
        }

        specialHourPeriods.push({
            startDate,
            openTime,
            endDate,
            closeTime
        });
    }

    return {
        specialHourPeriods,
        managedDates
    };
}

function normalizeCanonicalDate(value) {
    const year = Number(value?.year);
    const month = Number(value?.month);
    const day = Number(value?.day);
    return {
        year: Number.isInteger(year) ? year : 0,
        month: Number.isInteger(month) ? month : 0,
        day: Number.isInteger(day) ? day : 0
    };
}

function normalizeCanonicalTime(value) {
    const result = {
        hours: Number.isInteger(Number(value?.hours)) ? Number(value.hours) : 0,
        minutes: Number.isInteger(Number(value?.minutes)) ? Number(value.minutes) : 0
    };
    const seconds = Number(value?.seconds);
    const nanos = Number(value?.nanos);
    if (Number.isInteger(seconds) && seconds !== 0) result.seconds = seconds;
    if (Number.isInteger(nanos) && nanos !== 0) result.nanos = nanos;
    return result;
}

function normalizePeriodsInput(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.specialHourPeriods)) return value.specialHourPeriods;
    if (Array.isArray(value?.specialHours?.specialHourPeriods)) return value.specialHours.specialHourPeriods;
    return [];
}

function canonicalizeSpecialHourPeriod(period) {
    const startDate = normalizeCanonicalDate(period?.startDate);
    if (period?.closed === true || period?.closed === 'true') {
        return { startDate, closed: true };
    }
    const suppliedEndDate = normalizeCanonicalDate(period?.endDate);
    const endDate = dateObjectToKey(suppliedEndDate) ? suppliedEndDate : { ...startDate };
    return {
        startDate,
        openTime: normalizeCanonicalTime(period?.openTime),
        endDate,
        closeTime: normalizeCanonicalTime(period?.closeTime)
    };
}

function canonicalPeriodSortKey(period) {
    const canonical = canonicalizeSpecialHourPeriod(period);
    const start = dateObjectToKey(canonical.startDate) || '0000-00-00';
    const closed = canonical.closed === true ? '0' : '1';
    const open = canonical.openTime
        ? `${String(canonical.openTime.hours).padStart(2, '0')}:${String(canonical.openTime.minutes).padStart(2, '0')}`
        : '00:00';
    const end = canonical.endDate ? (dateObjectToKey(canonical.endDate) || '0000-00-00') : start;
    const close = canonical.closeTime
        ? `${String(canonical.closeTime.hours).padStart(2, '0')}:${String(canonical.closeTime.minutes).padStart(2, '0')}`
        : '00:00';
    return `${start}|${closed}|${open}|${end}|${close}|${JSON.stringify(canonical)}`;
}

function stableSortSpecialHourPeriods(periods) {
    return normalizePeriodsInput(periods)
        .map((period, index) => ({ period, index, key: canonicalPeriodSortKey(period) }))
        .sort((left, right) => left.key.localeCompare(right.key) || left.index - right.index)
        .map(({ period }) => period);
}

function canonicalizeSpecialHourPeriods(periods) {
    return stableSortSpecialHourPeriods(periods).map(canonicalizeSpecialHourPeriod);
}

function stableStringifySpecialHourPeriods(periods) {
    return JSON.stringify(canonicalizeSpecialHourPeriods(periods));
}

function specialHourPeriodsEqual(left, right) {
    return stableStringifySpecialHourPeriods(left) === stableStringifySpecialHourPeriods(right);
}

function hashSpecialHourPeriods(periods) {
    return crypto.createHash('sha256').update(stableStringifySpecialHourPeriods(periods)).digest('hex');
}

function toManagedDateSet(values) {
    const result = new Set();
    const source = values instanceof Set ? [...values] : (Array.isArray(values) ? values : []);
    for (const value of source) {
        const key = typeof value === 'string' ? value.trim() : dateObjectToKey(value);
        if (/^\d{4}-\d{2}-\d{2}$/.test(key)) result.add(key);
    }
    return result;
}

function mergeSpecialHourPeriods(
    remotePeriods,
    desiredPeriodsOrResult,
    previousManagedDatesOrOptions = [],
    currentManagedDatesArgument = []
) {
    let desiredPeriods = desiredPeriodsOrResult;
    let previousManagedDates = previousManagedDatesOrOptions;
    let currentManagedDates = currentManagedDatesArgument;

    if (!Array.isArray(desiredPeriodsOrResult) && desiredPeriodsOrResult && typeof desiredPeriodsOrResult === 'object') {
        desiredPeriods = desiredPeriodsOrResult.specialHourPeriods;
        if (arguments.length < 4) currentManagedDates = desiredPeriodsOrResult.managedDates;
    }
    if (!(previousManagedDatesOrOptions instanceof Set)
        && !Array.isArray(previousManagedDatesOrOptions)
        && previousManagedDatesOrOptions
        && typeof previousManagedDatesOrOptions === 'object') {
        previousManagedDates = previousManagedDatesOrOptions.previousManagedDates;
        currentManagedDates = previousManagedDatesOrOptions.currentManagedDates
            || previousManagedDatesOrOptions.managedDates
            || currentManagedDates;
    }

    const replacedDates = toManagedDateSet(previousManagedDates);
    for (const date of toManagedDateSet(currentManagedDates)) replacedDates.add(date);

    const retainedRemotePeriods = normalizePeriodsInput(remotePeriods).filter((period) => {
        const startDateKey = dateObjectToKey(period?.startDate);
        return !startDateKey || !replacedDates.has(startDateKey);
    });
    return stableSortSpecialHourPeriods([
        ...retainedRemotePeriods,
        ...normalizePeriodsInput(desiredPeriods)
    ]);
}

function isRetryableHttpStatus(status) {
    const numericStatus = Number(status);
    return numericStatus === 429 || numericStatus >= 500;
}

function responseErrorDetails(payload) {
    if (!payload || typeof payload !== 'object') return {};
    if (payload.error && typeof payload.error === 'object') return payload.error;
    return payload;
}

function errorFromHttpResponse(response, payload, operation) {
    const status = Number(response?.status || 0);
    const details = responseErrorDetails(payload);
    const code = details.status || details.error || `GBP_HTTP_${status || 'ERROR'}`;
    const message = details.message
        || details.error_description
        || (typeof payload === 'string' && payload.trim())
        || `${operation || 'Google Business Profile request'} failed with HTTP ${status || 'error'}.`;
    const error = new GoogleBusinessProfileError(message, {
        code,
        status,
        retryable: isRetryableHttpStatus(status),
        details: payload
    });
    if (Number.isFinite(Number(details.code))) error.googleCode = Number(details.code);
    if (details.status) error.googleStatus = String(details.status);
    return error;
}

async function readResponsePayload(response) {
    if (typeof response?.text === 'function') {
        const text = await response.text();
        if (!text) return {};
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }
    if (typeof response?.json === 'function') return response.json();
    return {};
}

function normalizeClientArguments(configOrOptions, maybeOptions) {
    if (configOrOptions?.config && typeof configOrOptions.config === 'object') {
        return {
            configInput: configOrOptions.config,
            options: { ...configOrOptions, ...(maybeOptions || {}) }
        };
    }
    const looksLikeOptionsOnly = configOrOptions
        && typeof configOrOptions === 'object'
        && !('clientId' in configOrOptions)
        && !('refreshToken' in configOrOptions)
        && !('locationName' in configOrOptions)
        && ('fetchImpl' in configOrOptions || 'fetch' in configOrOptions || 'now' in configOrOptions);
    if (looksLikeOptionsOnly) {
        return { configInput: null, options: { ...configOrOptions, ...(maybeOptions || {}) } };
    }
    return { configInput: configOrOptions, options: maybeOptions || {} };
}

function createGoogleBusinessProfileClient(configOrOptions, maybeOptions) {
    const { configInput, options } = normalizeClientArguments(configOrOptions, maybeOptions);
    const environmentConfig = readGoogleBusinessProfileConfig(options.env || process.env);
    const suppliedConfig = configInput && typeof configInput === 'object' ? configInput : {};
    const mergedConfig = { ...environmentConfig, ...suppliedConfig };
    const config = {
        ...mergedConfig,
        locationName: normalizeLocationName(mergedConfig.locationName || mergedConfig.locationId),
        clientId: String(mergedConfig.clientId || mergedConfig.oauthClientId || '').trim(),
        clientSecret: String(mergedConfig.clientSecret || mergedConfig.oauthClientSecret || '').trim(),
        refreshToken: String(mergedConfig.refreshToken || mergedConfig.oauthRefreshToken || '').trim(),
        validateOnly: parseBoolean(mergedConfig.validateOnly, false),
        validateBeforeUpdate: parseBoolean(mergedConfig.validateBeforeUpdate, false),
        productionWritesEnabled: parseBoolean(mergedConfig.productionWritesEnabled, false)
    };
    const fetchImpl = options.fetchImpl || options.fetch || globalThis.fetch;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const timeoutCandidate = Number(options.timeoutMs || config.timeoutMs || DEFAULT_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0
        ? Math.floor(timeoutCandidate)
        : DEFAULT_TIMEOUT_MS;
    const tokenUrl = String(options.tokenUrl || OAUTH_TOKEN_URL);
    const apiBaseUrl = String(options.apiBaseUrl || BUSINESS_INFORMATION_API_BASE_URL).replace(/\/+$/, '');

    let accessTokenCache = null;
    let tokenRefreshPromise = null;
    const validatedSpecialHoursTickets = new WeakSet();

    function requireFetcher() {
        if (typeof fetchImpl !== 'function') {
            throw new GoogleBusinessProfileError('Node.js fetch is unavailable.', {
                code: 'GBP_FETCH_UNAVAILABLE',
                status: 0,
                retryable: false
            });
        }
    }

    function requireCredentials() {
        const missing = [];
        if (!config.clientId) missing.push('GOOGLE_OAUTH_CLIENT_ID');
        if (!config.clientSecret) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
        if (!config.refreshToken) missing.push('GOOGLE_OAUTH_REFRESH_TOKEN');
        if (missing.length > 0) {
            throw new GoogleBusinessProfileError(`Google OAuth configuration is incomplete: ${missing.join(', ')}.`, {
                code: 'GBP_NOT_CONFIGURED',
                status: 400,
                retryable: false,
                details: { missing }
            });
        }
    }

    function requireLocationName() {
        if (config.locationName) return config.locationName;
        throw new GoogleBusinessProfileError(`Missing ${LOCATION_ENV_DESCRIPTION}.`, {
            code: 'GBP_LOCATION_REQUIRED',
            status: 400,
            retryable: false
        });
    }

    async function requestJson(url, init, operation) {
        requireFetcher();
        const controller = new AbortController();
        let didTimeout = false;
        let timeout;
        const timeoutPromise = new Promise((resolve, reject) => {
            timeout = setTimeout(() => {
                didTimeout = true;
                controller.abort();
                const error = new Error(`${operation || 'Google Business Profile request'} timed out.`);
                error.name = 'AbortError';
                reject(error);
            }, timeoutMs);
        });
        let response;
        try {
            const fetchPromise = Promise.resolve().then(() => fetchImpl(url, { ...init, signal: controller.signal }));
            response = await Promise.race([fetchPromise, timeoutPromise]);
            const payload = await readResponsePayload(response);
            const status = Number(response?.status || 0);
            const ok = typeof response?.ok === 'boolean'
                ? response.ok
                : status >= 200 && status < 300;
            if (!ok) throw errorFromHttpResponse(response, payload, operation);
            return payload;
        } catch (error) {
            if (error instanceof GoogleBusinessProfileError) throw error;
            const timedOut = didTimeout || controller.signal.aborted || error?.name === 'AbortError';
            throw new GoogleBusinessProfileError(
                timedOut
                    ? `${operation || 'Google Business Profile request'} timed out after ${timeoutMs} ms.`
                    : `${operation || 'Google Business Profile request'} failed: ${error?.message || 'network error'}.`,
                {
                    code: timedOut ? 'GBP_TIMEOUT' : 'GBP_NETWORK_ERROR',
                    status: 0,
                    retryable: true,
                    cause: error
                }
            );
        } finally {
            clearTimeout(timeout);
        }
    }

    async function refreshAccessToken() {
        requireCredentials();
        const body = new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: config.refreshToken,
            grant_type: 'refresh_token'
        });
        const payload = await requestJson(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        }, 'Google OAuth token refresh');
        const accessToken = String(payload?.access_token || '').trim();
        if (!accessToken) {
            throw new GoogleBusinessProfileError('Google OAuth token response did not contain an access token.', {
                code: 'GBP_OAUTH_TOKEN_INVALID',
                status: 200,
                retryable: false,
                details: payload
            });
        }
        const expiresInSeconds = Number(payload?.expires_in);
        const lifetimeMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
            ? expiresInSeconds * 1000
            : 60 * 60 * 1000;
        const refreshSkewMs = Math.min(60_000, Math.max(1_000, Math.floor(lifetimeMs * 0.1)));
        accessTokenCache = {
            accessToken,
            refreshAtMs: Number(now()) + Math.max(0, lifetimeMs - refreshSkewMs)
        };
        return accessToken;
    }

    async function getAccessToken() {
        const currentMs = Number(now());
        if (accessTokenCache && Number.isFinite(currentMs) && currentMs < accessTokenCache.refreshAtMs) {
            return accessTokenCache.accessToken;
        }
        if (!tokenRefreshPromise) {
            tokenRefreshPromise = refreshAccessToken().finally(() => {
                tokenRefreshPromise = null;
            });
        }
        return tokenRefreshPromise;
    }

    async function requestBusinessInformation(path, { method = 'GET', query, body } = {}) {
        const url = new URL(`${apiBaseUrl}/${String(path || '').replace(/^\/+/, '')}`);
        for (const [key, value] of Object.entries(query || {})) {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
        }
        async function send(accessToken) {
            const headers = {
                Authorization: `Bearer ${accessToken}`,
                'X-GOOG-API-FORMAT-VERSION': '2'
            };
            if (body !== undefined) headers['Content-Type'] = 'application/json';
            return requestJson(url.toString(), {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body)
            }, `Google Business Information ${method}`);
        }

        const accessToken = await getAccessToken();
        try {
            return await send(accessToken);
        } catch (error) {
            if (!(error instanceof GoogleBusinessProfileError) || error.status !== 401) throw error;
            accessTokenCache = null;
            const refreshedAccessToken = await getAccessToken();
            return send(refreshedAccessToken);
        }
    }

    async function getLocation() {
        const locationName = requireLocationName();
        return requestBusinessInformation(locationName, {
            query: { readMask: 'regularHours,specialHours,metadata' }
        });
    }

    async function getGoogleUpdatedLocation() {
        const locationName = requireLocationName();
        return requestBusinessInformation(`${locationName}:getGoogleUpdated`, {
            query: { readMask: 'specialHours' }
        });
    }

    async function sendSpecialHoursPatch(periods, { validateOnly = false } = {}) {
        if (!Array.isArray(periods)) throw validationError('Special-hour periods must be an array.');
        const locationName = requireLocationName();
        return requestBusinessInformation(locationName, {
            method: 'PATCH',
            query: {
                updateMask: 'specialHours',
                validateOnly: validateOnly ? 'true' : undefined
            },
            body: {
                name: locationName,
                specialHours: {
                    specialHourPeriods: canonicalizeSpecialHourPeriods(periods)
                }
            }
        });
    }

    async function createValidatedSpecialHoursTicket(periods) {
        const canonicalPeriods = canonicalizeSpecialHourPeriods(periods);
        await sendSpecialHoursPatch(canonicalPeriods, { validateOnly: true });
        const ticket = Object.freeze({
            periodsHash: hashSpecialHourPeriods(canonicalPeriods),
            validatedAtMs: now()
        });
        validatedSpecialHoursTickets.add(ticket);
        return ticket;
    }

    async function sendValidatedSpecialHoursPatch(periods, ticket) {
        const canonicalPeriods = canonicalizeSpecialHourPeriods(periods);
        const validatedAtMs = Number(ticket?.validatedAtMs || 0);
        const ticketIsValid = !!ticket
            && typeof ticket === 'object'
            && validatedSpecialHoursTickets.has(ticket)
            && ticket.periodsHash === hashSpecialHourPeriods(canonicalPeriods)
            && Number.isFinite(validatedAtMs)
            && now() >= validatedAtMs
            && now() - validatedAtMs <= VALIDATED_SPECIAL_HOURS_TICKET_TTL_MS;
        if (!ticketIsValid) {
            throw new GoogleBusinessProfileError(
                'Google Business Profile production write requires a fresh validation ticket for the same payload.',
                {
                    code: 'GBP_VALIDATION_TICKET_REQUIRED',
                    status: 400,
                    retryable: false
                }
            );
        }
        validatedSpecialHoursTickets.delete(ticket);
        return sendSpecialHoursPatch(canonicalPeriods, { validateOnly: false });
    }

    async function updateSpecialHours(periods, updateOptions = {}) {
        const requestedValidateOnly = updateOptions.validateOnly === undefined
            ? false
            : parseBoolean(updateOptions.validateOnly, false);
        const validateOnly = config.validateOnly === true || requestedValidateOnly;
        const validateBeforeUpdate = config.validateBeforeUpdate === true;

        if (validateOnly) return sendSpecialHoursPatch(periods, { validateOnly: true });
        if (!config.productionWritesEnabled || !validateBeforeUpdate) {
            throw new GoogleBusinessProfileError(
                'Google Business Profile production writes require explicit enablement and validate-before-update.',
                {
                    code: 'GBP_PRODUCTION_WRITES_NOT_ENABLED',
                    status: 400,
                    retryable: false,
                    details: {
                        productionWritesEnabled: config.productionWritesEnabled === true,
                        validateBeforeUpdate: validateBeforeUpdate === true
                    }
                }
            );
        }
        const validationTicket = await createValidatedSpecialHoursTicket(periods);
        if (typeof updateOptions.beforeProductionWrite === 'function') {
            await updateOptions.beforeProductionWrite();
        }
        return sendValidatedSpecialHoursPatch(periods, validationTicket);
    }

    async function patchSpecialHours(periods, patchOptions = {}) {
        const validateOnly = patchOptions.validateOnly === undefined
            ? true
            : parseBoolean(patchOptions.validateOnly, true);
        if (validateOnly) return sendSpecialHoursPatch(periods, { validateOnly: true });
        return updateSpecialHours(periods, { validateOnly: false });
    }

    async function listLocations(listOptions = {}) {
        const normalizedOptions = typeof listOptions === 'string'
            ? { pageToken: listOptions }
            : (listOptions || {});
        const requestedPageSize = Math.floor(Number(normalizedOptions.pageSize) || MAX_LOCATION_PAGE_SIZE);
        const pageSize = Math.max(1, Math.min(MAX_LOCATION_PAGE_SIZE, requestedPageSize));
        return requestBusinessInformation('accounts/-/locations', {
            query: {
                readMask: 'name,title,storeCode,storefrontAddress,metadata',
                pageSize,
                pageToken: String(normalizedOptions.pageToken || '').trim() || undefined
            }
        });
    }

    return {
        getAccessToken,
        getGoogleUpdatedLocation,
        getLocation,
        listLocations,
        patchSpecialHours,
        updateSpecialHours
    };
}

module.exports = {
    GoogleBusinessProfileError,
    addDaysToDateObject,
    buildDesiredSpecialHours,
    canonicalizeSpecialHourPeriods,
    createGoogleBusinessProfileClient,
    dateObjectToKey,
    hashSpecialHourPeriods,
    mergeSpecialHourPeriods,
    normalizeLocationName,
    parseDateText,
    parseTimeText,
    readGoogleBusinessProfileConfig,
    specialHourPeriodsEqual,
    stableSortSpecialHourPeriods,
    stableStringifySpecialHourPeriods,
    __test: {
        BUSINESS_INFORMATION_API_BASE_URL,
        DEFAULT_TIMEOUT_MS,
        JST_OFFSET_MS,
        LOCATION_ENV_DESCRIPTION,
        MAX_LOCATION_PAGE_SIZE,
        OAUTH_TOKEN_URL,
        addDaysToDateObject,
        canonicalizeSpecialHourPeriod,
        errorFromHttpResponse,
        getJstTodayKey,
        isRetryableHttpStatus,
        normalizeLocationName,
        parseBoolean,
        parseDateText,
        parseTimeText,
        stableSortSpecialHourPeriods,
        validationError
    }
};
