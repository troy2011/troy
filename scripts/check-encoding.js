#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const UTF8_DECODER_FATAL = new TextDecoder('utf-8', { fatal: true });
const UTF8_DECODER = new TextDecoder('utf-8');

const TARGET_EXTENSIONS = new Set([
    '.js',
    '.json',
    '.css',
    '.html',
    '.md',
    '.env',
    '.yml',
    '.yaml',
    '.txt'
]);

// Existing known mojibake in large legacy files is ignored for full-repo CI checks.
// New staged changes are still checked strictly.
const MOJIBAKE_IGNORE_PATHS = new Set([
    'public/WorldMapScene.js',
    'public/css/island.css'
]);

const MOJIBAKE_REGEX = /[\uFFFD\u7E5D\u7E3A\u8708]/u;

function run(command) {
    return cp.execSync(command, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/');
}

function isTargetFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return TARGET_EXTENSIONS.has(ext);
}

function getCandidateFiles(stagedOnly) {
    const gitCmd = stagedOnly
        ? 'git diff --cached --name-only --diff-filter=ACMRTUXB'
        : 'git ls-files';
    const output = run(gitCmd);
    if (!output) return [];
    return output
        .split(/\r?\n/u)
        .map((p) => normalizePath(p.trim()))
        .filter(Boolean)
        .filter(isTargetFile)
        .filter((p) => fs.existsSync(p))
        .sort();
}

function findFirstMojibakeLine(text) {
    const lines = text.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i += 1) {
        if (MOJIBAKE_REGEX.test(lines[i])) {
            return { line: i + 1, text: lines[i] };
        }
    }
    return null;
}

function main() {
    const stagedOnly = process.argv.includes('--staged');
    const files = getCandidateFiles(stagedOnly);
    const failures = [];

    for (const file of files) {
        const bytes = fs.readFileSync(file);
        let decoded = null;
        let utf8Valid = true;

        try {
            UTF8_DECODER_FATAL.decode(bytes);
            decoded = UTF8_DECODER.decode(bytes);
        } catch (error) {
            utf8Valid = false;
        }

        if (!utf8Valid) {
            failures.push(`${file}: invalid UTF-8 byte sequence`);
            continue;
        }

        if (!stagedOnly && MOJIBAKE_IGNORE_PATHS.has(file)) {
            continue;
        }

        const hit = findFirstMojibakeLine(decoded);
        if (hit) {
            failures.push(`${file}:${hit.line} suspicious mojibake -> ${hit.text}`);
        }
    }

    if (failures.length > 0) {
        console.error('[encoding-check] FAILED');
        failures.forEach((msg) => console.error(`- ${msg}`));
        process.exit(1);
    }

    console.log(
        `[encoding-check] OK (${files.length} files checked${stagedOnly ? ', staged only' : ''})`
    );
}

main();
