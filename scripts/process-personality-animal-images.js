'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'tmp', 'personality-animal-source');
const OUTPUT_DIR = path.join(ROOT, 'public', 'assets', 'personality-animals');
const ANIMAL_COUNT = 365;
const OUTPUT_SIZE = 768;

function fileName(index, extension) {
    return `animal-${String(index).padStart(3, '0')}.${extension}`;
}

async function processImage(index) {
    const sourcePath = path.join(SOURCE_DIR, fileName(index, 'png'));
    const outputPath = path.join(OUTPUT_DIR, fileName(index, 'webp'));
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing source image: ${path.relative(ROOT, sourcePath)}`);
    }

    await sharp(sourcePath)
        .rotate()
        .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
            fit: 'cover',
            position: 'attention'
        })
        .toColourspace('srgb')
        .webp({
            quality: 84,
            effort: 5,
            smartSubsample: true
        })
        .toFile(outputPath);

    const metadata = await sharp(outputPath).metadata();
    if (metadata.format !== 'webp' || metadata.width !== OUTPUT_SIZE || metadata.height !== OUTPUT_SIZE) {
        throw new Error(`Invalid output image: ${path.relative(ROOT, outputPath)}`);
    }
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const expected = new Set(Array.from({ length: ANIMAL_COUNT }, (_, index) => fileName(index + 1, 'png')));
    const sourceFiles = fs.readdirSync(SOURCE_DIR).filter((name) => /^animal-\d{3}\.png$/u.test(name));
    const missing = [...expected].filter((name) => !sourceFiles.includes(name));
    const unexpected = sourceFiles.filter((name) => !expected.has(name));
    if (missing.length || unexpected.length) {
        throw new Error(`Source set is invalid. missing=${missing.join(',') || 'none'} unexpected=${unexpected.join(',') || 'none'}`);
    }

    for (let start = 1; start <= ANIMAL_COUNT; start += 12) {
        const batch = Array.from(
            { length: Math.min(12, ANIMAL_COUNT - start + 1) },
            (_, offset) => processImage(start + offset)
        );
        await Promise.all(batch);
    }

    console.log(`[personality-images] OK ${ANIMAL_COUNT} images at ${OUTPUT_SIZE}x${OUTPUT_SIZE}`);
}

main().catch((error) => {
    console.error(`[personality-images] ${error.message}`);
    process.exitCode = 1;
});
