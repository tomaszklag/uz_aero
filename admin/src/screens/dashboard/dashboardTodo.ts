/**
 * UZ Aero — panel: KOLEJKA „WYMAGA UWAGI" (moduł CZYSTY).
 *
 * ══ JEDYNE MIEJSCE PANELU, KTÓRE STAWIA ZADANIA ══
 * Reszta panelu opisuje stan; ta lista mówi, co ZROBIĆ. Dlatego każdy wiersz jest
 * linkiem w głąb, a wiek pozycji ma własną kolumnę: flaga leżąca trzeci dzień to inny
 * problem niż ta sprzed godziny.
 *
 * ══ SERWER PODAJE TRZY LISTY, PANEL SKŁADA JEDEN PORZĄDEK ══
 * Spłaszczenie tego na serwerze wymagałoby CZWARTEJ definicji „sprawy" obok flagi,
 * karty dnia i sesji — czyli dokładnie tego rozjazdu definicji, którego pulpit ma
 * unikać. Panel dostaje trzy kontrakty ekranów docelowych w stanie nietkniętym
 * i podejmuje jedną decyzję: w jakiej kolejności je pokazać. To jest decyzja
 * O TREŚCI EKRANU, więc mieszka w module czystym z testem — nie w `.tsx`.
 *
 * Porządek: **blokujące arkusz przodem, dalej najstarsze**. Ten sam klucz, co
 * w skrzynce flag `A03` — bo to jest ta sama myśl: sprawa, która trzyma dokument klubu
 * poza arkuszem, jest pilniejsza od sprawy, która „tylko" czeka.
 */

import { relativeAge } from '@uzaero/format';

import type {
  DashboardAttentionDto,
  ExportListItemDto,
  FlagListItemDto,
  SessionListItemDto,
} from '../../api/dto';
import { FLAG_TYPE_META } from '../flags/flagTypes';
import { dayCardLink, missingExportsHref, flagHref } from './dashboardLinks';

/** Ton znacznika przy wierszu (`.todo-mark` z `SZABLON.html`). */
export type TaskTone = 'amber' | 'red' | 'blue';

/**
 * Rodzaj sprawy — decyduje o ikonie i o tym, dokąd wiersz prowadzi. Trzymany jako
 * dana, a nie jako `if` w JSX-ie: ikona jest decyzją o treści.
 */
export type TaskKind = 'flag' | 'export' | 'open_day';

export interface TodoTask {
  key: string;
  kind: TaskKind;
  tone: TaskTone;
  /** Pierwsza linia: co to za sprawa i czego dotyczy. */
  name: string;
  /** Druga linia: dlaczego to jest zadanie. Renderowana jako TEKST, nigdy jako HTML. */
  meta: string;
  /** „3 dni" / „18 h" — wiek sprawy, nie znacznik czasu. */
  age: string;
  /** `true` = wiek przekroczył dobę; wiersz dostaje bursztyn (`.todo-age.old`). */
  old: boolean;
  to: string;
  /** Klucz sortowania: chwila POWSTANIA sprawy (epoch ms UTC). */
  since: number;
  /** `true` = ta sprawa trzyma kartę dnia poza arkuszem. Idzie na górę. */
  blocking: boolean;
}

/**
 * Od kiedy wiek sprawy dostaje bursztyn (`.todo-age.old`).
 *
 * Doba, czyli tyle samo, co okno samodzielnej korekty pilota — ta liczba przychodzi
 * z serwera (`DashboardDto.correctionWindowMs`) i jest tu parametrem właśnie po to,
 * żeby panel nie trzymał drugiej kopii reguły domeny.
 */
export function todoTasks(
  attention: DashboardAttentionDto,
  nowMs: number,
  correctionWindowMs: number,
): TodoTask[] {
  const tasks = [
    ...attention.flags.map((flag) => flagTask(flag, nowMs, correctionWindowMs)),
    ...attention.failedExports.map((row) => exportTask(row, nowMs, correctionWindowMs)),
    ...attention.staleOpenDays.map((row) => openDayTask(row, nowMs, correctionWindowMs)),
  ];

  // Stabilne sortowanie: najpierw to, co blokuje arkusz, potem najstarsze. `sort` w JS
  // jest stabilny od ES2019, więc pozycje o równym kluczu zachowują porządek serwera
  // — a ten jest w każdej z trzech list przemyślany osobno.
  return tasks.sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    return a.since - b.since;
  });
}

function ageOf(sinceMs: number, nowMs: number, windowMs: number) {
  const ms = Math.max(0, nowMs - sinceMs);
  return { age: relativeAge(ms), old: ms > windowMs, since: sinceMs };
}

function flagTask(flag: FlagListItemDto, nowMs: number, windowMs: number): TodoTask {
  const meta = FLAG_TYPE_META[flag.type];
  const at = Date.parse(flag.createdAt);
  const sinceMs = Number.isNaN(at) ? nowMs : at;
  const { age, old, since } = ageOf(sinceMs, nowMs, windowMs);

  return {
    key: `flag-${flag.id}`,
    kind: 'flag',
    // Sprawa blokująca arkusz jest czerwona, a nie bursztynowa: to nie jest
    // „do sprawdzenia", tylko „dokument klubu na to czeka".
    tone: flag.blocksExport ? 'red' : 'amber',
    name: `${flag.type} · ${flag.reg ?? flag.aircraftId}`,
    // Opis bierzemy z katalogu skrzynki (`FLAG_TYPE_META`), a nie piszemy drugi raz:
    // to ta sama flaga i ma znaczyć na obu ekranach to samo.
    meta: flag.blocksExport
      ? `${meta.short} — karta dnia nie powstanie, dopóki flaga jest otwarta.`
      : meta.short,
    age,
    old,
    since,
    blocking: flag.blocksExport,
    to: flagHref(flag.id),
  };
}

function exportTask(row: ExportListItemDto, nowMs: number, windowMs: number): TodoTask {
  // Wiek liczymy od OSTATNIEJ PACZKI tej sesji (`updatedAt`), bo nieudany eksport nie
  // zostawia po sobie ani wiersza, ani stempla — nie ma innego momentu, od którego
  // dałoby się uczciwie liczyć „jak długo to leży".
  const at = Date.parse(row.updatedAt);
  const sinceMs = Number.isNaN(at) ? nowMs : at;
  const { age, old, since } = ageOf(sinceMs, nowMs, windowMs);

  return {
    key: `export-${row.sessionUuid}`,
    kind: 'export',
    tone: 'red',
    name: `Karta dnia bez arkusza · ${row.reg ?? row.aircraftId}${row.day == null ? '' : ` · ${row.day}`}`,
    meta:
      row.revision == null
        ? 'Dzień zamknięty, w dzienniku eksportu ani jednego wiersza — próba zapisu odbiła się awarią.'
        : `Ostatnia rewizja ${row.revision}; bieżąca karta nie powstała.`,
    age,
    old,
    since,
    // Brakująca karta to dokument klubu, którego nie ma — traktujemy ją tak samo
    // pilnie jak flagę blokującą.
    blocking: true,
    to: missingExportsHref(row.sessionUuid),
  };
}

function openDayTask(row: SessionListItemDto, nowMs: number, windowMs: number): TodoTask {
  // Chwila PRZEJĘCIA, a nie `updatedAt`: pytanie brzmi „jak długo ta maszyna jest
  // zajęta", a nie „kiedy ostatnio coś do niej dotarło".
  const sinceMs = row.claimedAt ?? nowMs;
  const { age, old, since } = ageOf(sinceMs, nowMs, windowMs);

  return {
    key: `day-${row.sessionUuid}`,
    kind: 'open_day',
    tone: 'blue',
    // Po §3.6a sesja to PRZEJĘCIE → ZDANIE jednej maszyny, nie „dzień lotny": pilot
    // potrafi w jednej służbie zdać jedną maszynę i wziąć drugą. Otwarta sesja znaczy
    // więc dokładnie tyle, że samolot nie wrócił do puli — i tak ma się nazywać.
    name: `Samolot nieoddany · ${row.reg ?? row.aircraftId}`,
    // Mockup pisze tu „okno samodzielnej korekty pilota mija za 4 h". To nieprawda
    // z DWÓCH powodów naraz: okno kotwiczy się w ZAMKNIĘCIU WZLOTU (`leg_close`,
    // etap B3), więc biegnie niezależnie od zdania maszyny, a zdanie samolotu jest
    // opcjonalne i niczego nie odlicza. Doba jest tu MIARĄ tego, jak długo maszyna
    // stoi zajęta, a nie odliczaniem.
    meta: `Brak \`day_close\` — maszyna stoi zajęta dłużej niż dobę, więc nikt inny jej nie przejmie, a łańcuch motogodzin nie ma ogniwa zamykającego. Karta doby powstaje po zdaniu samolotu.`,
    age,
    old,
    since,
    blocking: false,
    to: dayCardLink(row.sessionUuid),
  };
}

export interface TodoEmptyCopy {
  title: string;
  note: string;
}

/**
 * Pusta kolejka to POTWIERDZENIE, nie pustka po błędzie — i to jest cała treść
 * wariantu `A01a`. Stan pusty musi więc powiedzieć, co się tu w ogóle pojawia i skąd,
 * bo inaczej administrator nie odróżni „nie ma zadań" od „nie działa".
 */
export const TODO_EMPTY: TodoEmptyCopy = {
  title: 'KOLEJKA UWAGI JEST PUSTA',
  note: 'Wchodzą tu trzy rzeczy i wszystkie trzy tworzy serwer, nie człowiek: flagi wykryte przy przyjęciu zdarzeń (dziura w łańcuchu motogodzin, cofnięty licznik, nakładające się sesje), dzień bez `day_close` starszy niż doba oraz karta dnia, której eksport odbił się awarią. Dziś nie ma żadnej z nich.',
};
