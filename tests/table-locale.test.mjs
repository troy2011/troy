import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveTableLanguage, localizedLabel, formatScoreHan} from '../public/tabletop-v65/js/kingdomTable/tableLocale.js';
test('language choice takes precedence and automatic uses the first device language',()=>{
 for (const tag of ['ja','ja-JP','ja_JP']) assert.equal(resolveTableLanguage('auto',tag),'ja');
 for (const tag of ['en-US','zh-TW','fr-FR']) assert.equal(resolveTableLanguage('auto',tag),'en');
 assert.equal(resolveTableLanguage('ja','en-GB'),'ja');
 assert.equal(resolveTableLanguage('en','ja-JP'),'en');
 assert.equal(localizedLabel('正義執行','en'),'Justice Served');
 assert.equal(localizedLabel('正義執行','ja'),'正義執行');
 assert.equal(formatScoreHan(1,'en'),'1 han');
 assert.equal(formatScoreHan(1,'ja'),'1翻');
});
