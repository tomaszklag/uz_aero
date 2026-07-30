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

/**
 * Domena mieszka od Fazy 2 w `packages/domain` (współdzielona z serwerem) — skanujemy
 * ją tam. W `app/src/domain` został wyłącznie shim zgodności (`export * from '@uzaero/domain'`).
 */
const DOMAIN_SRC = join(__dirname, '..', '..', '..', 'packages', 'domain', 'src');

/** Wszystkie pliki .ts/.tsx w katalogu (rekurencyjnie), ścieżki względem bazy. */
function filesUnder(base: string, dir: string): string[] {
  const abs = join(base, dir);
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry)) {
        out.push(relative(base, full).split(sep).join('/'));
      }
    }
  };
  walk(abs);
  return out;
}

const sourceFiles = (dir: string): string[] => filesUnder(SRC, dir);
const domainFiles = (): string[] => filesUnder(DOMAIN_SRC, '.');

const importsOf = (file: string): string[] => importsFrom(SRC, file);
const domainImportsOf = (file: string): string[] => importsFrom(DOMAIN_SRC, file);

/** Źródła importów z pliku: `import … from 'x'`, `export … from 'x'`, `require('x')`. */
function importsFrom(base: string, file: string): string[] {
  const code = readFileSync(join(base, file), 'utf8');
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
    expect(domainFiles().length).toBeGreaterThan(5);
    expect(sourceFiles('application').length).toBeGreaterThan(5);

    const storeImports = importsOf('ui/store/sessionStore.ts');
    expect(storeImports).toContain('zustand');
    expect(storeImports).toContain('../../domain');
    expect(isFramework('zustand')).toBe(true);
    expect(crossesTo('../../infrastructure/clock', 'infrastructure')).toBe(true);
    expect(crossesTo('../ui/theme', 'ui')).toBe(true);
    expect(crossesTo('./violations', 'ui')).toBe(false);

    // Shim w `app/src/domain` ma być JEDYNYM plikiem i tylko re-eksportem pakietu.
    expect(sourceFiles('domain')).toEqual(['domain/index.ts']);
    expect(importsOf('domain/index.ts')).toEqual(['@uzaero/domain']);
  });

  it('domain (packages/domain) nie importuje Reacta, RN, Expo, SQLite ani Zustanda', () => {
    const offenders: string[] = [];
    for (const file of domainFiles()) {
      for (const spec of domainImportsOf(file)) {
        if (isFramework(spec)) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('domain nie importuje ŻADNEGO pakietu — czysty TS, zero zależności', () => {
    // Mocniejsze niż w aplikacji: domena jest współdzielona z serwerem, więc każdy
    // import pakietu (choćby dev-owego) wiązałby OBIE strony z jego obecnością.
    const offenders: string[] = [];
    for (const file of domainFiles()) {
      for (const spec of domainImportsOf(file)) {
        if (!spec.startsWith('.')) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('domain nie sięga do app/ ani server/ ścieżkami względnymi', () => {
    const offenders: string[] = [];
    for (const file of domainFiles()) {
      for (const spec of domainImportsOf(file)) {
        if (/(^|\/)\.\.\/(\.\.\/)*(app|server)(\/|$)/.test(spec) || spec.includes('../../..')) {
          offenders.push(`${file} → ${spec}`);
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

  it('tylko adapter czujników dotyka expo-sensors', () => {
    const users = sourceFiles('.')
      .filter((f) => importsOf(f).some((s) => s === 'expo-sensors'))
      .sort();
    expect(users).toEqual(['infrastructure/sensors/expoSensorsAdapter.ts']);
  });

  it('barrel infrastruktury nie wciąga modułów natywnych (testy w Node)', () => {
    const barrel = importsOf('infrastructure/index.ts');
    expect(barrel).not.toContain('./storage/expoSqliteAdapter');
    expect(barrel).not.toContain('./gps/expoLocationAdapter');
    expect(barrel).not.toContain('./sensors/expoSensorsAdapter');
  });
});
