import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SVG_PATH = path.join(rootDir, 'public', 'favicon.svg');
const OUTPUT_192 = path.join(rootDir, 'public', 'icon-192.png');
const OUTPUT_512 = path.join(rootDir, 'public', 'icon-512.png');
const OUTPUT_APPLE = path.join(rootDir, 'public', 'apple-touch-icon.png');

async function generatePWAIcons() {
  console.log('Generating PWA icons...');
  try {
    const svgBuffer = await fs.readFile(SVG_PATH);

    // 192x192
    await sharp(svgBuffer)
      .resize(192, 192)
      .png()
      .toFile(OUTPUT_192);
    console.log('✅ Generated 192x192 icon');

    // 512x512
    await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile(OUTPUT_512);
    console.log('✅ Generated 512x512 icon');

    // Apple Touch Icon (180x180) with white background
    await sharp(svgBuffer)
      .resize(180, 180)
      .flatten({ background: '#ffffff' })
      .png()
      .toFile(OUTPUT_APPLE);
    console.log('✅ Generated Apple Touch Icon');

  } catch (err) {
    console.error('Failed to generate icons:', err);
  }
}

generatePWAIcons();
