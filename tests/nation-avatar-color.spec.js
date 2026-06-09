const { test, expect } = require('@playwright/test');
const { getAvatarColorForNation } = require('../server/nation');

test('wind nation avatar color is yellow', () => {
  expect(getAvatarColorForNation('wind')).toBe('yellow');
});
