// Generates the PNG app icons (Home Screen / PWA) without image dependencies:
// a minimal PNG encoder plus a supersampled rasterizer for a few shapes.
import zlib from "node:zlib";

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePNG(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function roundedRect(x, y, rx, ry, w, h, r) {
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= rx && x <= rx + w && y >= ry && y <= ry + h;
}

/**
 * Icon art in a 0..1 unit square: a V-taper torso (broad shoulders, narrow
 * waist) above a barbell bar, on a cobalt gradient.
 */
function renderIcon(size, { padding = 0 } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  const scale = 1 - padding * 2;
  const map = (value) => (value - padding) / scale;
  // Head, then a torso with trap slope, deltoid caps, armpits and a narrow waist.
  const torso = [
    [0.445, 0.25], [0.555, 0.25], [0.72, 0.29], [0.8, 0.31], [0.845, 0.36], [0.85, 0.42], [0.815, 0.455],
    [0.745, 0.44], [0.69, 0.53], [0.615, 0.67], [0.385, 0.67], [0.31, 0.53], [0.255, 0.44],
    [0.185, 0.455], [0.15, 0.42], [0.155, 0.36], [0.2, 0.31], [0.28, 0.29],
  ];
  const neck = [[0.455, 0.2], [0.545, 0.2], [0.555, 0.26], [0.445, 0.26]];
  const head = (u, v) => (u - 0.5) ** 2 + (v - 0.145) ** 2 <= 0.072 ** 2;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let white = 0;
      let gold = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = map((px + (sx + 0.5) / samples) / size);
          const v = map((py + (sy + 0.5) / samples) / size);
          if (insidePolygon(u, v, torso) || insidePolygon(u, v, neck) || head(u, v)) white += 1;
          else if (roundedRect(u, v, 0.16, 0.75, 0.68, 0.055, 0.0275) || roundedRect(u, v, 0.12, 0.71, 0.07, 0.135, 0.02) || roundedRect(u, v, 0.81, 0.71, 0.07, 0.135, 0.02)) gold += 1;
        }
      }
      const total = samples * samples;
      const fx = px / size;
      const fy = py / size;
      // Diagonal cobalt gradient with a soft highlight in the top-right.
      const t = Math.min(1, Math.max(0, (fx + fy) / 2));
      const glow = Math.max(0, 1 - Math.hypot(fx - 0.85, fy - 0.1) / 0.9);
      let r = 0x5e + (0x22 - 0x5e) * t + 30 * glow;
      let g = 0x7b + (0x2e - 0x7b) * t + 30 * glow;
      let b = 0xff + (0x8c - 0xff) * t + 10 * glow;
      const wa = white / total;
      const ga = gold / total;
      r = r * (1 - wa - ga) + 255 * wa + 0xe8 * ga;
      g = g * (1 - wa - ga) + 255 * wa + 0xb4 * ga;
      b = b * (1 - wa - ga) + 255 * wa + 0x4c * ga;
      const offset = (py * size + px) * 4;
      pixels[offset] = Math.max(0, Math.min(255, Math.round(r)));
      pixels[offset + 1] = Math.max(0, Math.min(255, Math.round(g)));
      pixels[offset + 2] = Math.max(0, Math.min(255, Math.round(b)));
      pixels[offset + 3] = 255;
    }
  }
  return encodePNG(size, size, pixels);
}

export function generateIcons() {
  return {
    "icons/apple-touch-icon.png": renderIcon(180, { padding: 0.06 }),
    "icons/icon-192.png": renderIcon(192, { padding: 0.06 }),
    "icons/icon-512.png": renderIcon(512, { padding: 0.06 }),
    "icons/icon-maskable-512.png": renderIcon(512, { padding: 0.16 }),
  };
}
