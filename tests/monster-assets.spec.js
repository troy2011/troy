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
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sourceSizes = new Map();

  expect(manifest).toHaveLength(27);
  expect(new Set(manifest.map((item) => item.id)).size).toBe(manifest.length);

  for (const item of manifest) {
    expect(item.id).toMatch(/^[a-z0-9_]+$/);
    expect(item.file).toMatch(/^\.\/Sprites\/monsters\/[a-z0-9_]+\.png$/);
    const assetPath = path.join(publicDir, item.file.replace(/^\.\//, ''));
    expect(fs.existsSync(assetPath), item.file).toBe(true);
    const size = readPngSize(assetPath);
    expect(size.width).toBe(item.width);
    expect(size.height).toBe(item.height);
    expect(item.source).toMatch(/^\.\//);
    const sourcePath = path.join(publicDir, item.source.replace(/^\.\//, ''));
    expect(fs.existsSync(sourcePath), item.source).toBe(true);
    if (!sourceSizes.has(item.source)) {
      sourceSizes.set(item.source, readPngSize(sourcePath));
    }
    const sourceSize = sourceSizes.get(item.source);
    expect(item.sourceRect.x + item.sourceRect.w).toBeLessThanOrEqual(sourceSize.width);
    expect(item.sourceRect.y + item.sourceRect.h).toBeLessThanOrEqual(sourceSize.height);
    expect(item.sourceRegion.x + item.sourceRegion.w).toBeLessThanOrEqual(sourceSize.width);
    expect(item.sourceRegion.y + item.sourceRegion.h).toBeLessThanOrEqual(sourceSize.height);
  }
});
