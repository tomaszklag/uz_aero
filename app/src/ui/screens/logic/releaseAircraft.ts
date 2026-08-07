/**
 * UZ Aero — model widoku ekranu 09B/09C „Zdaj samolot"
 * (`design/09b-zdaj-samolot.html`, `design/09c-zdaj-bez-lotu.html`, §3.6).
 *
 * Ekran kończy pracę z JEDNĄ maszyną — i to jest jedyne miejsce w nowym flow, w którym
 * odczyt liczników jest **WYMAGANY**: staje się przekazaniem dla następnego pilota
 * i ogniwem łańcucha MH (§4.5). Zdanie samolotu **nie kończy dnia pilota** (§3.6a),
 * więc `dutyEnd` nie ma tu czego szukać.
 *
 * Moduł odpowiada na cztery pytania, których widok nie ma prawa rozstrzygać sam:
 *
 *  1. **KTÓRY wariant** — sesja bez ani jednego wzlotu to 09C (silnik nie ruszył:
 *     nie ma czasów do potwierdzenia ani zużycia do rozliczenia), z wzlotami to 09B.
 *  2. **CO WPISAĆ NA START** — ostatni znany odczyt paliwomierza i licznika. To jest
 *     PODPOWIEDŹ, nie prawda: `null` znaczy „nie wiemy" i wtedy pilot musi zejść
 *     do licznika, bo bez odczytu nie ma przekazania.
 *  3. **CO POKAZUJE ROZLICZENIE** — bilans sesji liczony z rejestru i z wartości, którą
 *     pilot właśnie wpisuje (`consumedL` domknie się dopiero zdarzeniem `day_close`,
 *     więc projekcja jeszcze go nie zna).
 *  4. **CO BLOKUJE ZAPIS** — brak odczytu, cofnięty licznik i brak powodu na 09C;
 *     każde z podanym powodem, nigdy cichy błąd (§6 pkt 3).
 *
 * Czysta funkcja: bez React, bez zegara (chwilę „teraz" podaje wołający).
 */

import { lastKnownMh } from '../../../domain';
import type {
  ConsumptionNorm,
  EpochMillis,
  MhFormat,
  NoFlightReason,
  SessionState,
} from '../../../domain';
import { duration, litres, motoHours, timeUtc } from '../../format';
import { normBandLabel } from './fuelNorm';

/**
 * Odczyt w trakcie wpisywania. `null` znaczy „nie wiem" — nigdy „zero litrów"
 * ani „licznik na zerze"; dlatego pola są nullowalne, a nie wyzerowane.
 */
export interface DraftReading {
  fuelL: number | null;
  mh: number | null;
}

/** Pasek wyniku sesji (09B) — liczby POLICZONE, pilot ich nie wpisuje. */
export interface ReleaseSummaryVm {
  legs: string;
  blockLabel: string;
  flightLabel: string;
  /** Godzina przejęcia („13:35"); „—", gdy strumień nie niesie `session_claim`. */
  heldAt: string;
}

/** Wiersz rozliczenia sesji („Paliwo start / koniec" → „96 L → 62 L"). */
export interface BalanceRowVm {
  key: string;
  value: string;
  /** Wiersze paliwowe idą bursztynem — tak jak w mockupie. */
  amber: boolean;
}

export interface ReleaseVm {
  aircraftId: string;
  /** 09C: sesja bez ani jednego wzlotu — silnik ani razu nie ruszył. */
  withoutLeg: boolean;
  summary: ReleaseSummaryVm;
  /** „Trzymany 09:10 → 10:25 · 1:15" (09C); `null` bez zdarzenia przejęcia. */
  heldLabel: string | null;
  /** Wartości startowe pól odczytu — najlepsze, co wiemy z rejestru. */
  initial: DraftReading;
  mhFormat: MhFormat;
}

/**
 * Buduje model ekranu zdania samolotu.
 *
 * @returns `null`, gdy pilot nie trzyma żadnej maszyny — wtedy ekran nie ma czego
 *          zdawać, a nie ma pokazywać pustego formularza.
 */
export function buildRelease(state: SessionState, now: EpochMillis): ReleaseVm | null {
  if (state.sessionUuid == null || state.aircraftId == null) return null;

  const claimedAt = state.claimedAt;

  return {
    aircraftId: state.aircraftId,
    withoutLeg: state.legs.length === 0,
    summary: {
      legs: `${state.legs.length}`,
      blockLabel: duration(state.blockTimeMs),
      flightLabel: duration(state.flightTimeMs),
      heldAt: claimedAt != null ? timeUtc(claimedAt) : '—',
    },
    // 09C nie ma czasów wzlotu, więc jedyną miarą tej sesji jest to, JAK DŁUGO samolot
    // był zajęty — administrator zobaczy w rejestrze, że stał zablokowany i dlaczego.
    heldLabel:
      claimedAt != null
        ? `Trzymany ${timeUtc(claimedAt)} → ${timeUtc(now)} · ${duration(now - claimedAt)}`
        : null,
    initial: { fuelL: state.fuel.lastReadingL, mh: lastKnownMh(state)?.value ?? null },
    mhFormat: state.mhFormat ?? 'decimal',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Podpowiedzi pod polami odczytu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Podpis pod paliwem: „przy przejęciu 96 L · bez tankowania · zużyte 34 L".
 *
 * Zużycie liczymy z wartości WPISYWANEJ, bo `fuel.consumedL` w projekcji domknie się
 * dopiero zdarzeniem `day_close` — czyli po tym, jak pilot ten przycisk naciśnie.
 */
export function finalFuelHint(state: SessionState, fuelL: number | null): string {
  const used = consumedL(state, fuelL);

  return [
    state.fuel.startL != null
      ? `przy przejęciu ${litres(state.fuel.startL)}`
      : 'brak odczytu przy przejęciu',
    state.fuel.addedL > 0 ? `dolane ${litres(state.fuel.addedL)}` : 'bez tankowania',
    used == null
      ? null
      : used >= 0
        ? `zużyte ${litres(used)}`
        : // Paliwa nie przybywa samo: albo ktoś tankował poza aplikacją, albo odczyt
          // jest z innego zbiornika. Mówimy to wprost, zamiast pokazać ujemne zużycie.
          `przybyło ${litres(-used)} — sprawdź odczyt`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Podpis pod motogodzinami: „format hh:mm · przy przejęciu 1 239:39 · Δ +1:30 · blok 1:30".
 *
 * Mockup pisze w tym miejscu „Δ +1:30 (= blok)". Wypisujemy OBIE liczby zamiast twierdzić,
 * że są równe: inwariant §4.5 (Δ MH = czas blokowy) ma być tu sprawdzalny gołym okiem,
 * a nie zadeklarowany — bo jeżeli akurat się nie zgadza, to jest właśnie ta chwila,
 * w której pilot ma to zobaczyć.
 */
export function finalMhHint(state: SessionState, mh: number | null): string {
  const format = state.mhFormat ?? 'decimal';
  const parts = [`format ${format === 'hhmm' ? 'hh:mm' : 'dziesiętny'}`];

  if (state.mh.start == null) {
    parts.push('brak odczytu przy przejęciu — wpisz z licznika');
    return parts.join(' · ');
  }

  parts.push(`przy przejęciu ${motoHours(state.mh.start, format)}`);
  if (mh != null) {
    parts.push(`Δ ${signed(mh - state.mh.start, format)}`, `blok ${duration(state.blockTimeMs)}`);
  }
  return parts.join(' · ');
}

/**
 * Treść banera pouczającego: co się stanie z tymi dwiema liczbami.
 *
 * To jedyne zdanie na ekranie, które tłumaczy, DLACZEGO odczyt jest tu wymagany —
 * i dlatego wypisuje wartości, a nie mówi ogólnikami o „przekazaniu".
 */
export function handoverText(
  aircraftId: string,
  reading: DraftReading,
  format: MhFormat,
): string {
  const head =
    reading.fuelL != null && reading.mh != null
      ? `Te odczyty — ${litres(reading.fuelL)} i ${motoHours(reading.mh, format)} MH — zobaczy`
      : 'Odczyty z tego ekranu zobaczy';

  return (
    `${head} następny pilot jako PRZEKAZANIE. Stają się ogniwem łańcucha ${aircraftId}: ` +
    'serwer porówna z nimi start kolejnej sesji i oznaczy dziury albo cofnięcia licznika.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rozliczenie sesji
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wiersze karty „Rozliczenie tego samolotu" (09B).
 *
 * `norma` przychodzi z serwera policzona (analityka A10a) — ten moduł jej nie liczy,
 * dokłada tylko pasmo obok dzisiejszego wyniku. Bez normy wiersz pokazuje sam wynik:
 * brak podpowiedzi jest lepszy od podpowiedzi wziętej z sufitu (`fuelNorm.ts`).
 */
export function balanceRows(
  state: SessionState,
  reading: DraftReading,
  norm: ConsumptionNorm | null,
): BalanceRowVm[] {
  const format = state.mhFormat ?? 'decimal';
  const rows: BalanceRowVm[] = [];

  const first = state.legs[0];
  const last = state.legs[state.legs.length - 1];
  if (first != null && last != null) {
    rows.push({
      key: 'Wzloty',
      value: `${state.legs.length} · ${timeUtc(first.startedAt)} → ${
        last.stoppedAt != null ? timeUtc(last.stoppedAt) : 'trwa'
      }`,
      amber: false,
    });
  }

  rows.push({
    key: 'Paliwo start / koniec',
    value: `${litres(state.fuel.startL)} → ${litres(reading.fuelL)}`,
    amber: true,
  });

  rows.push({ key: 'Średnie zużycie', value: burnLabel(state, reading, norm), amber: true });

  rows.push({
    key: 'Motogodziny Δ',
    value:
      state.mh.start != null && reading.mh != null
        ? signed(reading.mh - state.mh.start, format)
        : '—',
    amber: false,
  });

  return rows;
}

/**
 * Zużycie sesji (L) = start + dolane − koniec, dokładnie tak, jak liczy je projekcja
 * po `day_close`. `null` = nie ma z czego policzyć; zero jest wynikiem, `null` nie jest.
 */
export function consumedL(state: SessionState, fuelL: number | null): number | null {
  if (state.fuel.startL == null || fuelL == null) return null;
  return state.fuel.startL + state.fuel.addedL - fuelL;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blokada zapisu
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Powód, dla którego zdania nie da się jeszcze zapisać; `null` = można zapisywać.
 *
 * Wymóg odczytu jest tu SEDNEM ekranu (§3.6), a nie walidacją formularza: bez FOB i MH
 * następny pilot nie wie, z czym startuje. Cofnięty licznik odrzuciłyby i tak reguły
 * domeny (§3.4) — uprzedzamy o nim, zamiast pozwolić komendzie odmówić po fakcie.
 */
export function releaseBlocker(
  state: SessionState,
  reading: DraftReading,
  reason: NoFlightReason | null = null,
): string | null {
  // Powód jest JEDYNYM pytaniem wariantu 09C i dlatego blokuje zapis, choć domena
  // przyjęłaby zdarzenie bez niego (miękka flaga `NO_FLIGHT_WITHOUT_REASON`). Pilot stoi
  // przy samolocie i odpowie w sekundę — administrator odczytujący rejestr tydzień
  // później już nie ma kogo zapytać.
  if (state.legs.length === 0 && reason == null) {
    return 'Wybierz powód — dlaczego samolot nie poleciał.';
  }
  if (reading.fuelL == null) {
    return 'Odczytaj paliwomierz — ten odczyt jest przekazaniem dla następnego pilota.';
  }
  if (reading.mh == null) {
    return 'Odczytaj licznik motogodzin — bez niego łańcuch MH ma dziurę.';
  }
  return mhRegressionWarning(state, reading.mh);
}

/**
 * Ostrzeżenie o cofniętym liczniku — `null`, gdy odczyt jest w porządku.
 *
 * Progu NIE liczymy tu sami: `lastKnownMh` jest tą samą funkcją, którą reguła domeny
 * odrzuca zapis. Własna kopia porównania znaczyłaby, że arkusz mówi „w porządku" chwilę
 * przed tym, jak komenda odmawia — a to wygląda jak błąd aplikacji, nie jak literówka.
 */
export function mhRegressionWarning(state: SessionState, mh: number | null): string | null {
  const previous = lastKnownMh(state);
  if (mh == null || previous == null || mh >= previous.value) return null;

  const format = state.mhFormat ?? 'decimal';
  return `Licznik nie może się cofnąć — ${previous.since} ${motoHours(previous.value, format)}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pomocnicze
// ─────────────────────────────────────────────────────────────────────────────


/** „22,7 L/h · norma 20–24 L/h" albo „—", gdy nie ma z czego liczyć. */
function burnLabel(
  state: SessionState,
  reading: DraftReading,
  norm: ConsumptionNorm | null,
): string {
  const used = consumedL(state, reading.fuelL);
  // Dzielenie przez zero nie jest statystyką — sesja bez czasu blokowego nie ma średniej.
  if (used == null || state.blockTimeMs <= 0) return '—';

  // Jedno miejsce po przecinku i przecinek dziesiętny — jak w mockupie 09B. Ekran 10
  // zaokrągla do pełnych litrów, bo tam średnia jest podsumowaniem, a tu punktem
  // odniesienia dla pasma normy, które ma szerokość kilku litrów.
  const rate = `${(used / (state.blockTimeMs / 3_600_000)).toFixed(1).replace('.', ',')} L/h`;
  const band = normBandLabel(norm);
  return band != null ? `${rate} · norma ${band}` : rate;
}

/** „+1:30" / „−0:12" — znak typograficzny, jak w pozostałych odczytach. */
function signed(deltaH: number, format: MhFormat): string {
  return `${deltaH < 0 ? '−' : '+'}${motoHours(Math.abs(deltaH), format)}`;
}
