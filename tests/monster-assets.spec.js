const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

function readPngSize(filePath) {
  const bytes = fs.readFileSync(filePath);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

test('monster sprite manifest points to sliced PNG assets', () => {
  const publicDir = path.resolve(__dirname, '..', 'public');
  const manifestPath = path.join(publicDir, 'Sprites', 'monsters', 'manifest.json');
  const sourcePath = path.join(publicDir, 'monster-sheet.png');
  const sourceSize = readPngSize(sourcePath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  expect(manifest).toHaveLength(18);
  expect(new Set(manifest.map((item) => item.id)).size).toBe(manifest.length);

  for (const item of manifest) {
    expect(item.id).toMatch(/^[a-z0-9_]+$/);
    expect(item.file).toMatch(/^\.\/Sprites\/monsters\/[a-z0-9_]+\.png$/);
    const assetPath = path.join(publicDir, item.file.replace(/^\.\//, ''));
    expect(fs.existsSync(assetPath), item.file).toBe(true);
    const size = readPngSize(assetPath);
    expect(size.width).toBe(item.width);
    expect(size.height).toBe(item.height);
    expect(item.sourceRect.x + item.sourceRect.w).toBeLessThanOrEqual(sourceSize.width);
    expect(item.sourceRect.y + item.sourceRect.h).toBeLessThanOrEqual(sourceSize.height);
  }
});
