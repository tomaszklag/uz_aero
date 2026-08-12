/**
 * UZ Aero — projekcja JEDNEGO LOTU → treść ekranu 16 (mockupy `design/16-lot.html`
 * i `16a-lot-bez-sladu.html`).
 *
 * Ekran powstał z issue #25: ślad przestał być skrótem z listy lotów, a stał się jednym
 * z detali LOTU. Kolejność jest odtąd jedna — rozliczenie sesji (10) → lot (16) → ślad (14)
 * — i wynika z modelu, a nie z wygody: sesja z trzema lotami nie ma „swojego" śladu, więc
 * skrót z listy musiał zgadywać, o który lot chodzi.
 *
 * Moduł jest czysty (bez React Native), bo to jedyna nietrywialna logika tego ekranu —
 * ten sam powód, dla którego osobno stoją `statsDay.ts` i `cockpitLog.ts`.
 *
 * Czego tu NIE MA: czasu blokowego, paliwa i motogodzin. To wielkości SESJI (jeden bieg
 * silnika, model 2026-08-10) i mieszkają na 10; powtórzone przy locie sugerowałyby, że
 * pojedynczy lot ma własny licznik motogodzin.
 */

import { applyCorrections, isSameFieldOperation } from '../../../domain';
import type {
  DetectionMethod,
  Event,
  EventOf,
  Flight,
  FlightTrack,
  JumperCounts,
  OperationType,
} from '../../../domain';
import type { MissingTrackReason } from '../../../application';
import type { StatCell } from '../../components';
import { dateUtcDayMonth, plural, timeUtc } from '../../format';
import { operationLabel, operationTag } from './operations';
import { dateTimeUtcShort, hhmm, jumperBreakdown } from './statsDay';

/** Czas zdarzenia: GPS ma pierwszeństwo przed zegarem telefonu (§5.1, dwa zegary). */
const at = (e: Event): number => e.gpsTime ?? e.deviceTime;

/** Tytuł nagłówka: „LOT 3" — numer lotu w sesji, ten sam co w tabeli na 10. */
export function flightTitle(index: number): string {
  return `LOT ${index}`;
}

/**
 * Podtytuł: „SP-AXA · 06 SIE · SKOKI".
 *
 * Bez godzin — te stoją w karcie czasów o dwa palce niżej, a w nagłówku byłyby trzecim
 * napisem walczącym o tę samą linię. Brakujące części po prostu wypadają.
 */
export function flightSubtitle(
  aircraftId: string | null,
  takeoffAt: number,
  operation: OperationType | null,
): string {
  return [
    aircraftId,
    dateUtcDayMonth(takeoffAt),
    operation != null ? operationTag(operation) : null,
  ]
    .filter((part): part is string => part != null && part !== '')
    .join(' · ');
}

/** Plakietka źródła danych: „AUTO" z detekcji, „RĘCZNIE" z wpisu pilota. */
export function methodTag(method: DetectionMethod): string {
  return method === 'auto' ? 'AUTO' : 'RĘCZNIE';
}

/**
 * Kafle czasów lotu (mockup 16, `.metric-grid`): start, lądowanie, czas i pozycja lotu
 * w sesji.
 *
 * Lot w powietrzu nie ma jeszcze lądowania ani czasu — piszemy „— —", a nie zero:
 * zero wyglądałoby jak lot, który trwał chwilę (§6 pkt 3, ta sama reguła co w 10a).
 */
export function flightTimeCells(flight: Flight, flightCount: number): StatCell[] {
  const landed = flight.landingAt != null;
  return [
    { label: 'Takeoff', value: timeUtc(flight.takeoffAt) },
    { label: 'Landing', value: landed ? timeUtc(flight.landingAt) : '— —' },
    { label: 'Czas lotu', value: landed ? hhmm(flight.durationMs) : '— —', tone: 'green' },
    {
      label: 'Numer lotu',
      value: String(flight.index),
      unit: `z ${flightCount} ${plural(flightCount, 'lotu', 'lotów', 'lotów')}`,
    },
  ];
}

/**
 * Kafle pod miniaturą śladu — ten sam zestaw liczb, co nagłówek pełnego śladu (14),
 * pomniejszony o czas lotu (stoi w karcie czasów wyżej).
 *
 * Powtórzenie jest celowe: wejście na 14 ma być POWIĘKSZENIEM tego, co pilot już
 * widzi, a nie pierwszym spotkaniem z liczbami.
 */
export function trackMetricCells(track: FlightTrack): StatCell[] {
  return [
    { label: 'Dystans', value: track.distanceNm.toFixed(1), unit: 'NM' },
    {
      label: 'Max wys.',
      value:
        track.maxAltitudeFt != null
          ? Math.round(track.maxAltitudeFt).toLocaleString('pl-PL')
          : '— —',
      unit: 'ft',
      tone: 'blue',
    },
    {
      label: 'Punkty',
      value: track.usableCount.toLocaleString('pl-PL'),
      unit: `z ${track.totalCount.toLocaleString('pl-PL')}`,
    },
  ];
}

/** Wiersz „klucz → wartość" w karcie szczegółów (mockup `.info-row`). */
export interface DetailRow {
  id: string;
  label: string;
  value: string;
}

/**
 * Zrzuty, które wydarzyły się W TYM LOCIE.
 *
 * Okno lotu domyka lądowanie; lot jeszcze otwarty (w powietrzu) bierze wszystko po
 * starcie. Czytamy strumień EFEKTYWNY (po korektach 04c) — dokładnie ten, który liczy
 * projekcja: zrzut unieważniony nie zaszedł, a przesunięty w czasie potrafi przenieść
 * się do sąsiedniego lotu i wtedy MA się przenieść także tutaj.
 *
 * Skład i wysokość są opcjonalne (issue #21: `null` = niepodany, nie zero), więc wiersz
 * składa się z tego, co faktycznie zapisano.
 */
export function dropRows(events: Event[], flight: Flight): DetailRow[] {
  const until = flight.landingAt ?? Number.POSITIVE_INFINITY;

  const drops = applyCorrections(events)
    .filter((e): e is EventOf<'drop'> => e.type === 'drop')
    .filter((e) => at(e) >= flight.takeoffAt && at(e) <= until)
    .sort((a, b) => at(a) - at(b));

  const rows: DetailRow[] = [];
  for (const drop of drops) {
    rows.push({
      id: drop.uuid,
      label: `Zrzut ${drop.payload.dropNumber} · ${timeUtc(at(drop))}`,
      value: dropSummary(drop.payload.jumpers, drop.payload.altitudeFt),
    });
    // Rozbicie na typy skoków tylko wtedy, gdy skład w ogóle zadeklarowano — pusty
    // wiersz „Skład: —" udawałby brakujące dane zamiast opcjonalnego pola.
    if (drop.payload.jumpers != null) {
      rows.push({
        id: `${drop.uuid}-mix`,
        label: 'Skład',
        value: jumperBreakdown(drop.payload.jumpers),
      });
    }
  }
  return rows;
}

/**
 * „4 skoczków · 12 800 ft"; przy braku obu liczb mówimy wprost, że ich nie ma.
 *
 * Obie liczby są w payloadzie OPCJONALNE — stąd `undefined` obok `null` w sygnaturze:
 * zrzut zapisany bez składu (issue #21) i zrzut bez fixa GPS to normalne dane, a nie
 * zdarzenie do naprawy.
 */
function dropSummary(
  jumpers: JumperCounts | null | undefined,
  altitudeFt: number | null | undefined,
): string {
  const parts: string[] = [];
  if (jumpers != null) {
    const total = jumpers.tandem + jumpers.aff + jumpers.solo;
    parts.push(`${total} skoczków`);
  }
  if (altitudeFt != null) parts.push(`${Math.round(altitudeFt).toLocaleString('pl-PL')} ft`);
  return parts.length > 0 ? parts.join(' · ') : 'zapisany bez liczb';
}

/**
 * Przypis pod lotniskiem: dlaczego przy skokach stoi JEDEN kod, a nie para (issue #13).
 * `null` dla operacji z trasą — tam para start → lądowanie jest oczywista.
 */
export function placeNote(operation: OperationType | null): string | null {
  if (operation == null || !isSameFieldOperation(operation)) return null;
  return `${operationLabel(operation).toLowerCase()} — start i lądowanie na tym samym placu`;
}

/** Napis w kafelku „bez śladu" (mockup 16A) — tytuł, powód i źródło danych lotu. */
export interface MissingTrackCopy {
  title: string;
  text: string;
  /** Wiersz „Źródło danych" pod kafelkiem. */
  source: string;
}

/**
 * Dwa powody braku śladu znaczą dla pilota co innego i ekran je rozróżnia: lot wpisany
 * ręcznie NIGDY śladu nie miał, a lot sprzed ponad 14 dni już go NIE MA. Bez tego
 * rozróżnienia pilot szukałby awarii tam, gdzie działa retencja.
 */
export function missingTrackCopy(reason: MissingTrackReason): MissingTrackCopy {
  if (reason === 'manual') {
    return {
      title: 'BEZ ZAPISU GPS',
      text:
        'Ten lot został wpisany ręcznie, więc nie ma z czego narysować trasy. Czasy poniżej ' +
        'są pełnoprawne — pochodzą z Twojego wpisu, nie z odbiornika.',
      source: 'wpis pilota',
    };
  }
  return {
    title: 'ŚLAD NIEDOSTĘPNY',
    text:
      'Dla tego lotu nie ma zapisu GPS. Ślad to materiał roboczy z retencją 14 dni — ' +
      'starsze loty mają komplet czasów i statystyk, ale trasy już nie.',
    source: 'zapis GPS wygasł albo nie dotarł',
  };
}

/**
 * Przypis pod przyciskiem korekty. Termin okna (24 h od ZDANIA samolotu, jedno na sesję —
 * issue #23) niesie baner na 10; tutaj wystarczy jedno zdanie, ale NIGDY samo „nie da się"
 * bez powiedzenia, co zamiast tego (§6 pkt 3).
 */
export function correctionNote(window: {
  confirmed: boolean;
  open: boolean;
  closesAt: number | null;
}): string {
  if (!window.confirmed) {
    return 'do zdania samolotu poprawiasz bez limitu · potem masz na to 24 h';
  }
  if (window.open && window.closesAt != null) {
    return `samodzielnie do ${dateTimeUtcShort(window.closesAt)} UTC · potem korektę nanosi administrator`;
  }
  return 'okno 24 h minęło · korektę nanosi administrator';
}
