const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { appId, encode, build, loadAdoptedSources, VARIANTS } = require('../scripts/build-pirate-tarot-art.cjs');
const root = path.join(__dirname, '../public/assets/pirate-tarot');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('78 unique mappings, complete framed inputs, 156 derivatives and the adopted back agree', async () => {
    assert.equal(manifest.cards.length, 78);
    assert.equal(new Set(manifest.cards.map(card => card.id)).size, 78);
    assert.match(manifest.majorFrame, /v15/);
    assert.equal(manifest.frontRevision, 'v8');
    for (const card of manifest.cards) {
        assert.equal(card.id, appId(card.sourceId));
        assert.match(card.renderSource.path, /^完成版\/PNG\//);
        for (const variant of VARIANTS) {
            const record = card[variant.directory];
            const bytes = fs.readFileSync(path.join(root, record.path));
            assert.equal(sha(bytes), record.sha256);
            assert.equal(bytes.length, record.bytes);
            const metadata = await sharp(bytes).metadata();
            assert.equal(metadata.format, 'webp');
            assert.equal(metadata.width, variant.width);
            assert.equal(metadata.height, variant.height);
        }
    }
    assert.equal(manifest.cards.find(card => card.id === 'cup-3').sourceSha256, 'ead768e8973f49c6d3378fb255363434a01b873b0372414a87c83582fd974369');
    assert.equal(manifest.cards.find(card => card.id === 'cup-10').sourceSha256, 'b5d60a91c48aed8af51a0da168c5909e6c1cdfca51f864c7cb0abbfb5fb6ae33');
    assert.equal(manifest.back.sourceSha256, '121570737c5d49b8e89f7ce0315d5867c3666c83567447f5ab06cab09a921a60');
    assert.equal(sha(fs.readFileSync(path.join(root, manifest.back.path))), manifest.back.sha256);
    assert.match(fs.readFileSync(path.join(root, 'version.js'), 'utf8'), new RegExp(manifest.assetVersion));
});

test('contain keeps the full top, bottom and side markers in the fixed 2:3 canvas', async () => {
    const input = Buffer.from('<svg width="1160" height="1780" xmlns="http://www.w3.org/2000/svg"><rect width="1160" height="1780" fill="white"/><rect width="1160" height="80" fill="red"/><rect y="1700" width="1160" height="80" fill="blue"/><rect y="80" width="80" height="1620" fill="green"/><rect x="1080" y="80" width="80" height="1620" fill="magenta"/></svg>');
    for (const variant of VARIANTS) {
        const encoded = await encode(input, variant);
        const { data, info } = await sharp(encoded.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
        const pad = Math.round((variant.width - 1160 / 1780 * variant.height) / 2);
        assert.equal(pixel(0, variant.height / 2)[3], 0);
        assert.ok(pixel(variant.width / 2, 2)[0] > 220, 'top red marker retained');
        assert.ok(pixel(variant.width / 2, variant.height - 3)[2] > 220, 'bottom blue marker retained');
        assert.ok(pixel(pad + 3, variant.height / 2)[1] > 80, 'left marker retained');
        assert.ok(pixel(variant.width - pad - 4, variant.height / 2)[0] > 200, 'right marker retained');
    }
});

test('generation refuses an output inside the adopted-original directory', async () => {
    const source = path.resolve('read-only-originals');
    await assert.rejects(build(source, path.join(source, 'art')), /outside the adopted originals/);
});

test('local source manifests and all original/framed SHA-256 match the generated edition', { skip: !process.env.PIRATE_TAROT_SOURCE }, () => {
    const adopted = loadAdoptedSources(path.resolve(process.env.PIRATE_TAROT_SOURCE));
    assert.equal(sha(adopted.rawBytes), manifest.sourceManifestSha256);
    assert.equal(sha(adopted.completedBytes), manifest.completedManifestSha256);
    for (const { original, card } of adopted.inputs) {
        const record = manifest.cards.find(entry => entry.sourceId === card.id);
        assert.equal(record.sourceSha256, original.sha256);
        assert.equal(record.renderSource.sha256, card.png_sha256);
    }
});
