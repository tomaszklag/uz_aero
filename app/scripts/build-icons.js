/**
 * UZ Aero - GENERATOR IKON APLIKACJI ze znaku panelu (uwaga z urządzenia, 2026-09-04:
 * „chciałbym mieć ten [znak], co jest na stronie do logowania do panelu admina").
 *
 * Znakiem marki jest `PlaneIcon` z `admin/src/ui/components/icons.tsx` - ten sam samolot,
 * który stoi w plakietce ekranu logowania panelu. Ikony są PLIKAMI GENEROWANYMI: poprawki
 * wchodzą przez ten skrypt i regenerację (`npm run icons` w `app/`), nie ręczną edycją PNG -
 * ta sama reguła, co przy katalogu lotnisk (`packages/domain/scripts/`).
 *
 * Bez zależności i bez modułu natywnego (projekt ich unika): rasteryzacja wielokąta
 * z antyaliasingiem (poziomo analitycznie, pionowo 8 podwierszy) i koder PNG na `zlib`
 * ze standardowej biblioteki. Ścieżkę SVG rozwija `planePath()` - łuk nosa jest jedynym
 * odcinkiem krzywym i idzie 64 segmentami.
 *
 * Wynik (`app/assets/`): `icon.png` 1024 (iOS i uniwersalna), para adaptive dla Androida
 * (`foreground` w bezpiecznej strefie 40% boku, `background` = sam gradient),
 * `monochrome` 432 białą sylwetką (system barwi ją sam) i `favicon.png` 48.
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// ── znak: `admin/src/ui/components/icons.tsx` → PlaneIcon, viewBox 24×24 ────────
// M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z
function planePath() {
  const pts = [
    [21, 16],
    [21, 14],
    [13, 9],
    [13, 3.5],
  ];
  // Nos: półokrąg r=1.5 ze środkiem (11.5, 3.5), od (13,3.5) górą do (10,3.5).
  const STEPS = 64;
  for (let i = 1; i < STEPS; i += 1) {
    const a = (Math.PI * i) / STEPS;
    pts.push([11.5 + 1.5 * Math.cos(a), 3.5 - 1.5 * Math.sin(a)]);
  }
  pts.push([10, 3.5], [10, 9], [2, 14], [2, 16], [10, 13.5], [10, 19], [8, 20.5], [8, 22]);
  pts.push([11.5, 21], [15, 22], [15, 20.5], [13, 19], [13, 13.5]);
  return pts;
}

/** Pokrycie [0..1] wielokąta na siatce W×H. Poziomo analitycznie, pionowo 8 podwierszy. */
function coverage(points, W, H) {
  const SS = 8;
  const cov = new Float32Array(W * H);
  const edges = [];
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    if (y0 !== y1) edges.push([x0, y0, x1, y1]);
  }

  const addSpan = (row, xa, xb, weight) => {
    if (xb <= xa) return;
    const from = Math.max(0, Math.floor(xa));
    const to = Math.min(W - 1, Math.ceil(xb) - 1);
    for (let x = from; x <= to; x += 1) {
      const part = Math.min(xb, x + 1) - Math.max(xa, x);
      if (part > 0) cov[row * W + x] += part * weight;
    }
  };

  const xs = [];
  for (let sy = 0; sy < H * SS; sy += 1) {
    const y = (sy + 0.5) / SS;
    xs.length = 0;
    for (const [x0, y0, x1, y1] of edges) {
      if ((y >= y0 && y < y1) || (y >= y1 && y < y0)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const row = Math.floor(sy / SS);
    for (let i = 0; i + 1 < xs.length; i += 2) addSpan(row, xs[i], xs[i + 1], 1 / SS);
  }
  return cov;
}

const hex = (c) => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

function png(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filtr „none"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (TABLE == null) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/**
 * @param size bok płótna
 * @param markRatio wysokość znaku jako ułamek boku
 * @param background `null` = przezroczyste; inaczej gradient radialny [środek, brzeg]
 * @param markColor kolor znaku
 * @param glow siła zielonej poświaty pod znakiem (0 = brak)
 */
function render({ size, markRatio, background, markColor, glow = 0 }) {
  const rgba = Buffer.alloc(size * size * 4);

  if (background != null) {
    const [c0, c1] = background.map(hex);
    const half = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        // Gładkie przejście od środka do rogów - jak poświata `.login-badge`.
        const t = Math.min(1, Math.hypot(dx, dy) / 1.15) ** 1.35;
        const i = (y * size + x) * 4;
        for (let k = 0; k < 3; k += 1) rgba[i + k] = Math.round(c0[k] + (c1[k] - c0[k]) * t);
        rgba[i + 3] = 255;
      }
    }
  }

  // ── znak: skala i wyśrodkowanie w płótnie ────────────────────────────────────
  const pts = planePath();
  const xsAll = pts.map((p) => p[0]);
  const ysAll = pts.map((p) => p[1]);
  const minX = Math.min(...xsAll);
  const maxX = Math.max(...xsAll);
  const minY = Math.min(...ysAll);
  const maxY = Math.max(...ysAll);
  const scale = (size * markRatio) / (maxY - minY);
  const offX = (size - (maxX - minX) * scale) / 2 - minX * scale;
  const offY = (size - (maxY - minY) * scale) / 2 - minY * scale;
  const placed = pts.map(([x, y]) => [x * scale + offX, y * scale + offY]);

  if (glow > 0) {
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * markRatio * 0.95;
    const [gr, gg, gb] = hex('#2ECC71');
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
        if (d >= 1) continue;
        const a = glow * (1 - d) ** 2;
        const i = (y * size + x) * 4;
        for (const [k, c] of [[0, gr], [1, gg], [2, gb]]) {
          rgba[i + k] = Math.round(rgba[i + k] + (c - rgba[i + k]) * a);
        }
        if (background == null) rgba[i + 3] = Math.max(rgba[i + 3], Math.round(255 * a));
      }
    }
  }

  const cov = coverage(placed, size, size);
  const [mr, mg, mb] = hex(markColor);
  for (let p = 0; p < size * size; p += 1) {
    const a = Math.min(1, cov[p]);
    if (a <= 0) continue;
    const i = p * 4;
    const dst = rgba[i + 3] / 255;
    const out = a + dst * (1 - a);
    for (const [k, c] of [[0, mr], [1, mg], [2, mb]]) {
      rgba[i + k] = Math.round((c * a + rgba[i + k] * dst * (1 - a)) / out);
    }
    rgba[i + 3] = Math.round(out * 255);
  }

  return png(size, size, rgba);
}

/* Ścieżka z `__dirname`, nie z katalogu wywołania: `npm run icons` startuje w `app/`,
   a wprost z repozytorium woła się go ścieżką - obie drogi mają trafić w te same pliki. */
const OUT = path.join(__dirname, '..', 'assets') + path.sep;
const BG = ['#123A22', '#080C08'];

fs.writeFileSync(
  OUT + 'icon.png',
  render({ size: 1024, markRatio: 0.5, background: BG, markColor: '#2ECC71', glow: 0.12 }),
);
fs.writeFileSync(
  OUT + 'android-icon-foreground.png',
  render({ size: 512, markRatio: 0.4, background: null, markColor: '#2ECC71' }),
);
fs.writeFileSync(
  OUT + 'android-icon-background.png',
  render({ size: 512, markRatio: 0, background: BG, markColor: '#2ECC71' }),
);
fs.writeFileSync(
  OUT + 'android-icon-monochrome.png',
  render({ size: 432, markRatio: 0.4, background: null, markColor: '#FFFFFF' }),
);
fs.writeFileSync(
  OUT + 'favicon.png',
  render({ size: 48, markRatio: 0.62, background: BG, markColor: '#2ECC71' }),
);
console.log('ikony zapisane');
