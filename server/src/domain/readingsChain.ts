/**
 * UZ Aero (serwer) — CIĄGŁOŚĆ ODCZYTÓW WOKÓŁ DANEJ CHWILI (issue #62, piąta i szósta tura).
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
 * ══ TRZY WIELKOŚCI, DWIE RÓŻNE OSIE ══
 * Paliwo i motogodziny czyta się przy PRZEJĘCIU i przy ZDANIU, więc mają po dwa końce
 * i jadą tą samą parą sąsiadów. **Olej NIE MA końca przy zdaniu** — bagnet tuż po locie
 * kłamie, więc pomiar żyje wyłącznie przy przejęciu, a interwał zużycia biegnie
 * pomiar→pomiar przez wiele sesji z kotwicą w liczniku (issue #60). Olej dostaje przez
 * to własne pole o kształcie `OilHandover`: KOTWICĘ i sumę dolewek od niej, a nie parę
 * „przed/po". To nie jest niekonsekwencja — to jest ta sama różnica, przez którą pomiar
 * oleju nie jest krokiem zdania samolotu.
 *
 * ══ CZEGO TU NIE MA ══
 * Werdyktu. Ta funkcja mówi, co wie rejestr — czy pilot ma się tym przejąć, rozstrzyga
 * telefon i rozstrzyga to OSTRZEŻENIEM, nigdy blokadą (issue #62: „nic nie może
 * blokować"). Serwer nie ma tu prawa głosu, bo pilot patrzy na paliwomierz i na bagnet,
 * a to są przyrządy fizyczne (`CLAUDE.md`: liczniki fizyczne > dane z serwera).
 *
 * Czysta funkcja na wierszach projekcji — bez SQL-a i bez zegara, żeby dała się
 * przetestować na tablicy.
 */

import type { OilHandover } from '@uzaero/domain';

import { latestOilHandover } from '../application/common/aircraftStateView.ts';
import type { SessionRow } from '../application/common/ports.ts';

/** Jeden koniec łańcucha: czyj odczyt, kiedy i jaki. */
export interface ReadingsChainLink {
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
export interface ReadingsChainNeighbours {
  before: ReadingsChainLink | null;
  after: ReadingsChainLink | null;
  /**
   * Ostatni POMIAR OLEJU nie później niż `at`, razem z sumą dolewek od niego (issue #60).
   * Ten sam kształt, co `Handover.oil` w `/reference` — bo to ta sama wielkość, tylko
   * pytana o przeszłą chwilę zamiast o „teraz". Ekran liczy z niej oczekiwanie tym
   * samym `oilPreflight.expectation()`, co na 02a.
   */
  oil: OilHandover | null;
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
export function readingsChainNeighbours(
  sessions: readonly SessionRow[],
  at: number,
  exceptUuid?: string,
): ReadingsChainNeighbours {
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
    /* Olej idzie WŁASNĄ osią (patrz nagłówek): kotwica to ostatni pomiar nie później
       niż `at`, a dolewki liczą się do tej samej granicy — te zapisane PÓŹNIEJ opisują
       stan, którego pilot wpisujący ten lot nie mógł zastać. Regułę wyboru kotwicy
       (licznik przed zegarem) trzyma `latestOilHandover`, więc jest jedna. */
    oil: latestOilHandover(usable, { asOf: at }),
  };
}
