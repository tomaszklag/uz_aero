/**
 * UZ Aero - panel 2.0: TEKST NA EKRANIE NIE JEST DOKUMENTACJĄ SYSTEMU.
 *
 * Ten test istnieje z powodu jednego zdania właściciela produktu o panelu 1.0:
 * „nie może być tyle bannerów i tłumaczeń jak teraz - to przypomina projekt techniczny,
 * a nie aplikację dla użytkownika". Diagnoza była policzalna: cztery ekrany kont i floty
 * niosły ~11 200 znaków prozy wyjaśniającej, dziewięć stałych banerów i kilkanaście
 * wstawek z nazwami tras, tabel i kodów reguł.
 *
 * Reguła jest więc wykonywalna, a nie zapisana w dokumencie, którego nikt nie czyta
 * przy dopisywaniu zdania do formularza. Pilnuje DWOCH rzeczy:
 *  1. w napisach widocznych dla człowieka nie ma żargonu systemu (nazw tras, tabel,
 *     kodów reguł, słownictwa implementacji);
 *  2. napisy są KROTKIE - wykład wraca do interfejsu długim zdaniem, nie krótkim.
 *
 * Czego ten test NIE robi: nie ocenia, czy zdanie jest potrzebne. To zostaje pracą
 * człowieka - test broni granicy, nie pisze tekstu.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) {
        out.push(relative(SRC, full).split(sep).join('/'));
      }
    }
  };
  walk(join(SRC, dir));
  return out;
}

/** Treść BEZ komentarzy - proza o kodzie ma prawo używać żargonu, ekran nie ma. */
const codeOf = (file: string): string =>
  readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Napisy WIDOCZNE dla człowieka - literały zawierające polskie zdanie.
 *
 * Rozpoznajemy je po spacji między słowami i po literach: `'/piloci/nowy'`, `'cell-sub'`
 * czy `'accounts.manage'` to identyfikatory, a nie treść. To przybliżenie i takie ma
 * być - test ma łapać ZDANIA, bo to w nich wraca wykład.
 */
function sentencesIn(code: string): string[] {
  return [...code.matchAll(/'([^'\\\n]{12,})'|"([^"\\\n]{12,})"/g)]
    .map((match) => match[1] ?? match[2] ?? '')
    .filter((text) => /\s/.test(text) && /[a-ząćęłńóśźż]{3}/i.test(text));
}

/**
 * Żargon, który w panelu 1.0 stał na ekranie dosłownie.
 *
 * Lista jest KONKRETNA, nie ogólna: każda pozycja to napis, który tam faktycznie był
 * (raport audytu UI, sekcja „żargon bazy i API w interfejsie"). Reguła ogólna
 * („bez terminów technicznych") nie da się wykonać, a ta lista - owszem.
 */
const JARGON = [
  // Skróty i nazwy własne - WIELKOSC LITER MA ZNACZENIE. Bez tego „API" trafiało
  // w środek słowa „Zapisane", czyli test pilnowałby polszczyzny zamiast żargonu.
  /\bFUEL_MISMATCH\b/,
  /\bHTTP\b/,
  /\bAPI\b/,
  /\bUUID\b/,
  /\bJSON\b/,
  /\bETag\b/,
  /\b(POST|GET|PATCH|DELETE) \//,
  // Słownictwo implementacji - wielkość liter bez znaczenia, ale granica słowa tak.
  /\bappend-only\b/i,
  /\brefresh_token/i,
  /\bpassword_hash/i,
  /\bscrypt\b/i,
  /\bendpoint/i,
  /\bpayload/i,
  /\bprojekcj/i,
  /\brejestr zdarzeń/i,
  /\bbaz(a|ie|y) danych/i,
  /\bcache\b/i,
  /\bclaim/i,
  /\bpreflight/i,
];

/**
 * Maksymalna długość napisu na ekranie.
 *
 * 160 znaków to około dwóch linii - tyle mieści zdanie, które MOWI, CO ZROBIC.
 * Dłuższy napis w panelu 1.0 był bez wyjątku wykładem o budowie systemu; najdłuższy
 * miał 700 znaków i zaczynał się od „Sprostowanie z 2026-08-01".
 */
const MAX_LENGTH = 160;

describe('język interfejsu', () => {
  const files = filesUnder('.');

  it('kontrola testu: skaner faktycznie widzi napisy ekranów', () => {
    // Bez tego oba przypadki niżej przechodziłyby na pustej liście.
    const all = files.flatMap((file) => sentencesIn(codeOf(file)));
    expect(all.length).toBeGreaterThan(30);
    expect(all).toContain('Nieprawidłowy login lub hasło.');

    // Skaner odsiewa identyfikatory: klasy CSS i ścieżki nie są zdaniami.
    expect(sentencesIn("x('cell-sub')")).toEqual([]);
    expect(sentencesIn("x('/piloci/nowy')")).toEqual([]);
    // …i faktycznie łapie zdanie, gdyby ktoś je dopisał.
    expect(sentencesIn("x('Zapisano dane w bazie danych.')")).toEqual([
      'Zapisano dane w bazie danych.',
    ]);
  });

  it('napisy nie niosą żargonu systemu', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const text of sentencesIn(codeOf(file))) {
        for (const term of JARGON) {
          if (term.test(text)) offenders.push(`${file} → „${text}" (${String(term)})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('napisy mieszczą się w dwóch linijkach', () => {
    const offenders = files.flatMap((file) =>
      sentencesIn(codeOf(file))
        .filter((text) => text.length > MAX_LENGTH)
        .map((text) => `${file} → ${text.length} znaków: „${text.slice(0, 60)}…"`),
    );
    expect(offenders).toEqual([]);
  });
});
