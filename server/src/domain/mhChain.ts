/**
 * UZ Aero (serwer) — flagi łańcucha sesji samolotu (§4.5).
 *
 * Serwer porządkuje sesje samolotu NIE po czasie, tylko po liczniku MH — licznik jest
 * monotoniczny i fizyczny, a zegary telefonów bywają przestawione. Sesje ustawione po
 * `mh_start` tworzą łańcuch: koniec jednej powinien być początkiem następnej.
 *
 * Cztery anomalie, każda jako MIĘKKA flaga (§4.5 — serwer nigdy nie blokuje, flaguje
 * post factum):
 *  • `mh_gap`        — dziura: ktoś latał bez aplikacji albo odczyt startowy zawyżony;
 *  • `mh_regression` — cofnięcie: odczyt startowy niższy niż koniec poprzednika — złe
 *                      odczytanie licznika albo nakładające się dni;
 *  • `aircraft_overlap` — dwie NIEZAMKNIĘTE sesje jednego samolotu: przejęcie offline
 *                      (§4.4) — poprzednik ma niewysłane dane albo nie zdał maszyny.
 *                      Nakładka CZASU PILOTA jest osobnym zjawiskiem i mieszka
 *                      w `pilotOverlap.ts` (rozdzielenie 2026-08-07, §4.7);
 *  • `fuel_mismatch` — stan paliwa na starcie nie zgadza się z przekazaniem od
 *                      poprzednika (dodane 2026-07-31, patrz niżej).
 *
 * **Dlaczego paliwo mieszka w pliku o motogodzinach.** Bo to ten SAM łańcuch: te same
 * ogniwa, to samo uporządkowanie po liczniku i ta sama sąsiedniość par. Osobny moduł
 * musiałby powtórzyć sortowanie i parowanie, a rozjazd między dwiema kopiami tej samej
 * pętli byłby kwestią czasu. Porządek nadaje MH, ale porównywać wzdłuż niego można
 * dowolną wielkość przekazywaną z dnia na dzień.
 *
 * Czysta funkcja: wejściem są ogniwa, wyjściem wykryte flagi. Zapis, dedupe i cykl
 * życia flag należą do warstwy aplikacji.
 */

import { MH_TOLERANCE_H, fuelToleranceL, type FlagType } from '@uzaero/domain';

export interface ChainLink {
  sessionUuid: string;
  /** Odczyt startowy MH (z preflight); null = sesja jeszcze bez odczytu. */
  mhStart: number | null;
  /** Odczyt końcowy MH (z day_close); null = dzień niezamknięty. */
  mhEnd: number | null;
  /** Stan paliwa na starcie dnia (z preflight); null = brak odczytu. */
  fuelStartL: number | null;
  /** Stan paliwa przekazany na koniec dnia (z day_close); null = dzień niezamknięty. */
  fuelEndL: number | null;
  closed: boolean;
}

/**
 * Kandydat na flagę wykryty w łańcuchu — węższy niż katalog domeny, bo ten detektor
 * produkuje dokładnie cztery typy. `Extract` wiąże go z `FlagType`: przemianowanie
 * którejkolwiek pozycji w katalogu wywala kompilację tutaj, zamiast zostawić martwy
 * literał, który nigdy się nie dopasuje.
 */
export interface ChainFlag {
  type: Extract<FlagType, 'mh_gap' | 'mh_regression' | 'aircraft_overlap' | 'fuel_mismatch'>;
  sessionUuids: string[];
  details: Record<string, number | string>;
}

/**
 * Tolerancja zgodności ogniw — WSPÓLNA z aplikacją (`MH_TOLERANCE_H`, §4.5).
 *
 * Audyt wyłapał forka (0.05 tu vs 0.1 w domenie): delta 0.06–0.1 h przechodziła
 * na telefonie bez ostrzeżenia, a serwer ją flagował — dokładnie ten rozjazd
 * klient/serwer, przed którym broni monorepo. Jeden próg, jedno źródło.
 */
export const CHAIN_TOLERANCE_H = MH_TOLERANCE_H;

/**
 * @param capacityL pojemność zbiorników samolotu — wchodzi w tolerancję paliwa
 *   (`max(10 L, 5% pojemności)`, §4.5). `null` = konfiguracja nieznana, wtedy
 *   `fuelToleranceL` schodzi do wartości stałej.
 */
export function chainFlags(
  links: readonly ChainLink[],
  capacityL: number | null = null,
): ChainFlag[] {
  const flags: ChainFlag[] = [];

  // Nakładka: więcej niż jedna sesja bez `day_close` na jednym samolocie.
  const open = links.filter((l) => !l.closed);
  if (open.length > 1) {
    flags.push({
      type: 'aircraft_overlap',
      sessionUuids: open.map((l) => l.sessionUuid).sort(),
      details: { openSessions: open.length },
    });
  }

  // Łańcuch budujemy z sesji z odczytem startowym, w porządku licznika.
  const chain = links
    .filter((l): l is ChainLink & { mhStart: number } => l.mhStart != null)
    .sort((a, b) => a.mhStart - b.mhStart);

  const fuelTolerance = fuelToleranceL(capacityL);

  for (let i = 1; i < chain.length; i += 1) {
    const prev = chain[i - 1]!;
    const next = chain[i]!;

    // Motogodziny. Bez końca poprzednika nie ma czego porównywać — nakładkę łapie
    // warunek wyżej.
    if (prev.mhEnd != null) {
      const delta = next.mhStart - prev.mhEnd;
      if (delta > CHAIN_TOLERANCE_H) {
        flags.push({
          type: 'mh_gap',
          sessionUuids: [prev.sessionUuid, next.sessionUuid],
          details: { gapH: round2(delta), prevEnd: prev.mhEnd, nextStart: next.mhStart },
        });
      } else if (delta < -CHAIN_TOLERANCE_H) {
        flags.push({
          type: 'mh_regression',
          sessionUuids: [prev.sessionUuid, next.sessionUuid],
          details: { regressionH: round2(-delta), prevEnd: prev.mhEnd, nextStart: next.mhStart },
        });
      }
    }

    // Paliwo. Porównujemy WARTOŚĆ BEZWZGLĘDNĄ różnicy, bo podejrzane są obie strony:
    // wzrost znaczy tankowanie poza aplikacją, spadek — spuszczone paliwo albo błędny
    // odczyt. Paliwomierz jest nieprecyzyjny, stąd tolerancja szersza niż przy MH
    // i zależna od pojemności zbiorników.
    if (prev.fuelEndL != null && next.fuelStartL != null) {
      const diff = next.fuelStartL - prev.fuelEndL;
      if (Math.abs(diff) > fuelTolerance) {
        flags.push({
          type: 'fuel_mismatch',
          sessionUuids: [prev.sessionUuid, next.sessionUuid],
          details: {
            diffL: round1(diff),
            handoverL: prev.fuelEndL,
            readingL: next.fuelStartL,
            toleranceL: round1(fuelTolerance),
          },
        });
      }
    }
  }

  return flags;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
/** Litry z jednym miejscem — paliwomierz i tak nie jest precyzyjniejszy. */
const round1 = (n: number): number => Math.round(n * 10) / 10;
