const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

async function main() {
    const publicRoot = path.join(__dirname, '../public');
    const originalPath = path.join(publicRoot, 'Sprites/background/title.webp');
    const source = fs.readFileSync(originalPath);
    const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
    const originalHash = sha256(source);
    const output = path.join(publicRoot, 'assets/ui/boot');
    fs.mkdirSync(output, { recursive: true });
    const variants = [];
    const file = path.join(output, 'title.avif');
    const bytes = await sharp(source).avif({ quality: 55, effort: 5, chromaSubsampling: '4:4:4' }).toBuffer();
    fs.writeFileSync(file, bytes);
    variants.push({ file: path.relative(publicRoot, file), bytes: bytes.length, sha256: sha256(bytes) });
    if (sha256(fs.readFileSync(originalPath)) !== originalHash) throw new Error('Original boot image changed');
    console.log(JSON.stringify({ originalBytes: source.length, originalHash, originalPreserved: true, variants }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
