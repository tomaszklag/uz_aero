/**
 * UZ Aero (serwer) — GRANICE, KTÓRYCH NIE PILNUJE KOMPILATOR.
 *
 * Lustro `app/src/__tests__/architecture.test.ts` i ta sama zasada: reguła architektury
 * jest warta tyle, ile jej egzekucja. Trzy własności niżej są w kodzie niewidoczne —
 * nic nie broni następnej osobie dopisać `UPDATE admin_audit`, wstrzyknąć `Database`
 * do komendy panelu albo zarejestrować trasę panelu z pominięciem bramy uprawnień.
 * Dokument może się zdezaktualizować; ten plik nie.
 *
 * Zakres jest dziś węższy niż lista z `docs/architektura-panelu-serwer.md` §9 —
 * pozostałe pozycje (`contracts/`, literał `'administrative'`) dotyczą przekrojów,
 * których jeszcze nie ma, a test skanujący nieistniejący katalog przechodziłby
 * dlatego, że niczego nie znalazł.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Wszystkie pliki .ts w katalogu (rekurencyjnie), ścieżki względem `src/`. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) out.push(relative(SRC, full).split(sep).join('/'));
    }
  };
  walk(join(SRC, dir));
  return out;
}

const read = (file: string): string => readFileSync(join(SRC, file), 'utf8');

/**
 * Treść pliku BEZ komentarzy. Skaner szuka SQL-a, a nie prozy o SQL-u: docblock
 * migracji tłumaczy, dlaczego `UPDATE admin_audit` jest zakazane, i bez tego kroku
 * sam wywoływałby naruszenie, którego opisuje zakaz.
 */
const codeOf = (file: string): string =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Nazwy importowane w pliku — `import { A, type B as C } from '…'`. */
function importedNames(code: string): string[] {
  const out: string[] = [];
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    for (const part of match[1]!.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim();
      if (name) out.push(name);
    }
  }
  return out;
}

/** Zapis do tabeli, która ma być append-only. */
const writesTo = (table: string): RegExp =>
  new RegExp(String.raw`\bUPDATE\s+${table}\b|\bDELETE\s+FROM\s+${table}\b`, 'i');

describe('granice, których nie pilnuje kompilator', () => {
  // Bez tego zielony wynik pozostałych przypadków nic nie znaczy: pusta lista plików
  // albo zepsuty regex dałyby „brak naruszeń" przy dowolnie połamanej architekturze.
  it('skaner faktycznie widzi pliki i treści (kontrola samego testu)', () => {
    expect(filesUnder('.').length).toBeGreaterThan(20);
    expect(filesUnder('application/admin/commands')).toContain(
      'application/admin/commands/flags.ts',
    );

    // Adapter flag panelu ROBI `UPDATE flags` — jeśli skaner tego nie widzi, nie
    // zobaczy też `UPDATE admin_audit`.
    expect(writesTo('flags').test(codeOf('infrastructure/pg/admin/flagsRepo.ts'))).toBe(true);
    expect(writesTo('admin_audit').test('DELETE FROM admin_audit WHERE id = 1')).toBe(true);

    // Zdejmowanie komentarzy nie zjada kodu i zjada prozę — obie strony naraz.
    expect(codeOf('infrastructure/pg/schema.ts')).toContain('CREATE TABLE IF NOT EXISTS admin_audit');
    expect(codeOf('infrastructure/pg/schema.ts')).not.toContain('UPDATE admin_audit');

    // Wyciąganie nazw z importów działa na pliku, który `Database` faktycznie bierze.
    expect(importedNames(read('application/commands/ingest.ts'))).toContain('Database');
  });

  it('rejestr `events` jest append-only — nigdzie w src/ nie ma UPDATE ani DELETE', () => {
    const offenders = filesUnder('.').filter((f) => writesTo('events').test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('dziennik `admin_audit` jest append-only — nigdzie w src/ nie ma UPDATE ani DELETE', () => {
    // Docelowo pilnuje tego GRANT bez UPDATE/DELETE dla roli aplikacyjnej; do czasu
    // rozdzielenia connection stringów to jest jedyna wykonywalna gwarancja.
    const offenders = filesUnder('.').filter((f) => writesTo('admin_audit').test(codeOf(f)));
    expect(offenders).toEqual([]);
  });

  it('komendy panelu nie mają uchwytu do bazy — zapis wyłącznie przez AuditedWrite', () => {
    // Druga połowa mechanizmu audytu: `Audited<T>` wymusza ślad w typie, a BRAK
    // `Database`/`Queryable` odbiera możliwość ominięcia tej bramy w ogóle.
    const offenders: string[] = [];
    for (const file of filesUnder('application/admin/commands')) {
      for (const name of importedNames(read(file))) {
        if (name === 'Database' || name === 'Queryable') offenders.push(`${file} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('trasy panelu rejestrują się wyłącznie przez `adminRoute`', () => {
    // Zdolność ma być ATRYBUTEM deklaracji trasy. `app.post(...)` w pliku tras panelu
    // to trasa bez bramy uprawnień — i nikt by tego nie zauważył przy przeglądzie.
    const offenders = filesUnder('http/routes/admin')
      .filter((f) => f !== 'http/routes/admin/adminRoute.ts')
      .filter((f) => /\bapp\.(get|post|put|patch|delete|route)\s*\(/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
