/**
 * UZ Aero - SYGNATURA OPERACJI LOTNICZEJ (issue #68).
 *
 * ══ PO CO ══
 * Operacja miała dotąd jedną nazwę: uuid. Nadaje się on do adresowania (klucz w bazie,
 * ścieżka w panelu, cel korekty) i nie nadaje się do NICZEGO INNEGO - `7c1e5a9b-…-83b4`
 * nie da się przeczytać przez telefon administratorowi, wpisać w zgłoszenie ani znaleźć
 * wzrokiem na liście. Sygnatura odpowiada na to samo pytanie faktami, które człowiek
 * i tak zna:
 *
 *     SP-AXA/2026-09-01/AKO/1
 *     └ znak  └ doba     └ PIC └ która operacja tego pilota w tej dobie
 *
 * ══ LICZY SIĘ, NIE ZAPISUJE ══
 * Sygnatura jest PROJEKCJĄ - składamy ją z rejestru przy każdym wyświetleniu, tak jak
 * czas blokowy czy liczbę lotów. Druga kopia na drucie (pole w `session_claim`) byłaby
 * pierwszym miejscem, w którym ktoś policzy ją inaczej: wpis ręczny dopisany PRZED
 * istniejącą operacją tej samej doby przenumerowuje ją, a zapisany numer zostałby
 * nieaktualny i zacząłby wskazywać dwie operacje naraz.
 *
 * ══ SKŁADNIKI I DLACZEGO TAKIE ══
 *  • **znak na kadłubie**, nie identyfikator maszyny - identyfikator jest uuid-em,
 *    czyli dokładnie tym, co ta sygnatura zastępuje;
 *  • **doba URUCHOMIENIA SILNIKA** - ta sama kotwica, którą dobę liczy `projectPilotDay`,
 *    więc operacja spod północy ma w sygnaturze tę dobę, w której stoi na liście;
 *  • **kod PIC** - operacja należy do pilota dowodzącego. On też jest jedynym piszącym
 *    (§4.1), więc numer porządkowy da się policzyć na jego telefonie, bez sieci;
 *  • **numer w dobie pilota** - dokładnie ten sam, który ekran 01 pisze jako
 *    „OPERACJA n" (`PilotDaySession.index`). Dwa numery na jednym kafelku byłyby
 *    sprzecznością, więc reguła jest JEDNA i mieszka tutaj.
 *
 * ══ CZASU W SYGNATURZE NIE MA I TO JEST DECYZJA ══
 * Godzina uruchomienia rozróżniałaby operacje równie dobrze, ale sygnatura ma być
 * STAŁA: korekta czasu (issue #43) przesuwa uruchomienie o kilka minut i sygnatura
 * z godziną opisywałaby po niej inną operację niż przed. Numer porządkowy przeżywa
 * korektę, dopóki nie zmienia kolejności operacji w dobie.
 *
 * ══ NUMER DOSTAJE OPERACJA Z TREŚCIĄ (issue #75 rozszerza #68) ══
 * Do issue #75 numerowały się wyłącznie biegi silnika. Odtąd numer (i sygnaturę)
 * dostaje też zapis bez biegu, w którym COŚ SIĘ ZMIENIŁO - odczyt paliwa albo licznika
 * MH różni się od przejęcia, była dolewka (`operationSubstance.ts`). Kotwicą jest
 * wtedy przejęcie (`claimedAt`), a decyzja zapada dopiero przy ZDANIU - pełna reguła
 * i jej uzasadnienie przy `operationAnchor`.
 *
 * Zapis bez biegu i bez treści numeru nadal NIE MA: pusty (odczyty z obu stron równe)
 * jest ukrywany w całości, a niekompletny pokazuje się w historii z kreską - maszyna,
 * doba i pilot opisują go dalej. Granica jest ta sama, którą rysuje `projectPilotDay`,
 * bo numer sygnatury MUSI być numerem z ekranu 01.
 */

import type { EpochMillis } from './time';
import type { SessionState } from './projections/session';
import { operationAnchor } from './operationSubstance';
import { utcDayStart } from './projections/pilotDay';

/**
 * Separator członów. Ukośnik, bo znak rejestracyjny nosi już myślnik („SP-AXA"),
 * a sygnatura ma dać się przeczytać na głos bez pytania „który to myślnik".
 */
export const OPERATION_SIGNATURE_SEPARATOR = '/';

/** Fakty, z których składa się sygnatura. `null` w którymkolwiek = nie ma jej z czego złożyć. */
export interface OperationSignatureParts {
  /** Znak na kadłubie („SP-AXA"); `null` = cache floty go nie zna. */
  reg: string | null;
  /** Uruchomienie silnika - z niego bierze się DOBA operacji. */
  startedAt: EpochMillis | null;
  /** Kod pilota dowodzącego („AKO"). */
  picCode: string | null;
  /** Numer operacji w dobie pilota (1-based) - `operationIndexes`. */
  index: number | null;
}

/** Doba operacji jako `YYYY-MM-DD` (UTC) - drugi człon sygnatury. */
export function operationDate(t: EpochMillis): string {
  const d = new Date(t);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Składa sygnaturę albo oddaje `null`, gdy brakuje któregokolwiek członu.
 *
 * Sygnatura niekompletna („SP-AXA/2026-09-01/-/1") byłaby gorsza od jej braku: wygląda
 * jak identyfikator, a nie identyfikuje - dwie operacje różnych pilotów dostałyby ten
 * sam napis. Kreskę stawia dopiero EKRAN, tam gdzie wie, ile ma na nią miejsca.
 */
export function operationSignature(parts: OperationSignatureParts): string | null {
  const { reg, startedAt, picCode, index } = parts;
  if (reg == null || reg === '') return null;
  if (startedAt == null) return null;
  if (picCode == null || picCode === '') return null;
  if (index == null) return null;

  return [reg.toUpperCase(), operationDate(startedAt), picCode.toUpperCase(), String(index)].join(
    OPERATION_SIGNATURE_SEPARATOR,
  );
}

/**
 * Numery operacji w dobach pilota: `sessionUuid` → numer 1-based.
 *
 * REGUŁA JEST TA SAMA, CO W `projectPilotDay` i musi taka zostać - to ten sam numer
 * widziany z dwóch stron (kafelek 01 pisze go słowem, sygnatura cyfrą). Stąd te same
 * trzy warunki: liczy się operacje TEGO pilota, nieunieważnione, z KOTWICĄ
 * (`operationAnchor`: uruchomienie silnika, a bez biegu - przejęcie zapisu zdanego
 * z treścią, issue #75); doba i kolejność biorą się z kotwicy.
 *
 * Rozstrzygnięcie remisu po `sessionUuid` jest dodatkiem wobec projekcji (tam remis
 * rozstrzyga stabilność sortowania) i istnieje dla SERWERA: numer musi wyjść identyczny
 * z zapytania SQL, a tam kolejności wstawiania nie ma. Dwie kotwice jednego pilota
 * w tej samej milisekundzie to stan niemożliwy - chodzi o determinizm, nie o realny remis.
 *
 * Liczy WSZYSTKIE doby naraz, bo wołający (ekran 12, hook sygnatur) i tak trzyma cały
 * lokalny strumień, a numer jednej operacji nie da się policzyć bez jej sąsiadów.
 */
export function operationIndexes(
  sessions: readonly SessionState[],
  picId: string,
): Map<string, number> {
  const byDay = new Map<number, { uuid: string; startedAt: EpochMillis }[]>();

  for (const session of sessions) {
    const uuid = session.sessionUuid;
    const startedAt = operationAnchor(session);
    if (uuid == null || startedAt == null) continue;
    if (session.voided || session.sessionPicId !== picId) continue;

    const day = utcDayStart(startedAt);
    const sameDay = byDay.get(day);
    if (sameDay == null) byDay.set(day, [{ uuid, startedAt }]);
    else sameDay.push({ uuid, startedAt });
  }

  const indexes = new Map<string, number>();
  for (const day of byDay.values()) {
    day.sort((a, b) => a.startedAt - b.startedAt || (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0));
    day.forEach((operation, i) => indexes.set(operation.uuid, i + 1));
  }
  return indexes;
}
