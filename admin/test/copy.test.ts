/**
 * Ninerdeck - panel 2.0: TEKST NA EKRANIE NIE JEST DOKUMENTACJĄ SYSTEMU.
 *
 * Ten test istnieje z powodu jednego zdania właściciela produktu o panelu 1.0:
 * „nie może być tyle bannerów i tłumaczeń jak teraz - to przypomina projekt techniczny,
 * a nie aplikację dla użytkownika". Diagnoza była policzalna: cztery ekrany kont i floty
 * niosły ~11 200 znaków prozy wyjaśniającej, dziewięć stałych banerów i kilkanaście
 * wstawek z nazwami tras, tabel i kodów reguł.
 *
 * Reguła jest więc wykonywalna, a nie zapisana w dokumencie, którego nikt nie czyta
 * przy dopisywaniu zdania do formularza. Pilnuje TRZECH rzeczy:
 *  1. w napisach widocznych dla człowieka nie ma żargonu systemu (nazw tras, tabel,
 *     kodów reguł, słownictwa implementacji);
 *  2. napisy są KRÓTKIE - wykład wraca do interfejsu długim zdaniem, nie krótkim;
 *  3. postęp na przycisku mówi stanem czynności („Zapisywanie…"), nie głosem
 *     aplikacji („Zapisuję…").
 *
 * Od przeglądu treści 4.0.0 (2026-10-08) skaner czyta DRZEWO SKŁADNI pliku. Do tego
 * dnia szukał wyrażeniem regularnym wyłącznie literałów w apostrofach i cudzysłowach,
 * więc tekst między znacznikami JSX i szablony z wstawkami przechodziły bez kontroli -
 * a to właśnie w nich stały „Zmień chip stanu", „Karta doby" i „(kod 500)".
 *
 * Czego ten test NIE robi: nie ocenia, czy zdanie jest potrzebne. To zostaje pracą
 * człowieka - test broni granicy, nie pisze tekstu.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(relative(SRC, full).split(sep).join('/'));
      }
    }
  };
  walk(join(SRC, dir));
  return out;
}

const LETTERS = /[a-ząćęłńóśźż]{3}/i;

/**
 * Etykieta z wielkiej litery - „Slot", „Karta doby", „Zapisuję…". Krótka, ale widoczna:
 * identyfikatory w tym kodzie piszą się małą literą (`'slot_taken'`, `'flags'`), więc
 * wielka litera na początku odróżnia napis od klucza lepiej niż długość.
 */
const LABEL = /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+[.…:!?]?(\s\S+)*$/;

/** Literał jest napisem dla człowieka: zdaniem albo etykietą, nie identyfikatorem. */
function isWords(text: string): boolean {
  return LETTERS.test(text) && ((/\s/.test(text) && text.length >= 12) || LABEL.test(text));
}

/** Wartość `className` to lista klas CSS, nie napis - nawet złożona szablonem ze słów. */
function inClassName(node: ts.Node): boolean {
  for (let parent = node.parent; parent != null; parent = parent.parent) {
    if (ts.isJsxAttribute(parent)) return parent.name.getText() === 'className';
    if (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxFragment(parent)) return false;
  }
  return false;
}

/**
 * Komunikat WYJĄTKU czyta programista w konsoli, nie człowiek przed ekranem: ekrany
 * tłumaczą odmowy własnymi zdaniami (`apiMessage.ts`) i treści błędu nie pokazują.
 * „HTTP 500: unknown" w `super(...)` klasy błędu jest więc na miejscu.
 */
function inErrorMessage(node: ts.Node): boolean {
  const parent = node.parent;
  if (parent == null) return false;
  if (ts.isNewExpression(parent)) return /Error$/.test(parent.expression.getText());
  return ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.SuperKeyword;
}

/**
 * Napisy WIDOCZNE dla człowieka, z drzewa składni:
 *  - literały i szablony, które wyglądają na zdanie albo etykietę; szablon czytamy jego
 *    częściami stałymi, a każdą wstawkę zastępuje „{…}" - „(kod {…})" zostaje
 *    rozpoznawalne, a wstawka na końcu zdania nie udaje wielokropka;
 *  - tekst między znacznikami JSX - ZAWSZE, bo identyfikatorem być nie może.
 *
 * Komentarze nie są węzłami drzewa, więc proza o kodzie wypada sama - a ma prawo
 * używać żargonu, którego ekranowi nie wolno. Typy literałowe (`'pic' | 'dual'`)
 * i ścieżki importów to nazwy, nie treść.
 */
function sentencesIn(source: string, fileName = 'fragment.tsx'): string[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isLiteralTypeNode(node)) return;
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (LETTERS.test(text)) out.push(text);
    } else if (!inClassName(node) && !inErrorMessage(node)) {
      let text: string | null = null;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
      else if (ts.isTemplateExpression(node)) {
        text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('{…}');
      }
      if (text != null && isWords(text.trim())) out.push(text.trim());
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

const textsOf = (file: string): string[] => sentencesIn(readFileSync(join(SRC, file), 'utf8'), file);

/**
 * Żargon, który w panelu stał na ekranie dosłownie.
 *
 * Lista jest KONKRETNA, nie ogólna: każda pozycja to napis, który tam faktycznie był
 * (raport audytu UI panelu 1.0 i przegląd treści 4.0.0). Reguła ogólna („bez terminów
 * technicznych") nie da się wykonać, a ta lista - owszem.
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
  /\bPIC\b/,
  /\bDual\b/,
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
  // Przegląd treści 4.0.0 (2026-10-08): słowa budowy aplikacji, które zastąpił słownik
  // właściciela - rozjazd zamiast flagi, filtr zamiast chipa, termin zamiast slotu
  // i zajętości, „Brak połączenia" zamiast serwera, flota zamiast rejestru, uprawnienie
  // zamiast zdolności, „termin się zwolni" zamiast puli, „wysłane ponownie" zamiast
  // rewizji, karta dnia zamiast karty doby i karty arkusza, rozpoczęcie zamiast
  // przejęcia przy własnym starcie, kod błędu na końcu zdania zamiast w nawiasie.
  /\bflag/i,
  /\bchip/i,
  /\bslot/i,
  /zajętoś/i,
  /strumie/i,
  /\bserwer/i,
  /\brejestr(?!ac)/i,
  /zdolnoś/i,
  /\bpuli\b/i,
  /\brewizj/i,
  /\bkart\w* (doby|arkusza)/i,
  /\boperator/i,
  /dziennik (akcji|zmian)/i,
  /szuflad/i,
  /\bper\b/i,
  /\blog\b/i,
  /przejęci/i,
  /\(kod\b/i,
  // Znak równości to zapis wzoru, nie zdanie: „Puste = stan nieznany".
  /\s=\s/,
];

/**
 * Maksymalna długość napisu na ekranie.
 *
 * 160 znaków to około dwóch linii - tyle mieści zdanie, które MOWI, CO ZROBIC.
 * Dłuższy napis w panelu 1.0 był bez wyjątku wykładem o budowie systemu; najdłuższy
 * miał 700 znaków i zaczynał się od „Sprostowanie z 2026-08-01".
 */
const MAX_LENGTH = 160;

/** „Zapisuję…", „Wysyłam link…" - czasownik w pierwszej osobie na początku i wielokropek. */
const FIRST_PERSON_PROGRESS = /^[A-ZĄĆĘŁŃÓŚŹŻ][^\s…]*(ę|am|em)(\s[^…]*)?…$/;

describe('język interfejsu', () => {
  const files = filesUnder('.');

  it('kontrola testu: skaner faktycznie widzi napisy ekranów', () => {
    // Bez tego przypadki niżej przechodziłyby na pustej liście.
    const all = files.flatMap(textsOf);
    expect(all.length).toBeGreaterThan(30);
    // Kotwica na zdaniu, które przeżyje zmiany logowania: „złe hasło" zniknęło razem
    // z hasłami (2026-09-04), a wygaśnięcie sesji zostaje, dopóki jest sesja.
    expect(all).toContain('Sesja wygasła. Zaloguj się jeszcze raz.');

    // Skaner odsiewa identyfikatory: klasy CSS i ścieżki nie są zdaniami.
    expect(sentencesIn("x('cell-sub')")).toEqual([]);
    expect(sentencesIn("x('/piloci/nowy')")).toEqual([]);
    expect(sentencesIn("x('slot_taken')")).toEqual([]);
    // …i faktycznie łapie zdanie, gdyby ktoś je dopisał.
    expect(sentencesIn("x('Zapisano dane w bazie danych.')")).toEqual([
      'Zapisano dane w bazie danych.',
    ]);
    // Etykieta z wielkiej litery jest napisem, nawet jednowyrazowym.
    expect(sentencesIn("x('Slot')")).toEqual(['Slot']);
    // Dwa miejsca, których dawny skaner nie widział: tekst w JSX i szablon.
    expect(sentencesIn('const a = <p>Zmień chip stanu</p>;')).toEqual(['Zmień chip stanu']);
    expect(sentencesIn('const t = `Nie udało się (kod ${s}).`;')).toEqual(['Nie udało się (kod {…}).']);
    // Klasy w `className` nie są napisem, także złożone szablonem; komentarz
    // i komunikat wyjątku też nie.
    expect(sentencesIn('const a = <div className={`chip active ${on}`}>x</div>;')).toEqual([]);
    expect(sentencesIn('// Zmień chip stanu albo rodzaju\nconst a = 1;')).toEqual([]);
    expect(sentencesIn("throw new Error('Brak pola payload w odpowiedzi API');")).toEqual([]);
  });

  it('napisy nie niosą żargonu systemu', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const text of textsOf(file)) {
        for (const term of JARGON) {
          if (term.test(text)) offenders.push(`${file} → „${text}" (${String(term)})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('napisy mieszczą się w dwóch linijkach', () => {
    const offenders = files.flatMap((file) =>
      textsOf(file)
        .filter((text) => text.length > MAX_LENGTH)
        .map((text) => `${file} → ${text.length} znaków: „${text.slice(0, 60)}…"`),
    );
    expect(offenders).toEqual([]);
  });

  it('postęp na przycisku mówi rzeczownikiem, nie pierwszą osobą', () => {
    // Kontrola wzorca: łapie głos aplikacji, przepuszcza stan czynności.
    expect(FIRST_PERSON_PROGRESS.test('Zapisuję…')).toBe(true);
    expect(FIRST_PERSON_PROGRESS.test('Wysyłam link…')).toBe(true);
    expect(FIRST_PERSON_PROGRESS.test('Zapisywanie…')).toBe(false);

    const offenders = files.flatMap((file) =>
      textsOf(file)
        .filter((text) => FIRST_PERSON_PROGRESS.test(text))
        .map((text) => `${file} → „${text}"`),
    );
    expect(offenders).toEqual([]);
  });
});
