/**
 * UZ Aero (serwer) — flagi łańcucha motogodzin (§4.5).
 *
 * Serwer porządkuje sesje samolotu NIE po czasie, tylko po liczniku MH — licznik jest
 * monotoniczny i fizyczny, a zegary telefonów bywają przestawione. Sesje ustawione po
 * `mh_start` tworzą łańcuch: koniec jednej powinien być początkiem następnej.
 *
 * Trzy anomalie, każda jako MIĘKKA flaga (§4.5 — serwer nigdy nie blokuje, flaguje
 * post factum):
 *  • `mh_gap`        — dziura: ktoś latał bez aplikacji albo odczyt startowy zawyżony;
 *  • `mh_regression` — cofnięcie: odczyt startowy niższy niż koniec poprzednika — złe
 *                      odczytanie licznika albo nakładające się dni;
 *  • `session_overlap` — dwie NIEZAMKNIĘTE sesje jednego samolotu: przejęcie offline
 *                      (§4.4) — poprzednik ma niewysłane dane albo nie zamknął dnia.
 *
 * Czysta funkcja: wejściem są ogniwa, wyjściem wykryte flagi. Zapis, dedupe i cykl
 * życia flag należą do warstwy aplikacji.
 */

export interface ChainLink {
  sessionUuid: string;
  /** Odczyt startowy MH (z preflight); null = sesja jeszcze bez odczytu. */
  mhStart: number | null;
  /** Odczyt końcowy MH (z day_close); null = dzień niezamknięty. */
  mhEnd: number | null;
  closed: boolean;
}

export interface ChainFlag {
  type: 'mh_gap' | 'mh_regression' | 'session_overlap';
  sessionUuids: string[];
  details: Record<string, number | string>;
}

/**
 * Tolerancja zgodności ogniw (h). Licznik analogowy czyta się z dokładnością ~0,05 h
 * (3 min); flagowanie różnic mniejszych produkowałoby szum, który nauczy wszystkich
 * ignorować flagi w ogóle.
 */
export const CHAIN_TOLERANCE_H = 0.05;

export function chainFlags(links: readonly ChainLink[]): ChainFlag[] {
  const flags: ChainFlag[] = [];

  // Nakładka: więcej niż jedna sesja bez `day_close` na jednym samolocie.
  const open = links.filter((l) => !l.closed);
  if (open.length > 1) {
    flags.push({
      type: 'session_overlap',
      sessionUuids: open.map((l) => l.sessionUuid).sort(),
      details: { openSessions: open.length },
    });
  }

  // Łańcuch budujemy z sesji z odczytem startowym, w porządku licznika.
  const chain = links
    .filter((l): l is ChainLink & { mhStart: number } => l.mhStart != null)
    .sort((a, b) => a.mhStart - b.mhStart);

  for (let i = 1; i < chain.length; i += 1) {
    const prev = chain[i - 1]!;
    const next = chain[i]!;
    // Bez końca poprzednika nie ma czego porównywać — nakładkę łapie warunek wyżej.
    if (prev.mhEnd == null) continue;

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

  return flags;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
