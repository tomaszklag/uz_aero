/**
 * UZ Aero — test GRANIC WARSTW.
 *
 * Reguła architektury jest warta tyle, ile jej egzekucja. Projekt nie ma jeszcze ESLinta
 * (patrz `docs/architektura-kodu.md` — gotowa konfiguracja `no-restricted-imports` czeka
 * na jego wprowadzenie), więc kierunek zależności pilnuje test: skanuje pliki źródłowe
 * i sprawdza, czego importują.
 *
 * Kierunek jest jednokierunkowy, do środka:
 *
 *   ui  →  application  →  domain
 *   infrastructure  →  application/ports  →  domain
 *
 * Test celowo czyta pliki z dysku zamiast polegać na module graph — dzięki temu wyłapuje
 * też importy typów (`import type`), które w runtime znikają, a i tak wiążą warstwy.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(__dirname, '..');

/** Wszystkie pliki .ts/.tsx w katalogu (rekurencyjnie), ścieżki względem `src`. */
function sourceFiles(dir: string): string[] {
  const abs = join(SRC, dir);
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry)) {
        out.push(relative(SRC, full).split(sep).join('/'));
      }
    }
  };
  walk(abs);
  return out;
}

/** Źródła importów z pliku: `import … from 'x'`, `export … from 'x'`, `require('x')`. */
function importsOf(file: string): string[] {
  const code = readFileSync(join(SRC, file), 'utf8');
  const found: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) found.push(m[1]!);
  }
  return found;
}

/** Pakiety spoza domeny: framework UI, natywne moduły, store. */
const FRAMEWORK = [
  /^react$/,
  /^react\//,
  /^react-native$/,
  /^react-native[-/]/,
  /^@react-native/,
  /^expo$/,
  /^expo-/,
  /^@expo/,
  /^zustand/,
];

const isFramework = (spec: string): boolean => FRAMEWORK.some((re) => re.test(spec));

/** Import do innej warstwy: `../application`, `../../infrastructure/...` itp. */
function crossesTo(spec: string, layer: string): boolean {
  return new RegExp(`(^|/)\\.\\.?/(\\.\\./)*${layer}(/|$)`).test(spec);
}

describe('granice warstw', () => {
  // Bez tego zielony wynik pozostałych testów nic nie znaczy: pusta lista plików albo
  // zepsuty regex dałyby „brak naruszeń" przy dowolnie połamanej architekturze.
  it('skaner faktycznie widzi pliki i importy (kontrola samego testu)', () => {
    expect(sourceFiles('domain').length).toBeGreaterThan(5);
    expect(sourceFiles('application').length).toBeGreaterThan(5);

    const storeImports = importsOf('ui/store/sessionStore.ts');
    expect(storeImports).toContain('zustand');
    expect(storeImports).toContain('../../domain');
    expect(isFramework('zustand')).toBe(true);
    expect(crossesTo('../../infrastructure/clock', 'infrastructure')).toBe(true);
    expect(crossesTo('../ui/theme', 'ui')).toBe(true);
    expect(crossesTo('./violations', 'ui')).toBe(false);
  });

  it('domain nie importuje Reacta, React Native, Expo, SQLite ani Zustanda', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('domain')) {
      for (const spec of importsOf(file)) {
        if (isFramework(spec)) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('domain nie importuje application, infrastructure ani ui', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('domain')) {
      for (const spec of importsOf(file)) {
        for (const layer of ['application', 'infrastructure', 'ui']) {
          if (crossesTo(spec, layer)) offenders.push(`${file} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('application nie importuje frameworka ani infrastructure/ui (zależności wstrzykiwane)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('application')) {
      for (const spec of importsOf(file)) {
        if (isFramework(spec)) offenders.push(`${file} → ${spec}`);
        for (const layer of ['infrastructure', 'ui']) {
          if (crossesTo(spec, layer)) offenders.push(`${file} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('infrastructure nie importuje ui', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('infrastructure')) {
      for (const spec of importsOf(file)) {
        if (crossesTo(spec, 'ui')) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tylko adapter SQLite dotyka expo-sqlite', () => {
    const users = sourceFiles('.')
      .filter((f) => importsOf(f).some((s) => s === 'expo-sqlite'))
      .sort();
    expect(users).toEqual(['infrastructure/storage/expoSqliteAdapter.ts']);
  });

  it('tylko adapter GPS dotyka expo-location', () => {
    const users = sourceFiles('.')
      .filter((f) => importsOf(f).some((s) => s === 'expo-location'))
      .sort();
    expect(users).toEqual(['infrastructure/gps/expoLocationAdapter.ts']);
  });

  it('barrel infrastruktury nie wciąga modułów natywnych (testy w Node)', () => {
    const barrel = importsOf('infrastructure/index.ts');
    expect(barrel).not.toContain('./storage/expoSqliteAdapter');
    expect(barrel).not.toContain('./gps/expoLocationAdapter');
  });
});
