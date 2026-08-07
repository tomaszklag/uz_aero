/**
 * UZ Aero — panel: karta „WPŁYW NA LICZBY DNIA · PRZED → PO" (moduł CZYSTY).
 *
 * ══ ANI JEDNA LICZBA NIE POWSTAJE TUTAJ ══
 * `before` i `after` to dwa `SessionState` policzone przez SERWER (`projectSession`,
 * na strumieniu z doklejonym kandydatem korekty). Ten plik wyłącznie je zestawia
 * i formatuje przez `@uzaero/format`. To nie jest pedanteria: gdyby panel liczył skutek
 * sam, pierwszą ofiarą byłby `void` — unieważnienie `engine_stop` NIE skraca cyklu
 * o różnicę czasów, tylko zostawia go OTWARTYM, przez co cały cykl wypada z czasu
 * blokowego. Tej reguły nie da się odgadnąć z payloadu.
 *
 * ══ CZEGO Z MOCKUPU TU NIE MA ══
 * Wierszy **„Średnie zużycie L/h"** i **„Blok − Δ MH"**. `SessionState` nie niesie
 * żadnej z tych wielkości, a policzenie ich tutaj (zużycie ÷ blok, blok − delta MH)
 * byłoby dokładnie tym „panelem, który liczy po swojemu": pierwszą liczbą na ekranie,
 * której serwer nigdy nie wysłał, i pierwszą, która rozjedzie się z arkuszem, gdy ktoś
 * zmieni definicję. Ta sama decyzja, co przy kaflu „Średnie zużycie" na karcie dnia
 * (`daySummary.ts`). Wchodzą wtedy, gdy policzy je `projectSession`.
 */

import type { MhFormat, SessionState } from '@uzaero/domain';
import { durationLong, hhmm, litres, motoHours, plural } from '@uzaero/format';

import type { KeyValueTone } from '../../ui/components/KeyValue';

export interface ImpactRow {
  label: string;
  /** Wartość sprzed korekty, gotowa do wyświetlenia (kreska, gdy jej nie ma). */
  before: string;
  after: string;
  changed: boolean;
  tone?: KeyValueTone;
  /** Dopisek — dlaczego się zmieniło albo dlaczego NIE MOŻE się zmienić. */
  note?: string;
}

/**
 * Zestawienie „przed → po".
 *
 * Wiersze BEZ zmiany zostają na karcie z dopiskiem „bez zmian" — dokładnie jak
 * w mockupie. To nie jest szum: administrator korygujący czas silnika musi zobaczyć,
 * że starty, lądowania i odczyt motogodzin NIE drgnęły, bo to jest dowód, że korekta
 * dotknęła tylko tego, co miała dotknąć.
 */
export function impactRows(
  before: SessionState,
  after: SessionState,
  mhFormat: MhFormat | null,
): ImpactRow[] {
  const rows: ImpactRow[] = [
    row('Czas blokowy dnia', hhmm(before.blockTimeMs), hhmm(after.blockTimeMs), {
      note: blockNote(before, after),
      // Cykl zostawiony OTWARTY to jedyny stan, który tu wolno ocenić: dzień
      // z niezamkniętym silnikiem nie ma czasu blokowego w ogóle. Reszty („lepiej"
      // czy „gorzej") panel nie ocenia — na to trzeba tolerancji, których nie zna.
      tone: !before.engineRunning && after.engineRunning ? 'red' : undefined,
    }),
    ...engineRunRows(before, after),
    row('Czas lotu', hhmm(before.flightTimeMs), hhmm(after.flightTimeMs)),
    row(
      'Starty / lądowania',
      `${before.takeoffCount} / ${before.landingCount}`,
      `${after.takeoffCount} / ${after.landingCount}`,
      {
        tone: after.takeoffCount === after.landingCount ? undefined : 'amber',
        note:
          after.takeoffCount === after.landingCount
            ? undefined
            : 'bilans się NIE domyka — brakuje startu albo lądowania',
      },
    ),
    row('Lotów w dniu', flightsLabel(before), flightsLabel(after)),
    row('Paliwo zużyte', litres(before.fuel.consumedL), litres(after.fuel.consumedL), {
      note: 'z odczytów paliwomierza — korekta czasu nie rusza litrów',
    }),
    row(
      'Δ motogodzin',
      motoHours(before.mh.deltaH, mhFormat),
      motoHours(after.mh.deltaH, mhFormat),
      { note: 'odczyt fizycznego licznika — nietykalny, cel korekty nim nie jest' },
    ),
    row('Czas służby (duty)', duty(before), duty(after), {
      note: 'z meldunku i z `day_close` — obu nie da się korygować',
    }),
    row(
      'Zdarzeń w projekcji',
      String(before.eventCount),
      String(after.eventCount),
      { note: 'strumień EFEKTYWNY: bez korekt i bez zdarzeń unieważnionych' },
    ),
  ];

  return rows;
}

function row(
  label: string,
  before: string,
  after: string,
  extra: { tone?: KeyValueTone; note?: string } = {},
): ImpactRow {
  const changed = before !== after;
  return {
    label,
    before,
    after,
    changed,
    ...(extra.tone == null ? {} : { tone: extra.tone }),
    ...(extra.note == null ? {} : { note: extra.note }),
  };
}

/**
 * Cykle silnika — po jednym wierszu na cykl, który korekta rusza.
 *
 * Mockup pokazuje „Cykl silnika 3: 01:17:19 → 01:05:19" i to jest właściwy poziom
 * szczegółu: administrator poprawia KONKRETNE wyłączenie silnika, więc musi zobaczyć
 * ten cykl, a nie tylko sumę dnia. Cykle niezmienione pomijamy — dzień skokowy ma ich
 * kilka i wypisanie wszystkich zamieniłoby kartę w tabelę bez treści.
 *
 * Pary bierzemy po INDEKSIE, bo `projectSession` buduje `legs` w kolejności
 * chronologicznej, a korekta czasu nie zmienia liczby cykli — z jednym wyjątkiem,
 * który jest tu najważniejszy: `void` na `engine_stop` zostawia cykl otwarty.
 */
function engineRunRows(before: SessionState, after: SessionState): ImpactRow[] {
  const count = Math.max(before.legs.length, after.legs.length);
  const out: ImpactRow[] = [];

  for (let i = 0; i < count; i += 1) {
    const a = before.legs[i];
    const b = after.legs[i];
    const label = `Cykl silnika ${i + 1}`;
    const beforeText = a == null ? '—' : runText(a.stoppedAt, a.durationMs);
    const afterText = b == null ? 'znika' : runText(b.stoppedAt, b.durationMs);
    if (beforeText === afterText) continue;

    out.push(
      row(label, beforeText, afterText, {
        ...(b != null && b.stoppedAt == null
          ? {
              tone: 'red' as const,
              note: 'cykl zostaje OTWARTY — wypada z czasu blokowego w całości, nie skraca się',
            }
          : {}),
      }),
    );
  }

  return out;
}

const runText = (stoppedAt: number | null, durationMs: number): string =>
  stoppedAt == null ? 'otwarty' : durationLong(durationMs);

const flightsLabel = (state: SessionState): string =>
  `${state.flights.length} ${plural(state.flights.length, 'lot', 'loty', 'lotów')}`;

/**
 * Czas służby. **Odjęcie dwóch stempli** podanych przez serwer — ta sama kategoria
 * działania, co kafel duty na karcie dnia (`daySummary.ts`): upływ między dwiema
 * chwilami, a nie druga wersja liczby dnia. `SessionState` nie ma pola `dutyMs`,
 * bo duty nie wchodzi do żadnego bilansu.
 */
function duty(state: SessionState): string {
  if (state.dutyStart == null || state.dutyEnd == null) return '—';
  return hhmm(state.dutyEnd - state.dutyStart);
}

/** Zdanie pod czasem blokowym — jedyne miejsce, gdzie `void` tłumaczy się sam. */
function blockNote(before: SessionState, after: SessionState): string | undefined {
  if (!before.engineRunning && after.engineRunning) {
    return 'po korekcie dzień nie ma zamknięcia ostatniego cyklu silnika';
  }
  if (before.blockTimeMs === after.blockTimeMs) return undefined;
  return 'suma zamkniętych cykli engine_start → engine_stop';
}
