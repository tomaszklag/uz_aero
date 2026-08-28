/**
 * UZ Aero — PALIWO JAKO SEKWENCJA (issue #62, piąta tura z urządzenia; krok 4, 15C).
 *
 * ══ CO BYŁO NIE TAK ══
 * Krok 4 pytał o paliwo trzema rozłącznymi polami: „Przed uruchomieniem", „Po locie"
 * i listą dolewek pomiędzy nimi — w tej kolejności na ekranie, choć dolewka wypada
 * w czasie MIĘDZY odczytami. Pilot widział trzy niezależne liczby i sam musiał złożyć
 * z nich zdanie „było 112, dolałem 48, zostało 84". Zgłoszenie z urządzenia brzmiało:
 * „to powinna być sekwencja jak w czasach, które wpisuję".
 *
 * ══ CO JEST TERAZ ══
 * Jeden ciąg w porządku czasu, tą samą osią, którą krok 3 rysuje bieg silnika,
 * a ekran rozliczenia całą sesję (`SessionAxis`, issue #44):
 *
 *     Przed uruchomieniem   09:42   112 L
 *     Dolewka               10:20   +48 L → 160 L
 *     Po locie              11:18    84 L
 *
 * Rachunek przestaje być czymś, co pilot składa w głowie — jest kolejnością wierszy.
 * Stopka mówi, ile z tego wyszło zużycia; werdykt normy liczy `manualFlightBalance`.
 *
 * ══ CZEGO TU NIE MA ══
 * Motogodzin. Sekwencja odpowiada na pytanie o PALIWO („ile było, ile dolałem, ile
 * zostało"), a licznik motogodzin ma dwa odczyty i żadnego zdarzenia pomiędzy — ciąg
 * z dwoma ogniwami nie jest ciągiem. Zostaje więc własną kartą, tak jak na 02A i 09B,
 * i tak samo jak tam każda wielkość ma swój arkusz.
 *
 * Zero Reacta, zero zegara — wejściem jest szkic, wyjściem wiersze.
 */

import { litres, timeUtc } from '../../format';
import type { SessionAxisFootItem, SessionAxisRow } from '../../components/data/SessionAxis';
import type { ManualFlightDraft, ManualFlightRefuelDraft } from './manualFlight';
import { preRunAddedL } from './manualFlight';

/** Co otwiera tapnięcie w wiersz sekwencji paliwa. */
export type FuelChainTarget =
  | { kind: 'reading'; which: 'before' | 'after' }
  | { kind: 'refuel'; id: string };

export interface ManualFuelChain {
  rows: SessionAxisRow[];
  foot: SessionAxisFootItem[];
}

const READING_BEFORE = 'fuel-before';
const READING_AFTER = 'fuel-after';

/** Litr, którego jeszcze nie podano — placeholder w miejscu wartości, jak `--:--` na osi czasu. */
const NO_VALUE = '— L';

/** Wiersz sekwencji → co otworzyć; `null` = wiersz bez arkusza (nie występuje). */
export function fuelChainTarget(rowId: string): FuelChainTarget | null {
  if (rowId === READING_BEFORE) return { kind: 'reading', which: 'before' };
  if (rowId === READING_AFTER) return { kind: 'reading', which: 'after' };
  if (rowId.startsWith('refuel:')) return { kind: 'refuel', id: rowId.slice('refuel:'.length) };
  return null;
}

/**
 * Ile litrów UBYŁO w tej sesji: stan początkowy + dolewki po nim − stan końcowy.
 *
 * `null`, gdy któregoś końca nie ma — rachunek bez jednej strony nie jest rachunkiem,
 * a zero udające wynik byłoby gorsze od jego braku.
 *
 * PORANNE DOLEWKI SIĘ NIE LICZĄ, bo już siedzą w odczycie „przed uruchomieniem":
 * pilot odczytuje paliwomierz PO zatankowaniu, a dolewka sprzed tego odczytu weszłaby
 * do rachunku drugi raz. Ta sama korekta, którą `toManualFlightInput` robi odczytowi
 * początkowemu przed zapisem.
 */
export function fuelUsedL(draft: ManualFlightDraft): number | null {
  if (draft.fuelBeforeL == null || draft.fuelAfterL == null) return null;
  return draft.fuelBeforeL + addedAfterReadingL(draft) - draft.fuelAfterL;
}

/** Suma dolewek liczących się do zużycia — czyli tych PO odczycie początkowym. */
export function addedAfterReadingL(draft: ManualFlightDraft): number {
  return draft.refuels.reduce((sum, r) => sum + r.addedL, 0) - preRunAddedL(draft);
}

/** Dolewki w porządku czasu — kolejność dopisywania nie jest kolejnością tankowania. */
export function sortedRefuels(draft: ManualFlightDraft): ManualFlightRefuelDraft[] {
  return [...draft.refuels].sort((a, b) => a.at - b.at);
}

/**
 * Szkic → wiersze sekwencji paliwa.
 *
 * Oba końce istnieją ZAWSZE, także bez wpisanej wartości — tak samo jak końce osi
 * czasu na kroku 3 (issue #62, czwarta tura): wiersz bez liczby JEST wejściem w jej
 * wpisanie, a sekwencja, która pojawia się dopiero po wypełnieniu, byłaby drugim
 * układem tego samego ekranu.
 */
export function buildManualFuelChain(draft: ManualFlightDraft): ManualFuelChain {
  const refuels = sortedRefuels(draft);

  const rows: SessionAxisRow[] = [
    {
      id: READING_BEFORE,
      kind: 'claim',
      time: draft.engineStart != null ? timeUtc(draft.engineStart) : '--:--',
      name: 'Przed uruchomieniem',
      sub: draft.fuelBeforeL != null ? litres(draft.fuelBeforeL) : NO_VALUE,
    },
    ...refuels.map((r) => ({
      id: `refuel:${r.id}`,
      kind: 'refuel' as const,
      time: timeUtc(r.at),
      name: 'Dolewka',
      /* „+48 L → 160 L" — dolano i stan PO. Stanu PRZED nie powtarzamy: stoi
         w poprzednim wierszu tej samej sekwencji (reguła osi z issue #44). */
      sub: `+${Math.round(r.addedL)} L → ${litres(r.afterL)}`,
    })),
    {
      id: READING_AFTER,
      kind: 'release',
      time: draft.engineStop != null ? timeUtc(draft.engineStop) : '--:--',
      name: 'Po locie',
      sub: draft.fuelAfterL != null ? litres(draft.fuelAfterL) : NO_VALUE,
    },
  ];

  const used = fuelUsedL(draft);
  const added = addedAfterReadingL(draft);

  /*
   * Stopka mówi to, czego pilot sam nie wpisał: ile ubyło i ile dolano po drodze.
   * Bez kompletu odczytów milczy — trójka zer byłaby liczbą o niczym (ta sama reguła,
   * co stopka osi czasu bez biegu silnika).
   */
  return {
    rows,
    foot:
      used == null
        ? []
        : [
            { key: 'Zużycie', value: litres(used), accent: true },
            ...(added > 0 ? [{ key: 'Dolane', value: litres(added) }] : []),
          ],
  };
}
