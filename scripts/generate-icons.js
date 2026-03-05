// Generate PWA icon PNGs using only Node.js built-in modules
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPNGChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crcData = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function generateIcon(size, bgColor, text) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type (RGB)
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Image data - solid color with a simple "ST" text rendered as pixels
  const r = (bgColor >> 16) & 0xff;
  const g = (bgColor >> 8) & 0xff;
  const b = bgColor & 0xff;

  // Create raw image data (filter byte + RGB for each pixel per row)
  const rawData = Buffer.alloc(size * (1 + size * 3));

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 3);
    rawData[rowOffset] = 0; // No filter

    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 3;

      // Add rounded corners
      const cornerRadius = Math.floor(size * 0.15);
      const inCorner = isInRoundedRect(x, y, size, size, cornerRadius);

      if (!inCorner) {
        rawData[px] = 255;
        rawData[px + 1] = 255;
        rawData[px + 2] = 255;
        continue;
      }

      // Add a subtle inner circle/highlight area
      const cx = size / 2, cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const maxDist = size * 0.42;

      if (dist < maxDist) {
        // Inner area - slightly lighter
        const factor = 1 + 0.15 * (1 - dist / maxDist);
        rawData[px] = Math.min(255, Math.floor(r * factor));
        rawData[px + 1] = Math.min(255, Math.floor(g * factor));
        rawData[px + 2] = Math.min(255, Math.floor(b * factor));
      } else {
        rawData[px] = r;
        rawData[px + 1] = g;
        rawData[px + 2] = b;
      }
    }
  }

  // Draw "ST" text (Science Tokyo) - simple pixel font
  drawText(rawData, size, 255, 255, 255);

  const compressed = zlib.deflateSync(rawData);

  const ihdrChunk = createPNGChunk('IHDR', ihdr);
  const idatChunk = createPNGChunk('IDAT', compressed);
  const iendChunk = createPNGChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function isInRoundedRect(x, y, w, h, r) {
  // Check if point is inside rounded rectangle
  if (x < r && y < r) {
    return Math.sqrt((x - r) ** 2 + (y - r) ** 2) <= r;
  }
  if (x >= w - r && y < r) {
    return Math.sqrt((x - (w - r - 1)) ** 2 + (y - r) ** 2) <= r;
  }
  if (x < r && y >= h - r) {
    return Math.sqrt((x - r) ** 2 + (y - (h - r - 1)) ** 2) <= r;
  }
  if (x >= w - r && y >= h - r) {
    return Math.sqrt((x - (w - r - 1)) ** 2 + (y - (h - r - 1)) ** 2) <= r;
  }
  return true;
}

function drawText(rawData, size, tr, tg, tb) {
  // Simple bitmap font for "ST" - scaled to icon size
  const letterS = [
    [0,1,1,1],
    [1,0,0,0],
    [0,1,1,0],
    [0,0,0,1],
    [1,1,1,0],
  ];
  const letterT = [
    [1,1,1],
    [0,1,0],
    [0,1,0],
    [0,1,0],
    [0,1,0],
  ];

  const scale = Math.floor(size / 12);
  const totalWidth = (4 + 1 + 3) * scale; // S width + gap + T width
  const totalHeight = 5 * scale;
  const startX = Math.floor((size - totalWidth) / 2);
  const startY = Math.floor((size - totalHeight) / 2);

  function drawLetter(letter, offsetX, cols) {
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < cols; col++) {
        if (letter[row][col]) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px_x = startX + offsetX * scale + col * scale + sx;
              const px_y = startY + row * scale + sy;
              if (px_x >= 0 && px_x < size && px_y >= 0 && px_y < size) {
                const rowOffset = px_y * (1 + size * 3);
                const px = rowOffset + 1 + px_x * 3;
                rawData[px] = tr;
                rawData[px + 1] = tg;
                rawData[px + 2] = tb;
              }
            }
          }
        }
      }
    }
  }

  drawLetter(letterS, 0, 4);
  drawLetter(letterT, 5, 3);
}

// Generate icons
const outDir = path.join(__dirname, '..', 'public', 'icons');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const bgColor = 0x1a73e8; // Blue theme color

for (const size of sizes) {
  const png = generateIcon(size, bgColor);
  const filePath = path.join(outDir, `icon-${size}x${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated: icon-${size}x${size}.png`);
}

console.log('All icons generated!');