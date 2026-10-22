// Export only card meanings: never import or run the staff browser entry point.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

function build(root) {
  const source = fs.readFileSync(path.join(root, 'public/js/tarotReading.js'), 'utf8').replace(/\r\n/g, '\n');
  const context = vm.createContext({ window: {}, document: {} });
  const code = source.replace(/\binit\(\);\s*$/, '');
  vm.runInContext(`${code}\nthis.tables = { allCards, getStaffGuidanceProfile, makeStaffTextPlain };`, context, { timeout: 3000 });
  const frame = {
    step: '今できる小さな行動', evidence: '今わかる事実', resource: '時間と気力',
    subject: '今の自分の状況', target: '関わる人', boundary: '自分を大切にできる範囲',
    result: '自分の取り組み', focus: '今の自分', support: '頼れる人や方法'
  };
  const clean = (text) => context.tables.makeStaffTextPlain(text).replace(/\{([a-z]+)\}/g, (_, key) => {
    if (!frame[key]) throw new Error(`Unresolved meaning field: ${key}`);
    return frame[key];
  });
  const overrides = {
    'major-10:reversed': { action: '今のペースを一度見直し、無理なく続けられる時間と気力の範囲を考えてみてください。' },
    'pentacle-1:reversed': { action: '今の取り組みに足りない準備や合意を一つ挙げ、確認できることから確かめてみてください。' },
    'pentacle-king:reversed': { action: '立場や見返りへの思いが、自分の判断に影響していないか振り返ってみてください。' }
  };
  const cards = context.tables.allCards.map((card) => ({
    id: card.id, kind: card.kind, deckId: card.deckId, label: card.label,
    number: card.number ?? null, rankId: card.rankId ?? null,
    search: card.search,
    meanings: Object.fromEntries(['upright', 'reversed'].map((direction) => {
      const profile = context.tables.getStaffGuidanceProfile(card, direction);
      return [direction, {
        keywords: card.keywords[direction],
        point: clean(profile.point), action: clean(profile.action), caution: clean(profile.caution),
        ...overrides[`${card.id}:${direction}`]
      }];
    }))
  }));
  if (cards.length !== 78 || new Set(cards.map((card) => card.id)).size !== 78) throw new Error('Expected 78 unique cards');
  return { schemaVersion: 1, source: 'public/js/tarotReading.js: staff guidance profiles', sourceSha256: createHash('sha256').update(source).digest('hex'), cards };
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const output = path.resolve(process.argv[3] || path.join(root, 'public/data/pirate-self-readings.json'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(build(root), null, 2)}\n`);
  console.log('Exported 78 cards / 156 orientations; staff entry point not executed.');
}
module.exports = { build };
