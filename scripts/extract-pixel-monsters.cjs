#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');

const MONSTER_NUMBER = /monster[ _]?(\d+)/i;
const SPRITE_REF = /value:\s*\{fileID:\s*(-?\d+),\s*guid:\s*([0-9a-f]+),\s*type:\s*3\}/g;
const IMAGE_SUFFIXES = new Set(['.png', '.psd', '.tga', '.jpg', '.jpeg']);
const CANONICAL_KEYS = ['idle', 'attack', 'attack2', 'hurt', 'death'];
const MOVEMENT_KEYS = new Set(['idle', 'run', 'walk', 'fly', 'swim', 'creep']);
const PIXEL_SCALE = 2;
const ANIMATION_FPS = 10;

const MONSTER_NAMES = Object.freeze({
  'ismartal-vol1-monster-01': 'トゲマル',
  'ismartal-vol1-monster-02': 'グリモア',
  'ismartal-vol1-monster-03': 'ボーンテイル',
  'ismartal-vol1-monster-04': 'ツノガイ',
  'ismartal-vol1-monster-05': 'ピコアイ',
  'ismartal-vol1-monster-06': 'ゲルバット',
  'ismartal-vol1-monster-07': 'マシュロン',
  'ismartal-vol1-monster-08': 'モクリン',
  'ismartal-vol1-monster-09': 'ホタルビ',
  'ismartal-vol1-monster-10': 'リーフロ',
  'ismartal-vol1-monster-11': 'ガルネズ',
  'ismartal-vol1-monster-12': 'フェリカ',
  'ismartal-vol1-monster-13': 'ミドロ',
  'ismartal-vol1-monster-14': 'ポルポ',
  'ismartal-vol1-monster-15': 'ガブリラ',
  'ismartal-vol1-monster-16': 'ツキバネ',
  'ismartal-vol1-monster-17': 'コバット',
  'ismartal-vol1-monster-18': 'ラムネロ',
  'ismartal-vol1-monster-19': 'チュロ',
  'ismartal-vol1-monster-20': 'アクエル',
  'ismartal-vol2-monster-01': 'フロス',
  'ismartal-vol2-monster-02': 'パピル',
  'ismartal-vol2-monster-03': 'モスガン',
  'ismartal-vol2-monster-04': 'カブロン',
  'ismartal-vol2-monster-05': 'リルフィ',
  'ismartal-vol2-monster-06': 'グリバト',
  'ismartal-vol2-monster-07': 'バルガン',
  'ismartal-vol2-monster-08': 'ルビット',
  'ismartal-vol2-monster-09': 'ノッカ',
  'ismartal-vol2-monster-10': 'ウッドラ',
  'ismartal-vol2-monster-11': 'ビズン',
  'ismartal-vol2-monster-12': 'ケロッツ',
  'ismartal-vol2-monster-13': 'コロック',
  'ismartal-vol2-monster-14': 'スパイナ',
  'ismartal-vol2-monster-15': 'アビソス',
  'ismartal-vol2-monster-16': 'オルビス',
  'ismartal-vol2-monster-17': 'メカノ',
  'ismartal-vol2-monster-18': 'フレマ',
  'ismartal-vol2-monster-19': 'バクス',
  'ismartal-vol2-monster-20': 'ネブラ',
  'ismartal-vol3-monster-01': 'グラヴァ',
  'ismartal-vol3-monster-02': 'イグニス',
  'ismartal-vol3-monster-03': 'トルネ',
  'ismartal-vol3-monster-04': 'プルン',
  'ismartal-vol3-monster-05': 'モクモ',
  'ismartal-vol3-monster-06': 'ヨミル',
  'ismartal-vol3-monster-07': 'グールン',
  'ismartal-vol3-monster-08': 'キノガル',
  'ismartal-vol3-monster-09': 'クロモ',
  'ismartal-vol3-monster-10': 'ノクス'
});

const LARGE_IDS = new Set([
  'ismartal-vol2-monster-07',
  'ismartal-vol2-monster-15',
  'ismartal-vol2-monster-16'
]);
const FLYING_IDS = new Set([
  'ismartal-vol1-monster-09', 'ismartal-vol1-monster-12',
  'ismartal-vol1-monster-16', 'ismartal-vol1-monster-17',
  'ismartal-vol1-monster-20', 'ismartal-vol2-monster-02',
  'ismartal-vol2-monster-03', 'ismartal-vol2-monster-11',
  'ismartal-vol2-monster-16', 'ismartal-vol2-monster-18',
  'ismartal-vol3-monster-05'
]);
const FLIP_X_IDS = new Set([
  'ismartal-vol2-monster-08', 'ismartal-vol2-monster-09',
  'ismartal-vol2-monster-10', 'ismartal-vol2-monster-19',
  'ismartal-vol3-monster-06'
]);
const FLIP_Y_IDS = new Set(['ismartal-vol2-monster-06']);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function cleanPathname(raw) {
  return String(raw || '').replaceAll('\0', '').replace(/(?:\r?\n00)?\s*$/, '').trim();
}

function unpackPackage(packagePath, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  execFileSync('tar', ['-xf', packagePath, '-C', destination], { stdio: 'inherit' });
}

function readEntries(packageDir) {
  const entries = new Map();
  for (const item of fs.readdirSync(packageDir, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const entryDir = path.join(packageDir, item.name);
    const pathnamePath = path.join(entryDir, 'pathname');
    if (!fs.existsSync(pathnamePath)) continue;
    const pathname = cleanPathname(fs.readFileSync(pathnamePath, 'utf8'));
    const asset = path.join(entryDir, 'asset');
    const meta = path.join(entryDir, 'asset.meta');
    entries.set(item.name, {
      guid: item.name,
      pathname,
      asset: fs.existsSync(asset) ? asset : null,
      meta: fs.existsSync(meta) ? meta : null
    });
  }
  return entries;
}

function parseSpriteRectangles(metaPath) {
  const rectangles = new Map();
  if (!metaPath) return rectangles;
  const text = fs.readFileSync(metaPath, 'utf8');
  const marker = text.indexOf('\n    sprites:');
  if (marker < 0) return rectangles;
  const records = text.slice(marker).split(/(?=^    - serializedVersion:)/m);
  for (const record of records) {
    const id = record.match(/^      internalID:\s*(-?\d+)\s*$/m);
    const rect = record.match(
      /^      rect:\s*$[\s\S]*?^        x:\s*(-?\d+)\s*$[\s\S]*?^        y:\s*(-?\d+)\s*$[\s\S]*?^        width:\s*(\d+)\s*$[\s\S]*?^        height:\s*(\d+)\s*$/m
    );
    if (id && rect) rectangles.set(id[1], rect.slice(1).map(Number));
  }
  return rectangles;
}

function parseAnimation(assetPath) {
  const text = fs.readFileSync(assetPath, 'utf8');
  const start = text.indexOf('  m_PPtrCurves:');
  const end = text.indexOf('  m_SampleRate:', start);
  const curve = start >= 0 && end > start ? text.slice(start, end) : '';
  const refs = Array.from(curve.matchAll(SPRITE_REF), (match) => ({ fileId: match[1], guid: match[2] }));
  const sampleRate = text.match(/^  m_SampleRate:\s*([0-9.]+)\s*$/m);
  return { refs, fps: sampleRate ? Number(sampleRate[1]) : 12 };
}

function animationKind(pathname) {
  const monster = pathname.match(MONSTER_NUMBER);
  if (!monster || !pathname.toLowerCase().endsWith('.anim')) return null;
  const stem = path.posix.parse(pathname).name.toLowerCase().replaceAll('_', ' ');
  const compact = stem.replace(/[^a-z0-9]+/g, '');
  const number = Number(monster[1]);
  if (stem === 'idle') return { number, kind: 'idle', priority: 0 };
  if (['fly', 'walk', 'run', 'swim', 'creep', 'ilde'].includes(stem)) {
    return { number, kind: 'idle', priority: 1 };
  }
  if (['attack', 'attack1', 'rollattack'].includes(compact)) {
    return { number, kind: 'attack', priority: 0 };
  }
  if (['attack2', 'spikeattack', 'roarattack'].includes(compact)) {
    return { number, kind: 'attack2', priority: 0 };
  }
  if (compact.startsWith('attack') && !compact.endsWith('fx')) {
    return { number, kind: 'attack', priority: 1 };
  }
  if (['hurt', 'hit'].includes(compact)) return { number, kind: 'hurt', priority: 0 };
  if (compact.startsWith('hurt') || compact.startsWith('hit')) {
    return { number, kind: 'hurt', priority: 1 };
  }
  if (['death', 'dead'].includes(compact)) return { number, kind: 'death', priority: 0 };
  if (compact.startsWith('death') || compact.startsWith('dead')) {
    return { number, kind: 'death', priority: 1 };
  }
  return null;
}

function chooseCanonicalAnimations(entries) {
  const candidates = new Map();
  for (const entry of entries.values()) {
    const classified = animationKind(entry.pathname);
    if (!classified || !entry.asset) continue;
    if (!candidates.has(classified.number)) candidates.set(classified.number, new Map());
    const choices = candidates.get(classified.number);
    const current = choices.get(classified.kind);
    if (!current || classified.priority < current.priority) {
      choices.set(classified.kind, { priority: classified.priority, entry });
    }
  }
  const selected = new Map();
  for (const [number, choices] of candidates) {
    selected.set(number, new Map(Array.from(choices, ([kind, value]) => [kind, value.entry])));
  }
  return selected;
}

function normalizeAnimationKey(pathname) {
  const stem = path.posix.parse(pathname).name.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return stem.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'animation';
}

function collectAnimationClips(entries) {
  const clips = new Map();
  const used = new Map();
  const sorted = Array.from(entries.values()).sort((a, b) => a.pathname.localeCompare(b.pathname));
  for (const entry of sorted) {
    const monster = entry.pathname.match(MONSTER_NUMBER);
    if (!monster || !entry.asset || !entry.pathname.toLowerCase().endsWith('.anim')) continue;
    const number = Number(monster[1]);
    if (!clips.has(number)) clips.set(number, []);
    if (!used.has(number)) used.set(number, new Set());
    const base = normalizeAnimationKey(entry.pathname);
    let key = base;
    let suffix = 2;
    while (used.get(number).has(key)) key = `${base}_${suffix++}`;
    used.get(number).add(key);
    clips.get(number).push({ key, entry });
  }
  return clips;
}

function isImageEntry(entry) {
  return Boolean(entry.asset && IMAGE_SUFFIXES.has(path.posix.extname(entry.pathname).toLowerCase()));
}

function sameKeys(left, right) {
  if (left.size !== right.size) return false;
  return Array.from(left.keys()).every((key) => right.has(key));
}

function buildPreferredTextureMap(entries) {
  const images = Array.from(entries.values()).filter(isImageEntry);
  const byPath = new Map(images.map((entry) => [entry.pathname.toLowerCase(), entry]));
  const black = images.filter((entry) => entry.pathname.toLowerCase().includes('/sprites (black outline)/'));
  if (!black.length) return { aliases: new Map(), style: 'default', images };
  const aliases = new Map();
  for (const regular of images.filter((entry) => entry.pathname.toLowerCase().includes('/sprites/'))) {
    const preferredPath = regular.pathname.replace(/\/Sprites\//i, '/Sprites (black outline)/');
    const preferred = byPath.get(preferredPath.toLowerCase());
    if (!preferred) throw new Error(`Missing black outline texture: ${regular.pathname}`);
    const regularRects = parseSpriteRectangles(regular.meta);
    const preferredRects = parseSpriteRectangles(preferred.meta);
    if (!sameKeys(regularRects, preferredRects)) {
      throw new Error(`Black outline sprite IDs differ: ${regular.pathname}`);
    }
    aliases.set(regular.guid, preferred);
  }
  return { aliases, style: 'black-outline', images: black };
}

async function loadRawImage(entry, imageCache) {
  if (imageCache.has(entry.guid)) return imageCache.get(entry.guid);
  const loaded = await sharp(entry.asset).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const image = { data: loaded.data, width: loaded.info.width, height: loaded.info.height };
  imageCache.set(entry.guid, image);
  return image;
}

function cropRaw(image, rect) {
  const [x, y, width, height] = rect;
  const top = image.height - y - height;
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((top + row) * image.width + x) * 4;
    const targetStart = row * width * 4;
    image.data.copy(data, targetStart, sourceStart, sourceStart + width * 4);
  }
  return { data, width, height };
}

async function cropAnimationFrames(refs, entries, preferred, rectCache, imageCache) {
  const frames = [];
  const textureGuids = new Set();
  for (const ref of refs) {
    const texture = preferred.get(ref.guid) || entries.get(ref.guid);
    if (!texture?.asset || !texture.meta) continue;
    textureGuids.add(texture.guid);
    if (!rectCache.has(texture.guid)) rectCache.set(texture.guid, parseSpriteRectangles(texture.meta));
    const rect = rectCache.get(texture.guid).get(ref.fileId);
    if (!rect) continue;
    frames.push(cropRaw(await loadRawImage(texture, imageCache), rect));
  }
  return { frames, textureGuids };
}

async function cropImageFrames(entry, rectCache, imageCache) {
  const image = await loadRawImage(entry, imageCache);
  if (!rectCache.has(entry.guid)) rectCache.set(entry.guid, parseSpriteRectangles(entry.meta));
  const rectangles = rectCache.get(entry.guid);
  return rectangles.size
    ? Array.from(rectangles.values(), (rect) => cropRaw(image, rect))
    : [{ data: Buffer.from(image.data), width: image.width, height: image.height }];
}

function alphaBounds(frame) {
  let left = frame.width;
  let top = frame.height;
  let right = 0;
  let bottom = 0;
  let visible = false;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (frame.data[(y * frame.width + x) * 4 + 3] === 0) continue;
      visible = true;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return visible ? [left, top, right, bottom] : null;
}

function placeFrame(frame, width, height) {
  const data = Buffer.alloc(width * height * 4);
  const left = Math.floor((width - frame.width) / 2);
  const top = height - frame.height;
  for (let row = 0; row < frame.height; row += 1) {
    const sourceStart = row * frame.width * 4;
    const targetStart = ((top + row) * width + left) * 4;
    frame.data.copy(data, targetStart, sourceStart, sourceStart + frame.width * 4);
  }
  return { data, width, height };
}

function cropCanvas(frame, bounds) {
  const [left, top, right, bottom] = bounds;
  return cropRaw(
    { data: frame.data, width: frame.width, height: frame.height },
    [left, frame.height - bottom, right - left, bottom - top]
  );
}

function normalizeAndTrim(animationFrames) {
  const allFrames = Array.from(animationFrames.values()).flatMap((value) => value.frames);
  const canvasWidth = Math.max(...allFrames.map((frame) => frame.width));
  const canvasHeight = Math.max(...allFrames.map((frame) => frame.height));
  const normalized = new Map();
  let union = null;
  for (const [key, value] of animationFrames) {
    const frames = value.frames.map((frame) => placeFrame(frame, canvasWidth, canvasHeight));
    for (const frame of frames) {
      const bounds = alphaBounds(frame);
      if (!bounds) continue;
      union = union
        ? [Math.min(union[0], bounds[0]), Math.min(union[1], bounds[1]), Math.max(union[2], bounds[2]), Math.max(union[3], bounds[3])]
        : bounds;
    }
    normalized.set(key, { ...value, frames });
  }
  union ||= [0, 0, canvasWidth, canvasHeight];
  for (const [key, value] of normalized) {
    normalized.set(key, { ...value, frames: value.frames.map((frame) => cropCanvas(frame, union)) });
  }
  return { animations: normalized, width: union[2] - union[0], height: union[3] - union[1] };
}

async function packFrames(frames, destination, frameWidth, frameHeight) {
  const columns = Math.min(10, frames.length);
  const rows = Math.ceil(frames.length / columns);
  const sheetWidth = frameWidth * columns;
  const sheetHeight = frameHeight * rows;
  const data = Buffer.alloc(sheetWidth * sheetHeight * 4);
  frames.forEach((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * frameWidth + Math.floor((frameWidth - frame.width) / 2);
    const top = row * frameHeight + (frameHeight - frame.height);
    for (let sourceRow = 0; sourceRow < frame.height; sourceRow += 1) {
      const sourceStart = sourceRow * frame.width * 4;
      const targetStart = ((top + sourceRow) * sheetWidth + left) * 4;
      frame.data.copy(data, targetStart, sourceStart, sourceStart + frame.width * 4);
    }
  });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await sharp(data, { raw: { width: sheetWidth, height: sheetHeight, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(destination);
  return columns;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getAnchor(frames, preserveAltitude, flipY) {
  const bounds = frames.map(alphaBounds).filter(Boolean);
  if (!bounds.length) {
    return { x: frames[0].width / 2, y: frames[0].height, mode: preserveAltitude ? 'air' : 'ground' };
  }
  const x = median(bounds.map((bbox) => (bbox[0] + bbox[2]) / 2));
  const y = preserveAltitude
    ? frames[0].height
    : flipY
      ? frames[0].height - median(bounds.map((bbox) => bbox[1]))
      : median(bounds.map((bbox) => bbox[3]));
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, mode: preserveAltitude ? 'air' : 'ground' };
}

function uniqueKey(base, animations) {
  let key = base;
  let suffix = 2;
  while (Object.hasOwn(animations, key)) key = `${base}_${suffix++}`;
  return key;
}

function animationRecord({ volume, number, key, frames, columns, width, height, anchor, sourceClip, sourceImage, style, loop }) {
  return {
    src: `./Sprites/pixel-monsters/vol${volume}/monster-${String(number).padStart(2, '0')}/${key}.png`,
    frameCount: frames.length,
    columns,
    fps: ANIMATION_FPS,
    loop,
    frameWidth: width,
    frameHeight: height,
    anchor,
    ...(sourceClip ? { sourceClip } : {}),
    ...(sourceImage ? { sourceImage } : {}),
    sourceImageStyle: style
  };
}

async function buildVolume(volume, entries, outputRoot) {
  const selectedByMonster = chooseCanonicalAnimations(entries);
  const clipsByMonster = collectAnimationClips(entries);
  const preferred = buildPreferredTextureMap(entries);
  const imagesByMonster = new Map();
  for (const entry of preferred.images) {
    const match = entry.pathname.match(MONSTER_NUMBER);
    if (!match) throw new Error(`Image has no monster number: ${entry.pathname}`);
    const number = Number(match[1]);
    if (!imagesByMonster.has(number)) imagesByMonster.set(number, []);
    imagesByMonster.get(number).push(entry);
  }

  const rectCache = new Map();
  const imageCache = new Map();
  const numbers = Array.from(new Set([
    ...selectedByMonster.keys(),
    ...clipsByMonster.keys(),
    ...imagesByMonster.keys()
  ])).sort((a, b) => a - b);
  const monsters = [];

  for (const number of numbers) {
    const selected = new Map(selectedByMonster.get(number) || []);
    const clips = clipsByMonster.get(number) || [];
    if (!selected.has('idle') && (selected.has('attack') || selected.has('attack2'))) {
      selected.set('idle', selected.get('attack') || selected.get('attack2'));
    }
    if (!selected.has('idle') && clips.length) selected.set('idle', clips[0].entry);
    if (!selected.has('idle')) throw new Error(`Monster ${volume}-${number} has no usable animation`);

    const monsterId = `ismartal-vol${volume}-monster-${String(number).padStart(2, '0')}`;
    const preserveAltitude = FLYING_IDS.has(monsterId);
    const flipY = FLIP_Y_IDS.has(monsterId);
    const outputDir = path.join(outputRoot, `vol${volume}`, `monster-${String(number).padStart(2, '0')}`);
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const canonical = new Map();
    const canonicalSources = new Map();
    const coveredImages = new Set();
    for (const kind of CANONICAL_KEYS) {
      let entry = selected.get(kind);
      if (!entry && kind === 'attack2') continue;
      entry ||= selected.get('idle');
      let parsed = parseAnimation(entry.asset);
      let cropped = await cropAnimationFrames(parsed.refs, entries, preferred.aliases, rectCache, imageCache);
      if (!cropped.frames.length && kind !== 'idle') {
        entry = selected.get('idle');
        parsed = parseAnimation(entry.asset);
        cropped = await cropAnimationFrames(parsed.refs, entries, preferred.aliases, rectCache, imageCache);
      }
      if (!cropped.frames.length) throw new Error(`No frames for ${entry.pathname}`);
      canonical.set(kind, { frames: cropped.frames, fps: parsed.fps });
      canonicalSources.set(kind, entry);
      cropped.textureGuids.forEach((guid) => coveredImages.add(guid));
    }

    const canonicalNormalized = normalizeAndTrim(canonical);
    const idleAnchor = getAnchor(canonicalNormalized.animations.get('idle').frames, preserveAltitude, flipY);
    const animations = {};
    const representedClips = new Set();
    for (const [kind, value] of canonicalNormalized.animations) {
      const source = canonicalSources.get(kind);
      const columns = await packFrames(value.frames, path.join(outputDir, `${kind}.png`), canonicalNormalized.width, canonicalNormalized.height);
      animations[kind] = animationRecord({
        volume, number, key: kind, frames: value.frames, columns,
        width: canonicalNormalized.width, height: canonicalNormalized.height,
        anchor: idleAnchor, sourceClip: source.pathname, style: preferred.style,
        loop: kind === 'idle'
      });
      representedClips.add(source.pathname);
    }

    for (const clip of clips) {
      const parsed = parseAnimation(clip.entry.asset);
      const cropped = await cropAnimationFrames(parsed.refs, entries, preferred.aliases, rectCache, imageCache);
      if (!cropped.frames.length) throw new Error(`No frames for ${clip.entry.pathname}`);
      cropped.textureGuids.forEach((guid) => coveredImages.add(guid));
      representedClips.add(clip.entry.pathname);
      if (animations[clip.key]?.sourceClip === clip.entry.pathname) continue;
      const key = uniqueKey(clip.key, animations);
      const normalized = normalizeAndTrim(new Map([[key, { frames: cropped.frames, fps: parsed.fps }]]));
      const frames = normalized.animations.get(key).frames;
      const anchor = getAnchor(frames, preserveAltitude, flipY);
      const columns = await packFrames(frames, path.join(outputDir, `${key}.png`), normalized.width, normalized.height);
      animations[key] = animationRecord({
        volume, number, key, frames, columns, width: normalized.width, height: normalized.height,
        anchor, sourceClip: clip.entry.pathname, style: preferred.style,
        loop: MOVEMENT_KEYS.has(normalizeAnimationKey(clip.entry.pathname))
      });
    }

    const monsterImages = [...(imagesByMonster.get(number) || [])].sort((a, b) => a.pathname.localeCompare(b.pathname));
    for (const entry of monsterImages) {
      if (coveredImages.has(entry.guid)) continue;
      const rawFrames = await cropImageFrames(entry, rectCache, imageCache);
      const key = uniqueKey(`image_${normalizeAnimationKey(entry.pathname)}`, animations);
      const normalized = normalizeAndTrim(new Map([[key, { frames: rawFrames, fps: 0 }]]));
      const frames = normalized.animations.get(key).frames;
      const anchor = getAnchor(frames, preserveAltitude, flipY);
      const columns = await packFrames(frames, path.join(outputDir, `${key}.png`), normalized.width, normalized.height);
      animations[key] = animationRecord({
        volume, number, key, frames, columns, width: normalized.width, height: normalized.height,
        anchor, sourceImage: entry.pathname, style: preferred.style, loop: false
      });
      coveredImages.add(entry.guid);
    }

    const missingClips = clips.filter((clip) => !representedClips.has(clip.entry.pathname)).map((clip) => clip.entry.pathname);
    const missingImages = monsterImages.filter((entry) => !coveredImages.has(entry.guid)).map((entry) => entry.pathname);
    if (missingClips.length || missingImages.length) {
      throw new Error(`Incomplete extraction for ${monsterId}: ${JSON.stringify({ missingClips, missingImages })}`);
    }

    monsters.push({
      id: monsterId,
      name: MONSTER_NAMES[monsterId] || `モンスター${String(number).padStart(2, '0')}`,
      volume,
      number,
      frameWidth: canonicalNormalized.width,
      frameHeight: canonicalNormalized.height,
      displayWidth: canonicalNormalized.width * PIXEL_SCALE,
      pixelScale: PIXEL_SCALE,
      renderMode: 'pixel',
      sizeClass: LARGE_IDS.has(monsterId) ? 'large' : 'normal',
      isBoss: LARGE_IDS.has(monsterId),
      idleAnchor,
      sourceImageStyle: preferred.style,
      sourceAnimationClipCount: clips.length,
      sourceImageCount: monsterImages.length,
      ...(FLIP_X_IDS.has(monsterId) ? { flipX: true } : {}),
      ...(FLIP_Y_IDS.has(monsterId) ? { flipY: true } : {}),
      animations
    });
  }

  const expectedClips = Array.from(entries.values()).filter((entry) => entry.pathname.toLowerCase().endsWith('.anim')).length;
  const expectedImages = preferred.images.length;
  const coveredClips = monsters.reduce((total, monster) => total + monster.sourceAnimationClipCount, 0);
  const coveredImages = monsters.reduce((total, monster) => total + monster.sourceImageCount, 0);
  if (coveredClips !== expectedClips || coveredImages !== expectedImages) {
    throw new Error(`Volume ${volume} coverage mismatch: clips ${coveredClips}/${expectedClips}, images ${coveredImages}/${expectedImages}`);
  }
  return monsters;
}

async function main() {
  const defaultPackageRoot = path.join(
    process.env.APPDATA || '',
    'Unity', 'Asset Store-5.x', 'Ismartal', 'Textures Materials2D Characters'
  );
  const packageRoot = path.resolve(option('--package-root', defaultPackageRoot));
  const workDir = path.resolve(option('--work-dir', 'tmp/pixel-monsters-unitypackage-index'));
  const outputRoot = path.resolve(option('--output', 'public/Sprites/pixel-monsters'));
  const moduleOutput = path.resolve(option('--module-output', 'public/js/pixelMonstersManifest.js'));
  const packageNames = {
    1: 'Pixel Monsters Vol1.unitypackage',
    2: 'Pixel Monsters Vol2.unitypackage',
    3: 'Pixel Monsters Vol3.unitypackage'
  };

  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const manifest = [];
  for (const volume of [1, 2, 3]) {
    const packagePath = path.join(packageRoot, packageNames[volume]);
    if (!fs.existsSync(packagePath)) throw new Error(`Missing package: ${packagePath}`);
    const unpacked = path.join(workDir, `vol${volume}`);
    unpackPackage(packagePath, unpacked);
    const monsters = await buildVolume(volume, readEntries(unpacked), outputRoot);
    manifest.push(...monsters);
    const clips = monsters.reduce((total, monster) => total + monster.sourceAnimationClipCount, 0);
    const images = monsters.reduce((total, monster) => total + monster.sourceImageCount, 0);
    console.log(`Vol.${volume}: ${monsters.length} monsters, ${clips} clips, ${images} preferred images`);
  }

  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), json, 'utf8');
  fs.mkdirSync(path.dirname(moduleOutput), { recursive: true });
  fs.writeFileSync(
    moduleOutput,
    `// Generated by scripts/extract-pixel-monsters.cjs from the purchased Unity packages.\nexport const PIXEL_MONSTERS_ROSTER = ${JSON.stringify(manifest, null, 2)};\n`,
    'utf8'
  );
  console.log(`Extracted ${manifest.length} animated monsters to ${outputRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
