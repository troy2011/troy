const { test, expect } = require('@playwright/test');

const {
  GoogleBusinessProfileError,
  buildDesiredSpecialHours,
  canonicalizeSpecialHourPeriods,
  createGoogleBusinessProfileClient,
  hashSpecialHourPeriods,
  mergeSpecialHourPeriods,
  readGoogleBusinessProfileConfig,
  specialHourPeriodsEqual
} = require('../server/googleBusinessProfile');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body === undefined ? '' : JSON.stringify(body);
    }
  };
}

function makeFetchQueue(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (queue.length === 0) throw new Error(`Unexpected fetch: ${url}`);
    const response = queue.shift();
    return typeof response === 'function' ? response(url, init) : response;
  };
  return { calls, fetchImpl, queue };
}

function configuredClient(overrides = {}) {
  return {
    locationName: 'locations/987654321',
    clientId: 'oauth-client-id',
    clientSecret: 'oauth-client-secret',
    refreshToken: 'oauth-refresh-token',
    validateOnly: false,
    validateBeforeUpdate: true,
    ...overrides
  };
}

function openPeriod(date, openHours, closeHours, endDate = date) {
  const [year, month, day] = date.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  return {
    startDate: { year, month, day },
    openTime: { hours: openHours, minutes: 0 },
    endDate: { year: endYear, month: endMonth, day: endDay },
    closeTime: { hours: closeHours, minutes: 0 }
  };
}

test('config is explicitly enabled, normalizes either location env, and reports missing values', () => {
  const disabled = readGoogleBusinessProfileConfig({
    GOOGLE_BUSINESS_PROFILE_LOCATION_ID: '123456',
    GOOGLE_OAUTH_CLIENT_ID: 'client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh',
    GOOGLE_BUSINESS_PROFILE_REQUEST_TIMEOUT_MS: '2345'
  });
  expect(disabled).toMatchObject({
    enabled: false,
    configured: true,
    missing: [],
    locationName: 'locations/123456',
    validateOnly: false,
    validateBeforeUpdate: false,
    timeoutMs: 2345
  });

  const enabled = readGoogleBusinessProfileConfig({
    GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED: 'true',
    GOOGLE_BUSINESS_PROFILE_LOCATION_NAME: 'accounts/111/locations/222',
    GOOGLE_OAUTH_CLIENT_ID: 'client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh',
    GOOGLE_BUSINESS_PROFILE_VALIDATE_ONLY: '1',
    GOOGLE_BUSINESS_PROFILE_VALIDATE_BEFORE_UPDATE: 'false'
  });
  expect(enabled).toMatchObject({
    enabled: true,
    configured: true,
    locationName: 'locations/222',
    validateOnly: true,
    validateBeforeUpdate: false
  });

  const missing = readGoogleBusinessProfileConfig({
    GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED: 'true'
  });
  expect(missing.configured).toBe(false);
  expect(missing.timeoutMs).toBe(10_000);
  expect(missing.missing).toEqual([
    'GOOGLE_BUSINESS_PROFILE_LOCATION_NAME or GOOGLE_BUSINESS_PROFILE_LOCATION_ID',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REFRESH_TOKEN'
  ]);
});

test('calendar conversion handles open, closed, private, and tentative statuses and keeps today JST', () => {
  const result = buildDesiredSpecialHours([
    { date: '2030-05-09', status: 'open', openTime: '18:00', closeTime: '23:00', updatedAtMs: 1 },
    { date: '2030-05-10', status: 'open', openTime: '18:30', closeTime: '23:45', updatedAtMs: 2 },
    { date: '2030-05-11', status: 'closed', openTime: '99:99', closeTime: '', updatedAtMs: 3 },
    { date: '2030-05-12', status: 'private', updatedAtMs: 4 },
    { date: '2030-05-13', status: 'tentative', updatedAtMs: 5 }
  ], { nowMs: Date.parse('2030-05-10T08:00:00+09:00') });

  expect(result.managedDates).toEqual([
    '2030-05-10',
    '2030-05-11',
    '2030-05-12',
    '2030-05-13'
  ]);
  expect(result.specialHourPeriods).toEqual([
    {
      startDate: { year: 2030, month: 5, day: 10 },
      openTime: { hours: 18, minutes: 30 },
      endDate: { year: 2030, month: 5, day: 10 },
      closeTime: { hours: 23, minutes: 45 }
    },
    { startDate: { year: 2030, month: 5, day: 11 }, closed: true },
    { startDate: { year: 2030, month: 5, day: 12 }, closed: true }
  ]);
});

test('overnight conversion rolls over month-end and year-end dates', () => {
  const result = buildDesiredSpecialHours([
    { date: '2030-01-31', status: 'open', openTime: '22:00', closeTime: '02:00', updatedAtMs: 1 },
    { date: '2030-12-31', status: 'open', openTime: '23:30', closeTime: '01:00', updatedAtMs: 1 }
  ], { nowMs: Date.parse('2030-01-01T00:00:00+09:00') });

  expect(result.specialHourPeriods[0]).toMatchObject({
    startDate: { year: 2030, month: 1, day: 31 },
    endDate: { year: 2030, month: 2, day: 1 }
  });
  expect(result.specialHourPeriods[1]).toMatchObject({
    startDate: { year: 2030, month: 12, day: 31 },
    endDate: { year: 2031, month: 1, day: 1 }
  });
});

test('invalid overnight periods fail clearly and are non-retryable', () => {
  let closingAtNoonError;
  try {
    buildDesiredSpecialHours([
      { date: '2030-06-01', status: 'open', openTime: '22:00', closeTime: '12:00', updatedAtMs: 1 }
    ], { nowMs: Date.parse('2030-01-01T00:00:00+09:00') });
  } catch (error) {
    closingAtNoonError = error;
  }
  expect(closingAtNoonError).toBeInstanceOf(GoogleBusinessProfileError);
  expect(closingAtNoonError).toMatchObject({
    code: 'GBP_INVALID_OVERNIGHT_HOURS',
    status: 400,
    retryable: false
  });
  expect(closingAtNoonError.message).toContain('next-day closing time must be before 12:00');

  let fullDayError;
  try {
    buildDesiredSpecialHours([
      { date: '2030-06-01', status: 'open', openTime: '08:00', closeTime: '08:00', updatedAtMs: 1 }
    ], { nowMs: Date.parse('2030-01-01T00:00:00+09:00') });
  } catch (error) {
    fullDayError = error;
  }
  expect(fullDayError).toMatchObject({
    code: 'GBP_INVALID_OVERNIGHT_HOURS',
    retryable: false,
    status: 400
  });
});

test('the newest updatedAtMs entry wins for each date', () => {
  const result = buildDesiredSpecialHours([
    { date: '2030-07-01', status: 'open', openTime: '18:00', closeTime: '23:00', updatedAtMs: 100 },
    { date: '2030-07-01', status: 'closed', updatedAtMs: 300 },
    { date: '2030-07-01', status: 'open', openTime: '19:00', closeTime: '22:00', updatedAtMs: 200 },
    { date: '2030-07-02', status: 'open', openTime: '17:00', closeTime: '21:00', updatedAtMs: 5 },
    { date: '2030-07-02', status: 'tentative', updatedAtMs: 6 }
  ], { nowMs: Date.parse('2030-01-01T00:00:00+09:00') });

  expect(result.managedDates).toEqual(['2030-07-01', '2030-07-02']);
  expect(result.specialHourPeriods).toEqual([
    { startDate: { year: 2030, month: 7, day: 1 }, closed: true }
  ]);
});

test('merge replaces only previously or currently managed starts and preserves manual Google periods', () => {
  const manualPeriod = {
    startDate: { year: 2030, month: 12, day: 24 },
    openTime: { hours: 10, minutes: 15 },
    endDate: { year: 2030, month: 12, day: 24 },
    closeTime: { hours: 16, minutes: 45 }
  };
  const remote = [
    openPeriod('2030-12-25', 9, 12),
    manualPeriod,
    openPeriod('2030-12-26', 9, 12)
  ];
  const desired = [
    { startDate: { year: 2030, month: 12, day: 27 }, closed: true }
  ];

  const merged = mergeSpecialHourPeriods(
    remote,
    desired,
    ['2030-12-25'],
    ['2030-12-26', '2030-12-27']
  );
  expect(merged).toEqual([
    manualPeriod,
    { startDate: { year: 2030, month: 12, day: 27 }, closed: true }
  ]);

  const reversed = [...merged].reverse();
  expect(canonicalizeSpecialHourPeriods(reversed)).toEqual(canonicalizeSpecialHourPeriods(merged));
  expect(specialHourPeriodsEqual(reversed, merged)).toBe(true);
  expect(hashSpecialHourPeriods(reversed)).toBe(hashSpecialHourPeriods(merged));
});

test('canonical comparison treats an omitted open-period endDate as the start date', () => {
  const omittedEndDate = {
    startDate: { year: 2030, month: 12, day: 24 },
    openTime: { hours: 10, minutes: 0 },
    closeTime: { hours: 16, minutes: 0 }
  };
  const explicitEndDate = {
    ...omittedEndDate,
    endDate: { year: 2030, month: 12, day: 24 }
  };

  expect(specialHourPeriodsEqual([omittedEndDate], [explicitEndDate])).toBe(true);
  expect(canonicalizeSpecialHourPeriods([omittedEndDate])[0].endDate).toEqual({
    year: 2030,
    month: 12,
    day: 24
  });
});

test('client refreshes OAuth once, GETs the location, validates, and then PATCHes for real', async () => {
  const periods = [openPeriod('2030-08-01', 18, 23)];
  const { calls, fetchImpl, queue } = makeFetchQueue([
    jsonResponse({ access_token: 'access-1', expires_in: 3600 }),
    jsonResponse({ name: 'locations/987654321', regularHours: { periods: [{}] } }),
    jsonResponse({ name: 'locations/987654321', validation: 'ok' }),
    jsonResponse({ name: 'locations/987654321', specialHours: { specialHourPeriods: periods } })
  ]);
  const client = createGoogleBusinessProfileClient({
    config: configuredClient(),
    fetchImpl,
    now: () => Date.parse('2030-01-01T00:00:00Z')
  });

  const location = await client.getLocation();
  const updated = await client.updateSpecialHours(periods);

  expect(location.name).toBe('locations/987654321');
  expect(updated.specialHours.specialHourPeriods).toEqual(periods);
  expect(queue).toHaveLength(0);
  expect(calls).toHaveLength(4);

  expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
  expect(calls[0].init.method).toBe('POST');
  expect(new URLSearchParams(calls[0].init.body).get('grant_type')).toBe('refresh_token');
  expect(new URLSearchParams(calls[0].init.body).get('refresh_token')).toBe('oauth-refresh-token');

  const getUrl = new URL(calls[1].url);
  expect(getUrl.pathname).toBe('/v1/locations/987654321');
  expect(getUrl.searchParams.get('readMask')).toBe('regularHours,specialHours');
  expect(calls[1].init.headers.Authorization).toBe('Bearer access-1');
  expect(calls[1].init.headers['X-GOOG-API-FORMAT-VERSION']).toBe('2');

  const validateUrl = new URL(calls[2].url);
  const updateUrl = new URL(calls[3].url);
  expect(calls[2].init.method).toBe('PATCH');
  expect(validateUrl.searchParams.get('updateMask')).toBe('specialHours');
  expect(validateUrl.searchParams.get('validateOnly')).toBe('true');
  expect(updateUrl.searchParams.get('updateMask')).toBe('specialHours');
  expect(updateUrl.searchParams.has('validateOnly')).toBe(false);
  expect(JSON.parse(calls[3].init.body)).toEqual({
    name: 'locations/987654321',
    specialHours: { specialHourPeriods: periods }
  });
});

test('validate-only dry-run performs no production PATCH', async () => {
  const { calls, fetchImpl } = makeFetchQueue([
    jsonResponse({ access_token: 'dry-run-token', expires_in: 3600 }),
    jsonResponse({ name: 'locations/987654321', validated: true })
  ]);
  const client = createGoogleBusinessProfileClient({
    config: configuredClient({ validateOnly: true }),
    fetchImpl
  });

  await client.updateSpecialHours([
    { startDate: { year: 2030, month: 9, day: 1 }, closed: true }
  ]);

  expect(calls).toHaveLength(2);
  const patchUrl = new URL(calls[1].url);
  expect(calls[1].init.method).toBe('PATCH');
  expect(patchUrl.searchParams.get('validateOnly')).toBe('true');
});

test('listLocations supports page tokens and clamps page size to 100', async () => {
  const { calls, fetchImpl } = makeFetchQueue([
    jsonResponse({ access_token: 'list-token', expires_in: 3600 }),
    jsonResponse({ locations: [], nextPageToken: 'next' })
  ]);
  const client = createGoogleBusinessProfileClient({
    config: configuredClient(),
    fetchImpl
  });

  const result = await client.listLocations({ pageSize: 500, pageToken: 'page-2' });
  expect(result.nextPageToken).toBe('next');
  const listUrl = new URL(calls[1].url);
  expect(listUrl.pathname).toBe('/v1/accounts/-/locations');
  expect(listUrl.searchParams.get('readMask')).toBe('name,title,storeCode,storefrontAddress,metadata');
  expect(listUrl.searchParams.get('pageSize')).toBe('100');
  expect(listUrl.searchParams.get('pageToken')).toBe('page-2');
});

test('Google HTTP errors expose code, numeric status, and retryability', async () => {
  const throttledFetch = makeFetchQueue([
    jsonResponse({ access_token: 'token-429', expires_in: 3600 }),
    jsonResponse({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'Quota exhausted'
      }
    }, 429)
  ]).fetchImpl;
  const throttledClient = createGoogleBusinessProfileClient({
    config: configuredClient(),
    fetchImpl: throttledFetch
  });

  let throttledError;
  try {
    await throttledClient.getLocation();
  } catch (error) {
    throttledError = error;
  }
  expect(throttledError).toBeInstanceOf(GoogleBusinessProfileError);
  expect(throttledError).toMatchObject({
    code: 'RESOURCE_EXHAUSTED',
    googleCode: 429,
    status: 429,
    retryable: true
  });

  const invalidFetch = makeFetchQueue([
    jsonResponse({ access_token: 'token-400', expires_in: 3600 }),
    jsonResponse({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'Bad special hours'
      }
    }, 400)
  ]).fetchImpl;
  const invalidClient = createGoogleBusinessProfileClient({
    config: configuredClient(),
    fetchImpl: invalidFetch
  });

  let invalidError;
  try {
    await invalidClient.getLocation();
  } catch (error) {
    invalidError = error;
  }
  expect(invalidError).toMatchObject({
    code: 'INVALID_ARGUMENT',
    status: 400,
    retryable: false
  });
});

test('a 401 response clears the token cache and retries once with a refreshed token', async () => {
  const { calls, fetchImpl } = makeFetchQueue([
    jsonResponse({ access_token: 'expired-token', expires_in: 3600 }),
    jsonResponse({ error: { code: 401, status: 'UNAUTHENTICATED', message: 'Expired' } }, 401),
    jsonResponse({ access_token: 'fresh-token', expires_in: 3600 }),
    jsonResponse({ name: 'locations/987654321' })
  ]);
  const client = createGoogleBusinessProfileClient({
    config: configuredClient(),
    fetchImpl
  });

  const location = await client.getLocation();
  expect(location.name).toBe('locations/987654321');
  expect(calls).toHaveLength(4);
  expect(calls[1].init.headers.Authorization).toBe('Bearer expired-token');
  expect(calls[3].init.headers.Authorization).toBe('Bearer fresh-token');
});

test('network failures become retryable adapter errors', async () => {
  const client = createGoogleBusinessProfileClient({
    config: configuredClient(),
    fetchImpl: async () => {
      throw new TypeError('socket closed');
    }
  });

  let networkError;
  try {
    await client.getLocation();
  } catch (error) {
    networkError = error;
  }
  expect(networkError).toBeInstanceOf(GoogleBusinessProfileError);
  expect(networkError).toMatchObject({
    code: 'GBP_NETWORK_ERROR',
    status: 0,
    retryable: true
  });
});

test('request timeout aborts even when an injected fetch ignores the signal', async () => {
  const client = createGoogleBusinessProfileClient({
    config: configuredClient({ timeoutMs: 5 }),
    fetchImpl: async () => new Promise(() => {})
  });

  let timeoutError;
  try {
    await client.getLocation();
  } catch (error) {
    timeoutError = error;
  }
  expect(timeoutError).toMatchObject({
    code: 'GBP_TIMEOUT',
    status: 0,
    retryable: true
  });
});
