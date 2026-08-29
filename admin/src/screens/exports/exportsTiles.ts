/**
 * UZ Aero - panel: kafle i chipy monitora eksportu (moduł CZYSTY, testowany w Node).
 *
 * Wszystkie liczby pochodzą z pola `counts` odpowiedzi, policzonego przez serwer nad
 * CAŁYM zakresem zapytania - poza `LIMIT`-em. Panel ich nie sumuje: suma z widocznej
 * strony kłamałaby przy każdym obcięciu, a przy zawężeniu chipem pokazywałaby zera na
 * wszystkich pozostałych.
 *
 * `counts === undefined` (zapytanie w drodze albo nieudane) daje „-", nigdy `0`. Zero
 * jest twierdzeniem o świecie - „w tym zakresie nie ma ani jednej karty" - a brak
 * odpowiedzi nim nie jest.
 */

import { plural } from '@uzaero/format';

import type { ExportCountsDto } from '../../api/dto';
import type { TileTone } from '../../ui/components/Tile';
import { EXPORTS_PAGE_LIMIT, type ExportScope } from './exportsFilters';

export interface ExportTile {
  label: string;
  value: string;
  tone?: TileTone;
  note: string;
}

const show = (value: number | undefined): string => (value === undefined ? '-' : String(value));

/**
 * Cztery kafle z mockupu, w tej samej kolejności. Zamiast „Błąd regeneracji" stoi
 * „Brak karty" i to nie jest przemianowanie kosmetyczne: nieudany eksport NIE zostawia
 * po sobie wiersza w żadnej tabeli (dziennik dostaje wpis dopiero po udanym zapisie
 * karty), więc licznika prób ani treści błędu nie ma z czego policzyć. To, co da się
 * policzyć uczciwie, to dni zamknięte BEZ karty - czyli skutek tych awarii.
 */
export function exportTiles(counts: ExportCountsDto | undefined): ExportTile[] {
  return [
    {
      label: 'Karty w arkuszu',
      value: show(counts?.current),
      tone: 'green',
      note: 'dni zamknięte, których treść leży w exported_sheets',
    },
    {
      label: 'Rewizje > 1',
      value: show(counts?.revised),
      tone: 'blue',
      note: 'karty, które wracały do arkusza: spóźnione dane i korekty',
    },
    {
      label: 'Zablokowane flagą',
      value: show(counts?.blocked),
      tone: 'red',
      note: 'otwarta aircraft_overlap wycina tę sesję z karty doby',
    },
    {
      label: 'Bez karty',
      value: show(counts?.missing),
      tone: 'red',
      note: 'samolot zdany, a eksport nie doszedł do skutku',
    },
  ];
}

/**
 * Baner „karty nadpisane przez inną sesję" - `null`, gdy nie ma ani jednej.
 *
 * ══ ZNACZENIE TEGO BANERA ZMIENIŁO SIĘ 2026-08-07 ══
 * Opisywał OTWARTĄ decyzję produktową: dwie zamknięte zmiany jednego samolotu budowały
 * karty o tej samej nazwie i druga nadpisywała pierwszą. **Decyzja zapadła: karta jest
 * DOBĄ SAMOLOTU** (§4.7), a zmiany są jej wierszami - więc ta wada zniknęła
 * z konstrukcji, zamiast zostać opisana.
 *
 * Baner zostaje, bo ma dziś DWA realne znaczenia. Pierwsze: sesja wycięta z karty otwartą
 * flagą przestaje być opisana treścią leżącą pod tą nazwą, a doba idzie do arkusza bez
 * niej. Drugie i ważniejsze - jest SYGNALIZATOREM: zapalenie się go dla dwóch sesji TEJ
 * SAMEJ doby znaczyłoby, że znów powstają dwie karty jednego dokumentu, czyli że regres
 * wrócił.
 */
export function overwrittenNotice(counts: ExportCountsDto | undefined): string | null {
  const n = counts?.overwritten ?? 0;
  if (n === 0) return null;
  return (
    `${n} ${plural(n, 'sesja ma kartę nadpisaną', 'sesje mają karty nadpisane', 'sesji ma karty nadpisane')} ` +
    'przez INNY eksport tej samej nazwy. Od 2026-08-07 karta jest DOBĄ SAMOLOTU (§4.7), więc ' +
    'zmiana poranna i popołudniowa są WIERSZAMI jednego dokumentu i nadpisywać się nie mają ' +
    'prawa - normalną przyczyną tego stanu jest sesja wycięta z karty otwartą flagą ' +
    'aircraft_overlap: doba poszła do arkusza bez niej, więc treść pod tą nazwą jej nie ' +
    'opisuje. Jeśli natomiast nadpisują się DWIE sesje tej samej doby i maszyny, to znaczy, ' +
    'że znów powstają dwie karty jednego dokumentu - i to jest usterka do zgłoszenia. ' +
    'Dziennik eksportu pamięta obie wysyłki, bo jest append-only.'
  );
}

export interface ExportChip {
  scope: ExportScope;
  label: string;
  count: number | undefined;
  title: string;
}

/** Chipy filtra - etykieta, liczba z serwera i zdanie mówiące, co ten chip zawęża. */
export function exportChips(counts: ExportCountsDto | undefined): ExportChip[] {
  return [
    { scope: 'all', label: 'Wszystkie', count: counts?.total, title: 'Wszystkie dni w zakresie.' },
    {
      scope: 'current',
      label: 'W arkuszu',
      count: counts?.current,
      title: 'Dni, których karta leży w exported_sheets.',
    },
    {
      scope: 'revised',
      label: 'Rewizje',
      count: counts?.revised,
      // Zawęża po samym NUMERZE rewizji, niezależnie od stanu karty - dokładnie tak,
      // jak serwer liczy `counts.revised`. Zdanie mówiące „wśród kart istniejących"
      // byłoby opisem innego chipa niż ten (poprawka prozy z 2026-08-01).
      title: 'Dni z rewizją większą niż 1 - karta wracała do arkusza, niezależnie od jej dzisiejszego stanu.',
    },
    {
      scope: 'blocked',
      label: 'Zablokowane',
      count: counts?.blocked,
      title: 'Otwarta flaga aircraft_overlap wycina tę sesję z karty doby.',
    },
    {
      scope: 'missing',
      label: 'Bez karty',
      count: counts?.missing,
      title: 'Samolot zdany, a karta nie powstała - eksport nie doszedł.',
    },
    {
      scope: 'waiting',
      label: 'Czekają',
      count: counts?.waiting,
      title: 'Sesje bez day_close - wiersz karty domyka zdanie samolotu.',
    },
    {
      scope: 'impossible',
      label: 'Bez claimu',
      count: counts?.impossible,
      title: 'Sesje bez session_claim - karty nie da się nazwać.',
    },
  ];
}

/**
 * Baner „lista jest przycięta" - `null`, gdy nie jest.
 *
 * Do 2026-08-01 tego zdania na ekranie NIE BYŁO, choć docblock stałej `EXPORTS_PAGE_LIMIT`
 * twierdził, że „ekran mówi o tym wprost". Lista przycięta po cichu jest najgorszym
 * trybem awarii narzędzia nadzoru: wygląda na komplet, więc odpowiedź „każdy dzień ma
 * arkusz" brzmi tak samo, jak gdyby była prawdziwa.
 *
 * Liczniki nad tabelą pozostają PRAWDZIWE (serwer liczy je poza limitem), więc zdanie
 * mówi dokładnie tyle, ile trzeba: ile wierszy widać, ilu nie widać i co z tym zrobić.
 */
export function truncationNotice(page: {
  shown: number;
  matched: number;
  truncated: boolean;
}): string | null {
  if (!page.truncated) return null;
  const hidden = page.matched - page.shown;
  return (
    `Widzisz ${page.shown} z ${page.matched} dni pasujących do tego zawężenia - ` +
    `${hidden} ${plural(hidden, 'dzień', 'dni', 'dni')} poza listą, bo panel pobiera najwyżej ` +
    `${EXPORTS_PAGE_LIMIT} wierszy naraz. Liczniki i kafle nad tabelą opisują CAŁY zakres, ` +
    'więc pokazują także to, czego tu nie widać. Zawęź zakres dat albo wybierz chip stanu, ' +
    'żeby dojść do reszty.'
  );
}

export interface EmptyCopy {
  title: string;
  note: string;
}

/**
 * Pustka ma DWA różne znaczenia i mylenie ich jest realną wadą: „nikt nie latał" to co
 * innego niż „to zawężenie nic nie łapie". Drugi przypadek wymaga podpowiedzi, jak
 * z niego wyjść; pierwszy wymaga wyłącznie prawdy.
 */
export function exportsEmpty(narrowed: boolean): EmptyCopy {
  return narrowed
    ? {
        title: 'NIC W TYM ZAWĘŻENIU',
        note: 'Żaden dzień nie spełnia bieżących filtrów. Zdejmij chip albo poszerz zakres dat - liczniki nad tabelą pokazują, gdzie coś jest.',
      }
    : {
        title: 'ŻADEN DZIEŃ NIE ZOSTAŁ ZAMKNIĘTY',
        note: 'Karta arkusza powstaje po day_close danej sesji. Dopóki w rejestrze nie ma ani jednego dnia, monitor eksportu nie ma czego pokazać.',
      };
}
