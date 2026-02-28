/**
 * 运行此脚本生成 PWA 图标（需要先 npm install sharp）
 * 用法：node generate-icons.js
 */
const fs = require('fs');
const path = require('path');

const svgContent = fs.readFileSync(path.join(__dirname, 'public/icons/icon.svg'));

async function generate() {
  try {
    const sharp = require('sharp');
    for (const size of [192, 512]) {
      await sharp(Buffer.from(svgContent))
        .resize(size, size)
        .png()
        .toFile(path.join(__dirname, `public/icons/icon-${size}.png`));
      console.log(`Generated icon-${size}.png`);
    }
  } catch {
    console.log('sharp not available, creating placeholder PNG files...');
    // Create minimal valid 1x1 PNG as placeholder
    const minPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(path.join(__dirname, 'public/icons/icon-192.png'), minPng);
    fs.writeFileSync(path.join(__dirname, 'public/icons/icon-512.png'), minPng);
    console.log('Placeholder icons created. Install sharp and re-run for proper icons.');
  }
}

generate();
