// Keep adopted originals read-only; derive the complete, framed cards for the app.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const VARIANTS = [
  { directory: 'cards', width: 640, height: 960, quality: 82 },
  { directory: 'thumbs', width: 160, height: 240, quality: 74 }
];

function appId(sourceId) {
  const [family, numberText] = sourceId.split('-');
  const number = Number(numberText);
  if (family === 'major') {
    if (!Number.isInteger(number) || number < 0 || number > 21) throw new Error('Invalid major');
    return `major-${number}`;
  }
  const suit = { wands: 'wand', cups: 'cup', swords: 'sword', coins: 'pentacle' }[family];
  if (!suit || !Number.isInteger(number) || number < 1 || number > 14) throw new Error('Invalid minor');
  return `${suit}-${({ 11: 'page', 12: 'knight', 13: 'queen', 14: 'king' })[number] || number}`;
}

function checkedFile(root, relative, expected, protectedFiles) {
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error(`Outside adopted source: ${relative}`);
  const bytes = fs.readFileSync(file);
  if (sha(bytes) !== expected) throw new Error(`Adopted source hash mismatch: ${relative}`);
  protectedFiles.set(file, expected);
  return { file, bytes };
}

function loadAdoptedSources(sourceRoot) {
  const protectedFiles = new Map();
  const rawBytes = fs.readFileSync(path.join(sourceRoot, 'manifest.json'));
  const source = JSON.parse(rawBytes);
  protectedFiles.set(path.join(sourceRoot, 'manifest.json'), sha(rawBytes));
  const completedRoot = path.join(sourceRoot, '完成版');
  const completedBytes = fs.readFileSync(path.join(completedRoot, 'manifest.json'));
  const completed = JSON.parse(completedBytes);
  protectedFiles.set(path.join(completedRoot, 'manifest.json'), sha(completedBytes));
  checkedFile(completedRoot, completed.source_manifest, completed.source_manifest_sha256, protectedFiles);
  if (sha(rawBytes) !== completed.source_manifest_sha256) throw new Error('Completed edition is stale');
  if (source.card_count !== 78 || source.cards.length !== 78 || completed.card_count !== 78 || completed.cards.length !== 78) throw new Error('Expected canonical 78');
  if (source.front_revision !== completed.front_revision || completed.status !== 'completed_verified') throw new Error('Unverified completed edition');
  const originals = new Map(source.cards.map(card => [card.id, card]));
  if (originals.size !== 78 || new Set(completed.cards.map(card => appId(card.id))).size !== 78) throw new Error('Duplicate card mapping');
  const inputs = completed.cards.map(card => {
    const original = originals.get(card.id);
    if (!original || card.adopted !== true || card.source_sha256 !== original.sha256) throw new Error(`Completed/original mismatch: ${card.id}`);
    const raw = checkedFile(sourceRoot, original.art_path, original.sha256, protectedFiles);
    const framed = checkedFile(completedRoot, card.png_path, card.png_sha256, protectedFiles);
    return { original, card, raw, framed };
  });
  if (completed.back.sha256 !== source.back.sha256) throw new Error('Back adoption mismatch');
  const back = checkedFile(sourceRoot, source.back.art_path, source.back.sha256, protectedFiles);
  checkedFile(completedRoot, completed.back.path, source.back.sha256, protectedFiles);
  return { source, completed, completedBytes, rawBytes, inputs, back, protectedFiles };
}

async function encode(bytes, variant) {
  // The adopted 58:89 frame fits inside the existing 2:3 canvas, without cropping or stretching.
  return sharp(bytes).resize(variant.width, variant.height, {
    fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: true
  }).webp({ quality: variant.quality, effort: 5 }).toBuffer({ resolveWithObject: true });
}

async function build(sourceRoot, outputRoot) {
  sourceRoot = path.resolve(sourceRoot);
  outputRoot = path.resolve(outputRoot);
  if (outputRoot === sourceRoot || outputRoot.startsWith(sourceRoot + path.sep)) throw new Error('Output must be outside the adopted originals');
  const adopted = loadAdoptedSources(sourceRoot);
  const { source, completed, inputs, protectedFiles } = adopted;
  const outputs = [];
  const records = [];
  for (const { original, card, raw, framed } of inputs) {
    const id = appId(card.id);
    const variants = {};
    for (const variant of VARIANTS) {
      const relative = `${variant.directory}/${id}.webp`;
      const result = await encode(framed.bytes, variant);
      outputs.push({ relative, bytes: result.data });
      variants[variant.directory] = { path: relative, bytes: result.data.length, width: result.info.width, height: result.info.height, sha256: sha(result.data) };
    }
    records.push({ id, sourceId: card.id, label: original.name_ja, selectedVersion: original.selected_version,
      source: original.art_path, sourceSha256: original.sha256, sourceBytes: raw.bytes.length, sourceWidth: original.width, sourceHeight: original.height,
      renderSource: { path: `完成版/${card.png_path}`, sha256: card.png_sha256, bytes: framed.bytes.length, width: card.width, height: card.height }, ...variants });
  }
  const backResult = await encode(adopted.back.bytes, VARIANTS[0]);
  outputs.push({ relative: 'back.webp', bytes: backResult.data });
  const back = { path: 'back.webp', source: source.back.art_path, sourceSha256: source.back.sha256, selectedVersion: source.back.selected_version,
    sourceBytes: adopted.back.bytes.length, width: backResult.info.width, height: backResult.info.height, bytes: backResult.data.length, sha256: sha(backResult.data) };
  for (const [file, expected] of protectedFiles) if (sha(fs.readFileSync(file)) !== expected) throw new Error(`Adopted source changed during processing: ${path.basename(file)}`);
  const assetVersion = `${source.front_revision}-${sha(Buffer.from(JSON.stringify(outputs.map(output => sha(output.bytes))))).slice(0, 16)}`;
  const report = { schemaVersion: 2, assetVersion, sourceEdition: source.edition, frontRevision: source.front_revision,
    sourceManifestSha256: sha(adopted.rawBytes), completedManifestSha256: sha(adopted.completedBytes), majorFrame: completed.major_frame,
    policy: 'Verified adopted complete fronts, frames and names retained. Isotropic contain fit with transparent padding; no crop or fill. Originals read-only.',
    encoding: { format: 'webp', effort: 5, fit: 'contain', padding: 'transparent', variants: VARIANTS }, cards: records, back };
  // No output is replaced until every source and derivative is ready and verified.
  for (const output of outputs) {
    const destination = path.join(outputRoot, output.relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, output.bytes);
  }
  fs.writeFileSync(path.join(outputRoot, 'version.js'), `// Generated by scripts/build-pirate-tarot-art.cjs\nexport const PIRATE_TAROT_ARTWORK_VERSION = '${assetVersion}';\n`);
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

async function main() {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node build-pirate-tarot-art.cjs <adopted-root> <output-root>');
  const report = await build(process.argv[2], process.argv[3]);
  console.log(JSON.stringify({ count: report.cards.length, assetVersion: report.assetVersion,
    framedSourceBytes: report.cards.reduce((sum, card) => sum + card.renderSource.bytes, 0),
    cardBytes: report.cards.reduce((sum, card) => sum + card.cards.bytes, 0), thumbnailBytes: report.cards.reduce((sum, card) => sum + card.thumbs.bytes, 0), backBytes: report.back.bytes }));
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { appId, loadAdoptedSources, encode, build, VARIANTS };
