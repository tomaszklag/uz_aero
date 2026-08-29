/**
 * UZ Aero - ile silnik pracował, a ile samolot leciał, w DOWOLNYM oknie czasu.
 *
 * ══ DLACZEGO TEN MODUŁ POWSTAŁ ══
 * Analityka zużycia potrzebuje mianownika: „ile silnik pracował między dwoma odczytami
 * paliwomierza". Projekcja sesji daje sumy CAŁEGO dnia (`blockTimeMs`, `flightTimeMs`),
 * a interwał paliwowy zaczyna się i kończy w środku dnia - często w środku cyklu.
 *
 * ══ BŁĄD, KTÓRY TEN MODUŁ NAPRAWIA (2026-08-05) ══
 * Ekran 06 liczył czas pracy silnika wyłącznie z `state.legs` (dawniej `engineRuns`)
 * (`app/src/ui/screens/logic/refuelMath.ts`). Tymczasem `projectSession` obsługuje
 * `manual_log_entry` (fallback GPS, ekran 08) INACZEJ niż parę `engine_start`/`engine_stop`:
 * dokłada czas off-block→on-block wprost do `blockTimeMs` i **nie tworzy wpisu
 * w `legs`** (patrz `projections/session.ts`, gałąź `manual_log_entry`).
 * Skutek: w dniu z wpisem ręcznym mianownik był za mały, a średnia L/h - zawyżona,
 * i wyglądała dokładnie tak samo jak prawidłowa. Dokładnie ten tryb awarii, przed
 * którym ostrzega docblok `refuelMath.ts`: „zła średnia wygląda jak dobra".
 *
 * ══ ODCINKI SCALAMY, NIE SUMUJEMY ══
 * Czas pracy silnika to miara SUMY MNOGOŚCIOWEJ odcinków, nie suma ich długości.
 * Ręczny wpis potrafi nachodzić na zarejestrowany cykl (pilot dopisał lot, który
 * aplikacja też złapała), a wtedy dodanie długości policzyłoby te same minuty dwa razy:
 * mianownik rośnie, L/h spada, i znowu - nic tego nie widać. `projectSession` sumuje
 * oba źródła bez scalania (`blockTimeMs += …`), więc dla nakładających się wpisów
 * WYNIK TEGO MODUŁU JEST MNIEJSZY od `state.blockTimeMs`. To jest różnica zamierzona:
 * tam suma opisuje „ile czasu zaraportowano", tu miara opisuje „ile silnik pracował".
 */

import type { EpochMillis } from '../time';
import type { Event } from '../events';
import { applyCorrections, type SessionState } from '../projections';

/** Odcinek czasu; `to: null` = wciąż otwarty (cykl trwa, lot w powietrzu). */
export interface Span {
  from: EpochMillis;
  to: EpochMillis | null;
}

/** Odcinek domknięty - wynik przycięcia do okna. */
export interface ClosedSpan {
  from: EpochMillis;
  to: EpochMillis;
}

/**
 * Odcinki pracy silnika: cykle `engine_start`/`engine_stop` **oraz** ręczne
 * off-block/on-block z `manual_log_entry`.
 *
 * @param state projekcja policzona z TEGO SAMEGO strumienia co `events`.
 * @param events strumień sesji. Może być surowy albo już efektywny - korekty
 *   nakładamy tutaj, a `applyCorrections` na strumieniu bez korekt jest tożsamością,
 *   więc podwójne wywołanie niczego nie psuje. Bez tego kroku odcinek unieważniony
 *   korektą (`void` na wpisie ręcznym) dalej powiększałby mianownik.
 */
export function blockSpans(state: SessionState, events: readonly Event[]): Span[] {
  const spans: Span[] = state.legs.map((run) => ({
    from: run.startedAt,
    to: run.stoppedAt,
  }));

  for (const event of applyCorrections(events)) {
    if (event.type !== 'manual_log_entry') continue;
    const { offBlock, onBlock } = event.payload;
    // Wpis niepełny (sam start bez końca) nie wyznacza odcinka - pilot uzupełni go
    // korektą albo drugim wpisem. Zgadywanie końca zmyśliłoby czas pracy silnika.
    if (offBlock == null || onBlock == null) continue;
    if (onBlock <= offBlock) continue;
    spans.push({ from: offBlock, to: onBlock });
  }

  return spans;
}

/**
 * Odcinki lotu (takeoff → landing). Bierzemy je z projekcji, a nie ze strumienia,
 * bo to ona rozstrzyga, który `takeoff` otwiera lot (drugi start w powietrzu podbija
 * licznik, ale nie otwiera drugiego lotu) - i obejmuje też loty z wpisu ręcznego.
 */
export function flightSpans(state: SessionState): Span[] {
  return state.flights.map((flight) => ({ from: flight.takeoffAt, to: flight.landingAt }));
}

/**
 * Scala odcinki nakładające się i stykające w rozłączną rodzinę, posortowaną rosnąco.
 * Wejście może być w dowolnej kolejności; wejście puste daje wynik pusty.
 */
export function mergeSpans(spans: readonly ClosedSpan[]): ClosedSpan[] {
  const sorted = [...spans].filter((s) => s.to > s.from).sort((a, b) => a.from - b.from);
  const merged: ClosedSpan[] = [];

  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last != null && span.from <= last.to) {
      // Stykające się też scalamy (`<=`, nie `<`): odcinki 08:00–09:00 i 09:00–10:00
      // to dwie godziny ciągłej pracy, a nie dwa osobne zdarzenia.
      if (span.to > last.to) last.to = span.to;
    } else {
      merged.push({ from: span.from, to: span.to });
    }
  }

  return merged;
}

/**
 * Miara części odcinków wpadającej w okno `[since, until]` (ms).
 *
 * Odcinki PRZYCINAMY do okna zamiast filtrować po początku, bo okno interwału
 * paliwowego regularnie zaczyna się w środku cyklu (odczyt korygowany na postoju
 * między lotami). Odcinek otwarty (`to == null`) domykamy do `until` - dla bieżącego
 * cyklu znaczy to „licz do teraz".
 */
export function spanTimeInWindow(
  spans: readonly Span[],
  since: EpochMillis,
  until: EpochMillis,
): number {
  if (until <= since) return 0;

  const clipped: ClosedSpan[] = [];
  for (const span of spans) {
    const from = Math.max(span.from, since);
    const to = Math.min(span.to ?? until, until);
    if (to > from) clipped.push({ from, to });
  }

  let total = 0;
  for (const span of mergeSpans(clipped)) total += span.to - span.from;
  return total;
}
