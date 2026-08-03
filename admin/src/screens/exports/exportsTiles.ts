/**
 * UZ Aero — panel: kafle i chipy monitora eksportu (moduł CZYSTY, testowany w Node).
 *
 * Wszystkie liczby pochodzą z pola `counts` odpowiedzi, policzonego przez serwer nad
 * CAŁYM zakresem zapytania — poza `LIMIT`-em. Panel ich nie sumuje: suma z widocznej
 * strony kłamałaby przy każdym obcięciu, a przy zawężeniu chipem pokazywałaby zera na
 * wszystkich pozostałych.
 *
 * `counts === undefined` (zapytanie w drodze albo nieudane) daje „—", nigdy `0`. Zero
 * jest twierdzeniem o świecie — „w tym zakresie nie ma ani jednej karty" — a brak
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

const show = (value: number | undefined): string => (value === undefined ? '—' : String(value));

/**
 * Cztery kafle z mockupu, w tej samej kolejności. Zamiast „Błąd regeneracji" stoi
 * „Brak karty" i to nie jest przemianowanie kosmetyczne: nieudany eksport NIE zostawia
 * po sobie wiersza w żadnej tabeli (dziennik dostaje wpis dopiero po udanym zapisie
 * karty), więc licznika prób ani treści błędu nie ma z czego policzyć. To, co da się
 * policzyć uczciwie, to dni zamknięte BEZ karty — czyli skutek tych awarii.
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
      note: 'otwarta session_overlap trzyma dzień poza dokumentem klubu',
    },
    {
      label: 'Bez karty',
      value: show(counts?.missing),
      tone: 'red',
      note: 'dzień zamknięty, a eksport nie doszedł do skutku',
    },
  ];
}

/**
 * Baner „karty nadpisane przez drugą sesję tego dnia" — `null`, gdy nie ma ani jednej.
 *
 * Zdanie mówi też, czego system NIE rozstrzygnął, bo ta wada nie ma poprawki po stronie
 * panelu: konwencja nazw kart (`YYYY-MM-DD_SP-XXX`) jest lustrem ekranu 11 telefonu
 * i częścią §4.7, więc scalanie sesji w jedną kartę albo wpuszczenie sesji do nazwy jest
 * decyzją produktową, a nie zmianą w mapperze. Do czasu jej podjęcia monitor ma
 * przynajmniej nie twierdzić, że obie karty są w arkuszu.
 */
export function overwrittenNotice(counts: ExportCountsDto | undefined): string | null {
  const n = counts?.overwritten ?? 0;
  if (n === 0) return null;
  return (
    `${n} ${plural(n, 'dzień ma kartę nadpisaną', 'dni ma karty nadpisane', 'dni ma karty nadpisane')} ` +
    'przez INNĄ sesję tego samego dnia i samolotu. Nazwa karty niesie dzień i samolot, ale nie ' +
    'sesję, a exported_sheets trzyma jedną treść na nazwę — więc zmiana popołudniowa nadpisała ' +
    'kartę porannej i tamtego dnia pracy nie ma dziś w dokumencie klubu. Dziennik eksportu ' +
    'pamięta obie wysyłki, bo jest append-only. Czy karta dzienna ma obejmować wszystkie sesje ' +
    'samolotu, czy nazwa ma nieść sesję — to jest otwarta decyzja produktowa dotykająca też ' +
    'telefonu (§4.7), więc panel jej nie przesądza.'
  );
}

export interface ExportChip {
  scope: ExportScope;
  label: string;
  count: number | undefined;
  title: string;
}

/** Chipy filtra — etykieta, liczba z serwera i zdanie mówiące, co ten chip zawęża. */
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
      // Zawęża po samym NUMERZE rewizji, niezależnie od stanu karty — dokładnie tak,
      // jak serwer liczy `counts.revised`. Zdanie mówiące „wśród kart istniejących"
      // byłoby opisem innego chipa niż ten (poprawka prozy z 2026-08-01).
      title: 'Dni z rewizją większą niż 1 — karta wracała do arkusza, niezależnie od jej dzisiejszego stanu.',
    },
    {
      scope: 'blocked',
      label: 'Zablokowane',
      count: counts?.blocked,
      title: 'Otwarta flaga session_overlap trzyma kartę poza arkuszem.',
    },
    {
      scope: 'missing',
      label: 'Bez karty',
      count: counts?.missing,
      title: 'Dzień zamknięty, a karta nie powstała — eksport nie doszedł.',
    },
    {
      scope: 'waiting',
      label: 'Czekają',
      count: counts?.waiting,
      title: 'Dni bez day_close — karta powstaje dopiero po zamknięciu.',
    },
    {
      scope: 'impossible',
      label: 'Bez preflightu',
      count: counts?.impossible,
      title: 'Sesje bez duty startu — karty nie da się nazwać.',
    },
  ];
}

/**
 * Baner „lista jest przycięta" — `null`, gdy nie jest.
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
    `Widzisz ${page.shown} z ${page.matched} dni pasujących do tego zawężenia — ` +
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
        note: 'Żaden dzień nie spełnia bieżących filtrów. Zdejmij chip albo poszerz zakres dat — liczniki nad tabelą pokazują, gdzie coś jest.',
      }
    : {
        title: 'ŻADEN DZIEŃ NIE ZOSTAŁ ZAMKNIĘTY',
        note: 'Karta arkusza powstaje po day_close danej sesji. Dopóki w rejestrze nie ma ani jednego dnia, monitor eksportu nie ma czego pokazać.',
      };
}
