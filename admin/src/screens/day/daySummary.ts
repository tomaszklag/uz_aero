/**
 * UZ Aero — panel: KAFLE I KARTY KARTY DNIA, `SessionState` → napisy (moduł CZYSTY).
 *
 * ══ TEN PLIK NIE LICZY DNIA ══
 * Każda wielkość (`blockTimeMs`, `flightTimeMs`, `fuel.consumedL`, `mh.deltaH`,
 * `drops.*`) przychodzi POLICZONA przez `projectSession` — tę samą funkcję, którą
 * telefon liczy ekran 10 i którą serwer buduje kartę arkusza. Tutaj jest wyłącznie
 * formatowanie przez `@uzaero/format` i wybór słów.
 *
 * Jedyne dwa działania arytmetyczne w tym pliku są nazwane i uzasadnione na miejscu:
 * odjęcie dwóch stempli duty (upływ służby) i zaokrąglenie średniej wysokości zrzutu
 * do pełnych stóp. Oba są prezentacją liczb serwera, nie drugim ich wyliczeniem.
 *
 * ══ DZIEŃ OTWARTY: „—" I KONIEC ══
 * Sesja bez `day_close` nie ma odczytów końcowych, więc nie ma zużycia paliwa, delty
 * motogodzin ani czasu służby. Panel pokazuje kreskę i mówi, co ją wypełni. **Nie
 * ekstrapoluje** — ani z ostatniego odczytu, ani z tempa dnia, ani z „teraz".
 * To jest cała treść tego stanu i nic poza nią nie jest prawdą.
 */

import type { MhFormat, SessionState } from '@uzaero/domain';
import { dateUtcShort, hhmm, litres, motoHours, plural, relativeAge, timeUtcSeconds } from '@uzaero/format';

import type { SessionListItemDto, TimelineEntryDto } from '../../api/dto';
import type { KeyValueTone } from '../../ui/components/KeyValue';
import type { TileTone } from '../../ui/components/Tile';
import { timelineSummary } from './dayTimeline';

export interface DayTile {
  label: string;
  value: string;
  unit?: string;
  tone?: TileTone;
  note: string;
}

export interface KvRow {
  label: string;
  value: string;
  unit?: string;
  tone?: KeyValueTone;
}

/** „30 JUL 2026 14:22:07" — stempel bezwzględny, zawsze UTC i zawsze oznaczony. */
export function utcStamp(t: number | null): string {
  return t == null ? '—' : `${dateUtcShort(t)} ${timeUtcSeconds(t)}`;
}

/** ISO z serwera → stempel UTC; napis nieczytelny mówi to wprost zamiast „NaN". */
function isoStamp(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? '—' : utcStamp(at);
}

/**
 * Delta motogodzin i jednostka przy niej.
 *
 * Przy liczniku `hhmm` delta czyta się jako „5:42", więc dopisek „h" byłby wtedy
 * szumem; przy dziesiętnym „5.7" bez jednostki jest nieczytelne. Stąd jednostka
 * warunkowa, a nie stała.
 */
function deltaUnit(format: MhFormat | null): string | undefined {
  return format === 'hhmm' ? undefined : 'h';
}

/**
 * Kafle podsumowania dnia (`A02a`).
 *
 * Czego tu NIE MA i dlaczego: kafla **„Średnie zużycie L/h"** z mockupu. `SessionState`
 * nie niesie tej wielkości, a policzenie jej tutaj (zużycie ÷ czas blokowy) byłoby
 * dokładnie tym „panelem, który liczy po swojemu" — pierwszą liczbą na ekranie, której
 * serwer nigdy nie wysłał, i pierwszą, która rozjedzie się z arkuszem, gdy ktoś zmieni
 * definicję (na blok czy na czas lotu?). Wchodzi wtedy, gdy policzy ją `projectSession`.
 */
export function dayTiles(state: SessionState, mhFormat: MhFormat | null): DayTile[] {
  const openRun = state.engineRunning ? 1 : 0;
  const closedRuns = state.engineRuns.length - openRun;
  const balanced = state.takeoffCount === state.landingCount;

  return [
    {
      label: 'Czas blokowy',
      value: hhmm(state.blockTimeMs),
      note:
        openRun === 0
          ? `${closedRuns} ${plural(closedRuns, 'cykl silnika', 'cykle silnika', 'cykli silnika')} · suma engine_start → engine_stop.`
          : `${closedRuns} ${plural(closedRuns, 'zamknięty cykl', 'zamknięte cykle', 'zamkniętych cykli')} + 1 trwający (nie wchodzi do sumy).`,
    },
    {
      label: 'Czas lotu',
      value: hhmm(state.flightTimeMs),
      note: `${state.flights.length} ${plural(state.flights.length, 'lot', 'loty', 'lotów')} · suma takeoff → landing.`,
    },
    {
      label: 'Starty / lądowania',
      value: `${state.takeoffCount} / ${state.landingCount}`,
      tone: balanced ? 'green' : 'amber',
      note: balanced
        ? 'Bilans się domyka. Zdarzenia unieważnione nie wchodzą do liczb.'
        : 'Bilans się NIE domyka — brakuje lądowania albo startu. Sprawdź oś zdarzeń.',
    },
    {
      label: 'Paliwo zużyte',
      value: litres(state.fuel.consumedL),
      tone: state.fuel.consumedL == null ? undefined : 'amber',
      note: state.closed
        ? 'Startowe + dolane − końcowe, z odczytów paliwomierza.'
        : 'Bilans domknie odczyt końcowy z `day_close`. Do tego czasu — nic.',
    },
    {
      label: 'Δ motogodzin',
      value: motoHours(state.mh.deltaH, mhFormat),
      ...(state.mh.deltaH == null ? {} : { unit: deltaUnit(mhFormat) }),
      note: state.closed
        ? 'Koniec − początek z odczytów fizycznego licznika, nie z czasu blokowego.'
        : 'Delta powstanie z odczytu końcowego licznika przy zamknięciu dnia.',
    },
    dutyTile(state),
  ];
}

/**
 * Czas służby. **Odjęcie dwóch stempli** — tego samego rodzaju działanie, co wiek
 * sprawy w skrzynce flag (`flagRows.ts`): upływ między dwiema chwilami, które podał
 * serwer, a nie druga wersja liczby dnia. `SessionState` nie ma pola `dutyMs`, bo
 * duty nie wchodzi do żadnego bilansu — jest odczytem z meldunku i z przekazania.
 */
function dutyTile(state: SessionState): DayTile {
  if (state.dutyStart == null) {
    return {
      label: 'Czas służby (duty)',
      value: '—',
      note: 'Sesja bez `preflight_confirm` — nie ma meldunku, od którego liczy się służba.',
    };
  }
  if (state.dutyEnd == null) {
    return {
      label: 'Czas służby (duty)',
      value: '—',
      note: `Start ${timeUtcSeconds(state.dutyStart)} UTC · koniec poda \`day_close\`.`,
    };
  }
  return {
    label: 'Czas służby (duty)',
    value: hhmm(state.dutyEnd - state.dutyStart),
    tone: 'blue',
    note: `${timeUtcSeconds(state.dutyStart)} → ${timeUtcSeconds(state.dutyEnd)} UTC · brutto, bez przerw.`,
  };
}

/** Karta „Sesja" — tożsamość dnia i to, co o nim wie serwer poza liczbami. */
export function sessionRows(
  session: SessionListItemDto,
  state: SessionState,
  timeline: readonly TimelineEntryDto[],
  nowMs: number,
): KvRow[] {
  const rows: KvRow[] = [
    { label: 'session_uuid', value: session.sessionUuid },
    { label: 'Meldunek · duty start', value: utcStamp(state.dutyStart) },
  ];

  if (state.closedAt == null) {
    rows.push({ label: 'Zamknięcie', value: 'dzień trwa', tone: 'amber' });
  } else {
    rows.push({ label: 'Zamknięcie', value: utcStamp(state.closedAt) });
    // Wiek zamknięcia, nie „czy okno korekty minęło": próg 24 h jest WARTOŚCIĄ DOMENY
    // (`packages/domain/src/rules/tolerances.ts`), a panelowi wolno importować z domeny
    // wyłącznie typy. Kopia progu tutaj byłaby liczbą, która rozjedzie się po cichu.
    rows.push({ label: 'Zamknięty przed', value: relativeAge(nowMs - state.closedAt) });
  }

  rows.push(
    { label: 'Zdarzeń w rejestrze', value: timelineSummary(timeline) },
    { label: 'Ostatnia paczka', value: isoStamp(session.updatedAt) },
    {
      label: 'Karta arkusza',
      value: session.exportRevision == null ? 'brak' : `rewizja ${session.exportRevision}`,
      ...(session.exportRevision == null ? { tone: 'amber' as const } : {}),
    },
  );

  return rows;
}

/** Karta „Paliwo" — wszystko w litrach, z odczytów paliwomierza. */
export function fuelRows(state: SessionState): KvRow[] {
  return [
    { label: 'Startowe', value: litres(state.fuel.startL) },
    { label: 'Dolane', value: litres(state.fuel.addedL) },
    { label: 'Końcowe', value: litres(state.fuel.endL) },
    {
      label: 'Zużyte',
      value: litres(state.fuel.consumedL),
      ...(state.fuel.consumedL == null ? {} : { tone: 'amber' as const }),
    },
    { label: 'Ostatni odczyt', value: litres(state.fuel.lastReadingL) },
  ];
}

/** Karta „Motogodziny" — wartości licznika W FORMACIE TEGO SAMOLOTU. */
export function mhRows(state: SessionState, mhFormat: MhFormat | null): KvRow[] {
  return [
    { label: 'Początek', value: motoHours(state.mh.start, mhFormat) },
    { label: 'Koniec', value: motoHours(state.mh.end, mhFormat) },
    {
      label: 'Delta',
      value: motoHours(state.mh.deltaH, mhFormat),
      ...(state.mh.deltaH == null ? {} : { tone: 'green' as const }),
    },
    {
      label: 'Format licznika',
      value:
        mhFormat === 'hhmm'
          ? 'hh:mm'
          : mhFormat === 'decimal'
            ? 'dziesiętny'
            : 'nieznany — pokazane dziesiętnie',
      ...(mhFormat == null ? { tone: 'amber' as const } : {}),
    },
  ];
}

/**
 * Karta „Zrzuty · strona przychodowa".
 *
 * Średnia wysokość przychodzi z projekcji jako liczba zmiennoprzecinkowa i tutaj jest
 * **zaokrąglana do pełnych stóp wyłącznie do wyświetlenia** — wysokość zrzutu z GPS
 * nie ma sensownej części ułamkowej, a „12856.25 ft" sugerowałoby dokładność, której
 * nie ma. To jest formatowanie liczby serwera, nie jej wyliczenie.
 */
export function dropRows(state: SessionState): KvRow[] {
  const d = state.drops;
  return [
    { label: 'Wyniesień', value: String(d.count), ...(d.count === 0 ? {} : { tone: 'green' as const }) },
    { label: 'Skoczków', value: String(d.totalJumpers) },
    {
      label: 'Tandem / AFF / Solo',
      value: `${d.jumpers.tandem} / ${d.jumpers.aff} / ${d.jumpers.solo}`,
    },
    {
      label: 'Śr. wysokość',
      value: d.avgAltitudeFt == null ? '—' : String(Math.round(d.avgAltitudeFt)),
      ...(d.avgAltitudeFt == null ? {} : { unit: 'ft' }),
    },
    { label: 'Klient', value: state.client ?? '—' },
  ];
}
