// Read adopted originals and create separate, uncropped web derivatives.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

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

async function main() {
  const sourceRoot = path.resolve(process.argv[2]);
  const outputRoot = path.resolve(process.argv[3]);
  const manifestBytes = fs.readFileSync(path.join(sourceRoot, 'manifest.json'));
  const source = JSON.parse(manifestBytes);
  if (source.card_count !== 78 || source.cards.length !== 78) throw new Error('Expected canonical 78');
  const ids = source.cards.map((card) => appId(card.id));
  if (new Set(ids).size !== 78) throw new Error('Duplicate card mapping');
  const adopted = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'SOURCE-ADOPTED-S3-HEART-P10-PEGLEG-P6-SLEEVES-20261022.json')));
  for (const entry of adopted.records) {
    if (source.cards.find((card) => card.id === entry.id)?.sha256 !== entry.sha) throw new Error('Latest adoption mismatch');
  }
  const records = [];
  fs.mkdirSync(path.join(outputRoot, 'cards'), { recursive: true });
  fs.mkdirSync(path.join(outputRoot, 'thumbs'), { recursive: true });
  for (const card of source.cards) {
    const file = path.resolve(sourceRoot, card.art_path);
    if (!file.startsWith(sourceRoot + path.sep) || !card.art_path.startsWith('art/')) throw new Error('Outside canonical artwork');
    const bytes = fs.readFileSync(file);
    if (sha(bytes) !== card.sha256) throw new Error(`Original hash mismatch: ${card.id}`);
    const id = appId(card.id);
    const variants = {};
    for (const [directory, width, quality] of [['cards', 640, 82], ['thumbs', 160, 74]]) {
      const relative = `${directory}/${id}.webp`;
      const result = await sharp(bytes).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 5 }).toBuffer({ resolveWithObject: true });
      fs.writeFileSync(path.join(outputRoot, relative), result.data);
      variants[directory] = { path: relative, bytes: result.data.length, width: result.info.width, height: result.info.height, sha256: sha(result.data) };
    }
    // Recheck every source after processing, so concurrent edits fail closed.
    if (sha(fs.readFileSync(file)) !== card.sha256) throw new Error(`Original changed during processing: ${card.id}`);
    records.push({ id, sourceId: card.id, label: card.name_ja, selectedVersion: card.selected_version, source: card.art_path, sourceSha256: card.sha256, sourceBytes: bytes.length, sourceWidth: card.width, sourceHeight: card.height, ...variants });
  }
  if (sha(fs.readFileSync(path.join(sourceRoot, 'manifest.json'))) !== sha(manifestBytes)) throw new Error('Adoption manifest changed');
  const report = { schemaVersion: 1, sourceEdition: source.edition, sourceManifestSha256: sha(manifestBytes), policy: 'Adopted original fronts only. Full aspect ratio retained. No backs or unadopted frame candidates.', cards: records };
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ count: records.length, originalBytes: records.reduce((sum, c) => sum + c.sourceBytes, 0), cardBytes: records.reduce((sum, c) => sum + c.cards.bytes, 0), thumbnailBytes: records.reduce((sum, c) => sum + c.thumbs.bytes, 0) }));
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { appId };
