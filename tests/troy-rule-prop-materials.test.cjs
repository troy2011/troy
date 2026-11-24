const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');

test('shared prop audio resolves settled material stems from the module', async () => {
    const { rulePropSoundKey, rulePropSoundBase, rulePropSounds, rulePropSuits } =
        await import('../public/tabletop-v65/js/kingdomTable/rulePropMaterials.js');
    assert.equal(rulePropSoundKey('cut'), 'knife');
    assert.equal(rulePropSoundKey('back'), 'hourglass');
    for (const suit of ['coin','cup','sword','wand']) {
        assert.equal(rulePropSoundKey('lock', suit), 'mug-' + suit);
        assert.equal(rulePropSoundKey('lock', [suit]), 'mug-' + suit);
    }
    assert.deepEqual(rulePropSuits(['', 'sword', 'sword', 'cup']), ['sword','cup']);
    assert.equal(rulePropSoundKey('lock', ['', 'sword','cup']), 'mug-sword');
    assert.equal(rulePropSoundKey('lock', ['__proto__']), '');
    assert.equal(rulePropSoundKey('lock'), '');
    assert.equal(rulePropSoundKey('clear', 'coin'), '');
    for (const stem of rulePropSounds) {
        assert.ok((await readFile(new URL(stem + '.mp3', rulePropSoundBase))).length > 100);
    }
});
