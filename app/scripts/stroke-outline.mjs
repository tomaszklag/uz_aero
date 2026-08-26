/**
 * UZ Aero — analityczny obrys kreski (stroke → wypełnienie) dla generatora fontu.
 *
 * Font przyjmuje wyłącznie wypełnione ścieżki, a znak marki mockupy rysują KRESKĄ
 * (stroke, okrągłe końce i złącza). Pierwsze podejście — trasowanie rastra
 * (oslllo-svg-fixer, raster + potrace) — dawało falujące krawędzie na długich
 * skosach: potrace aproksymuje piksele, nie geometrię (zgłoszenie z urządzenia,
 * 2026-08-26). Tu obrys liczy się DOKŁADNIE z geometrii:
 *
 *  1. krzywe C spłaszczamy adaptywnie (de Casteljau, tolerancja 0.002 jednostki
 *     viewBoxu — poniżej kwantyzacji współrzędnych TTF), proste zostają prostymi;
 *  2. polilinie odsuwamy Clipperem o pół kreski (złącza `jtRound`, końce otwartych
 *     linii `etOpenRound` — dokładnie stroke-linejoin/linecap="round" z mockupu);
 *  3. nakładające się elementy scala suma (plane-off: samolot i linia w jednym
 *     kolorze zlewają się także w mockupie).
 *
 * Obsługujemy dokładnie to, czego używają źródła: <path d> (M/L/H/V/C po
 * normalizacji svgpath) i <line>, kreska okrągła z korzenia <svg>. Inny kształt
 * kreski albo nowa komenda ścieżki = jawny błąd i świadoma rozbudowa, nie cichy
 * fallback — obrys w foncie ma nie mieć prawa rozjechać się z mockupem po cichu.
 */

import ClipperLib from 'clipper-lib';
import svgpath from 'svgpath';

/** Jednostki viewBoxu → współrzędne całkowite Clippera. */
const SCALE = 1e4;
/** Maks. odchyłka łuku złącza od idealnego okręgu (jednostki viewBoxu). */
const ARC_TOLERANCE = 0.002;
/** Maks. odchyłka spłaszczonej krzywej od oryginału (jednostki viewBoxu). */
const FLATTEN_TOLERANCE = 0.002;

/** Odległość punktu od prostej p0→p1 (przy zdegenerowanej cięciwie — od punktu). */
function distToLine(p, p0, p1) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(p.x - p0.x, p.y - p0.y);
  return Math.abs((p.x - p0.x) * dy - (p.y - p0.y) * dx) / len;
}

/** Spłaszczenie krzywej sześciennej: dokłada punkty do `out` (bez punktu p0). */
function flattenCubic(p0, p1, p2, p3, out, depth = 0) {
  const flat =
    distToLine(p1, p0, p3) <= FLATTEN_TOLERANCE && distToLine(p2, p0, p3) <= FLATTEN_TOLERANCE;
  if (flat || depth >= 16) {
    out.push(p3);
    return;
  }
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const p01 = mid(p0, p1);
  const p12 = mid(p1, p2);
  const p23 = mid(p2, p3);
  const p012 = mid(p01, p12);
  const p123 = mid(p12, p23);
  const c = mid(p012, p123);
  flattenCubic(p0, p01, p012, c, out, depth + 1);
  flattenCubic(c, p123, p23, p3, out, depth + 1);
}

/** Ścieżka SVG → polilinie {pts, closed} w jednostkach viewBoxu. */
function pathToPolylines(d) {
  const polylines = [];
  let current = null;
  svgpath(d)
    .abs()
    .unshort()
    .unarc()
    .iterate((seg, _i, x, y) => {
      const cmd = seg[0];
      if (cmd === 'M') {
        if (current != null && current.pts.length > 1) polylines.push(current);
        current = { pts: [{ x: seg[1], y: seg[2] }], closed: false };
        return;
      }
      if (current == null) throw new Error(`Segment ${cmd} bez otwartej podścieżki`);
      if (cmd === 'L') current.pts.push({ x: seg[1], y: seg[2] });
      else if (cmd === 'H') current.pts.push({ x: seg[1], y });
      else if (cmd === 'V') current.pts.push({ x, y: seg[1] });
      else if (cmd === 'C')
        flattenCubic(
          { x, y },
          { x: seg[1], y: seg[2] },
          { x: seg[3], y: seg[4] },
          { x: seg[5], y: seg[6] },
          current.pts,
        );
      else if (cmd === 'Z') {
        current.closed = true;
        polylines.push(current);
        current = null;
      } else throw new Error(`Nieobsługiwana komenda ścieżki: ${cmd}`);
    });
  if (current != null && current.pts.length > 1) polylines.push(current);
  return polylines;
}

/** Offset polilinii o pół kreski — wynik jako ścieżki Clippera (skalowane int). */
function offsetPolyline(poly, halfWidth) {
  const pts = poly.pts.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
  // Zamknięcie robi Clipper — powtórzony punkt startu dałby zdegenerowany segment.
  if (
    poly.closed &&
    pts.length > 1 &&
    pts[0].X === pts[pts.length - 1].X &&
    pts[0].Y === pts[pts.length - 1].Y
  ) {
    pts.pop();
  }
  const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE * SCALE);
  co.AddPath(
    pts,
    ClipperLib.JoinType.jtRound,
    poly.closed ? ClipperLib.EndType.etClosedLine : ClipperLib.EndType.etOpenRound,
  );
  const solution = new ClipperLib.Paths();
  co.Execute(solution, halfWidth * SCALE);
  return solution;
}

/** Suma wielokątów — scala nakładające się obrysy i porządkuje orientacje dziur. */
function unionPaths(paths) {
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const out = new ClipperLib.Paths();
  clipper.Execute(
    ClipperLib.ClipType.ctUnion,
    out,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  return out;
}

function toPathData(paths) {
  const fmt = (v) => {
    const s = (v / SCALE).toFixed(3);
    return s.replace(/\.?0+$/, '');
  };
  return paths
    .map((p) => 'M ' + p.map((pt) => `${fmt(pt.X)} ${fmt(pt.Y)}`).join(' L ') + ' Z')
    .join(' ');
}

/**
 * Zamienia SVG rysowany kreską na SVG z wypełnionym obrysem tej kreski.
 * Źródło bez kreski (już wypełnione, jak ikony faz) przechodzi dalej jako `null`.
 */
export function expandStrokes(svgText) {
  const root = svgText.match(/<svg\b[^>]*>/)?.[0] ?? '';
  const strokeWidth = root.match(/stroke-width="([0-9.]+)"/)?.[1];
  if (strokeWidth == null) return null;
  if (!/stroke-linecap="round"/.test(root) || !/stroke-linejoin="round"/.test(root)) {
    throw new Error('Obrys liczy tylko kreskę okrągłą (linecap/linejoin="round" na <svg>)');
  }
  const viewBox = root.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24';
  const half = Number(strokeWidth) / 2;

  const polylines = [];
  for (const m of svgText.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?>/g)) {
    polylines.push(...pathToPolylines(m[1]));
  }
  for (const m of svgText.matchAll(/<line\b[^>]*\/?>/g)) {
    const attr = (name) => {
      const v = m[0].match(new RegExp(`\\b${name}="(-?[0-9.]+)"`))?.[1];
      if (v == null) throw new Error(`<line> bez atrybutu ${name}`);
      return Number(v);
    };
    polylines.push({
      pts: [
        { x: attr('x1'), y: attr('y1') },
        { x: attr('x2'), y: attr('y2') },
      ],
      closed: false,
    });
  }
  if (polylines.length === 0) throw new Error('Źródło z kreską, ale bez <path>/<line>');

  const merged = unionPaths(polylines.flatMap((p) => offsetPolyline(p, half)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n<path d="${toPathData(merged)}"/>\n</svg>\n`;
}
