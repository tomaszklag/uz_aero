/**
 * UZ Aero (serwer) — CIĄGŁOŚĆ PALIWA WOKÓŁ DANEJ CHWILI (issue #62, piąta tura).
 *
 * ══ PO CO ══
 * Wpis ręczny opisuje lot, który JUŻ się odbył — często kilka dni temu, na maszynie,
 * którą przed nim i po nim latał ktoś inny. Zgłoszenie z urządzenia: „jeśli podałem już
 * godziny i mam połączenie do API, to możemy pobrać poprzedzający i kolejny lot. Dzięki
 * temu możemy proponować ilość paliwa przed rozpoczęciem lotu… tak samo można podać
 * wartość, jaka powinna zostać w zbiorniku, bo już ktoś latał dalej i podał odczyt
 * w momencie przejęcia. Chodzi o to, aby była ciągłość w ilości paliwa".
 *
 * ══ DLACZEGO NIE WYSTARCZYŁO PRZEKAZANIE Z `/reference` ══
 * Bo `handover` to JEDEN punkt: ostatni znany stan maszyny. Odpowiada na pytanie „ile
 * jest teraz", a wpis ręczny pyta „ile było w czwartek o 09:42" — a między czwartkiem
 * a dziś maszyna zdążyła polatać. Dla wpisu bieżącego oba pytania mają tę samą
 * odpowiedź i dlatego brak tej trasy tak długo nie przeszkadzał.
 *
 * ══ CZEGO TU NIE MA ══
 * Werdyktu. Ta funkcja mówi, co wie rejestr — czy pilot ma się tym przejąć, rozstrzyga
 * telefon i rozstrzyga to OSTRZEŻENIEM, nigdy blokadą (issue #62: „nic nie może
 * blokować"). Serwer nie ma tu prawa głosu, bo pilot patrzy na paliwomierz, a paliwomierz
 * jest przyrządem fizycznym i to on ma rację (`CLAUDE.md`: liczniki fizyczne > serwer).
 *
 * Czysta funkcja na wierszach projekcji — bez SQL-a i bez zegara, żeby dała się
 * przetestować na tablicy.
 */

import type { SessionRow } from '../application/common/ports.ts';

/** Jeden koniec łańcucha: czyj odczyt, kiedy i jaki. */
export interface FuelChainLink {
  sessionUuid: string;
  picId: string;
  /** Kiedy padł ten odczyt (UTC) — zdanie samolotu albo jego przejęcie. */
  at: number;
  fuelL: number;
  mh: number;
}

/**
 * Sąsiedztwo w łańcuchu: co maszyna miała, gdy ktoś ją PRZED tą chwilą zdał,
 * i co miała, gdy ktoś ją PO niej przejął. Oba pola bywają `null` — i to jest
 * normalny stan, nie brak danych: pierwszy lot maszyny nie ma poprzednika,
 * a najnowszy nie ma następcy.
 */
export interface FuelChainNeighbours {
  before: FuelChainLink | null;
  after: FuelChainLink | null;
}

/**
 * Sąsiedzi danej chwili w historii JEDNEJ maszyny.
 *
 * `before` = ostatnia sesja ZAMKNIĘTA przed `at` — jej odczyt przy zdaniu jest tym,
 * co pilot powinien zastać w zbiorniku. `after` = pierwsza sesja przejęta po `at` —
 * jej odczyt przy przejęciu jest tym, co pilot powinien zostawić.
 *
 * SESJĘ WYKLUCZANĄ PODAJE WOŁAJĄCY (`exceptUuid`): przy poprawianiu istniejącego wpisu
 * jego własne odczyty nie mogą być dla niego punktem odniesienia — wyszłoby, że zgadza
 * się sam ze sobą.
 *
 * Bierzemy WYŁĄCZNIE sesje z kompletem odczytów: sesja bez `fuelEndL` nie mówi nic
 * o stanie zbiornika, a `0` udające odczyt byłoby gorsze od milczenia.
 */
export function fuelChainNeighbours(
  sessions: readonly SessionRow[],
  at: number,
  exceptUuid?: string,
): FuelChainNeighbours {
  const usable = sessions.filter((s) => s.sessionUuid !== exceptUuid);

  /*
   * PRZED: sesje zamknięte przed `at`, najpóźniejsza wygrywa. Kotwicą jest `closeTime`,
   * bo to chwila odczytu przy zdaniu — nie `claimTime`, który mówi tylko, kiedy tamten
   * pilot zaczynał.
   */
  const before = usable
    .filter(
      (s): s is SessionRow & { closeTime: number; fuelEndL: number; mhEnd: number } =>
        s.closeTime != null &&
        s.closeTime <= at &&
        s.fuelEndL != null &&
        s.mhEnd != null,
    )
    .sort((a, b) => a.closeTime - b.closeTime)
    .at(-1);

  /* PO: sesje przejęte po `at`, najwcześniejsza wygrywa. Tu kotwicą jest `claimTime` —
     chwila odczytu przy przejęciu. */
  const after = usable
    .filter(
      (s): s is SessionRow & { claimTime: number; fuelStartL: number; mhStart: number } =>
        s.claimTime != null &&
        s.claimTime >= at &&
        s.fuelStartL != null &&
        s.mhStart != null,
    )
    .sort((a, b) => a.claimTime - b.claimTime)
    .at(0);

  return {
    before:
      before != null
        ? {
            sessionUuid: before.sessionUuid,
            picId: before.picId,
            at: before.closeTime,
            fuelL: before.fuelEndL,
            mh: before.mhEnd,
          }
        : null,
    after:
      after != null
        ? {
            sessionUuid: after.sessionUuid,
            picId: after.picId,
            at: after.claimTime,
            fuelL: after.fuelStartL,
            mh: after.mhStart,
          }
        : null,
  };
}
