const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// This is an allowlist, not a directory mirror. Keep host auth, realtime
// transport, menu, storage, music, and every unreviewed dependency out of it.
const troyPrefix = 'public/tabletop-v65/';
const sitesPrefix = 'public/';
const names = [
    'abilityNames', 'ai', 'cardAbility', 'cheerPlan', 'choiceFocus', 'effects',
    'handInspect', 'handOrder', 'match', 'rating', 'roleAccents', 'roleCinematic',
    'roleJuicePlan', 'roleJuiceSound', 'roleRecordKey', 'rules', 'rulesBook',
    'selectedCardEffect', 'sfxReal', 'tableFeedback', 'tableHost', 'tavernTutorial', 'turnOrder',
    'tutorialScript',
];
const js = names.map(name => 'js/kingdomTable/' + name + '.js');
const props = [
    'hourglass-reference-shadow', 'knife-reference-shadow', 'tankard-coin-shadow',
    'tankard-cup-shadow', 'tankard-shadow', 'tankard-sword-shadow', 'tankard-wand-shadow',
];
const foley = ['hourglass.mp3', 'knife.mp3', 'mug-coin.mp3', 'mug-cup.mp3', 'mug-sword.mp3', 'mug-wand.mp3', 'CREDITS.txt', 'tracks.json'];
const samePath = name => ({ troy: troyPrefix + name, sites: sitesPrefix + name });
const files = [
    ...js.map(samePath),
    samePath('js/kingdomTable/package.json'),
    samePath('css/tarot-common-board.css'),
    samePath('assets/tarot-kingdom-table/tavern-v1/chips.webp'),
    ...props.map(name => ({
        troy: troyPrefix + 'assets/pirate-tarot/rule-props/' + name + '.webp',
        sites: sitesPrefix + 'assets/tarot-kingdom-table/rule-props/' + name + '.webp',
    })),
    ...foley.map(name => ({
        troy: troyPrefix + 'assets/tarot-kingdom-table/prop-foley-v1/' + name,
        sites: sitesPrefix + 'assets/tarot-kingdom-table/rule-prop-foley-v1/' + name,
    })),
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const source = path.resolve(__dirname, '..');

function manifest() {
    const entries = files.map(spec => {
        const bytes = fs.readFileSync(path.join(source, spec.troy));
        if (/\.(js|css|json|txt)$/.test(spec.troy) && bytes.toString('utf8').includes('\r\n')) {
            throw Error('Shared text must use LF: ' + spec.troy);
        }
        return { ...spec, bytes, sha256: digest(bytes) };
    });
    const closure = new Set(entries.map(entry => entry.troy));
    for (const { troy, bytes } of entries.filter(e => e.troy.endsWith('.js') || e.troy.endsWith('.css'))) {
        // Static ESM imports and stylesheet URLs, not dynamically chosen runtime assets.
        const pattern = troy.endsWith('.js')
            ? /^(?:import|export)\b[^\n]*?\bfrom\s*['"]([^'"]+)['"]/gm
            : /url\(['"]?([^'")]+)['"]?\)/g;
        for (const [, specifier] of bytes.toString('utf8').matchAll(pattern)) {
            if (!specifier.startsWith('.')) continue;
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(troy), specifier.split(/[?#]/)[0]));
            if (!closure.has(target)) throw Error('Unpackaged static dependency: ' + troy + ' -> ' + target);
        }
    }
    return entries;
}

function verify(sitesRoot, entries) {
    const mismatch = [];
    for (const item of entries) {
        const absolute = path.join(sitesRoot, item.sites);
        if (!fs.existsSync(absolute)) mismatch.push('MISSING ' + item.sites);
        else if (digest(fs.readFileSync(absolute)) !== item.sha256) mismatch.push('DIFF    ' + item.sites);
    }
    if (mismatch.length) throw Error(mismatch.join('\n'));
    console.log('Tabletop shared renderer/rules subset: ' + entries.length + ' files match byte-for-byte.');
}

function exportBundle(destination, entries) {
    // A new external staging directory only. No user checkout is ever modified
    // and no existing destination file can be overwritten by this command.
    const target = path.resolve(destination);
    const within = path.relative(source, target);
    if (!within || (!within.startsWith('..' + path.sep) && !path.isAbsolute(within))) {
        throw Error('Export outside the source checkout to a new staging directory.');
    }
    fs.mkdirSync(target);
    for (const item of entries) {
        const name = path.join(target, item.sites);
        fs.mkdirSync(path.dirname(name), { recursive: true });
        fs.writeFileSync(name, item.bytes, { flag: 'wx' });
    }
    const sha = entries.map(({troy,sites,sha256,bytes}) => ({troy,sites,sha256,size:bytes.length}));
    fs.writeFileSync(path.join(target, 'tabletop-shared-manifest.json'),
        JSON.stringify({ schema: 1, source: 'TROY', files: sha }, null, 2) + '\n', {flag:'wx'});
    console.log('Staged ' + entries.length + ' verified shared files.');
}

try {
    const [action, target, ...extras] = process.argv.slice(2);
    if (extras.length || !target || !['--verify-sites','--export-sites'].includes(action)) {
        throw Error('Usage: node scripts/tabletop-shared.cjs [--verify-sites <checkout> | --export-sites <new staging dir>]');
    }
    const entries = manifest();
    if (action === '--verify-sites') verify(path.resolve(target), entries);
    else exportBundle(target, entries);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
