/**
 * Ninerdeck - SUGESTIE GODZIN na kroku 1 rezerwacji (`design/22`, `.slots`).
 *
 * Trzy-cztery kafelki NAD kontrolką czasu, a nie lista, z której trzeba wybrać: pilot
 * może wpisać dowolny wolny termin, a sugestia ma mu tylko oszczędzić szukania.
 *
 * ══ KAŻDY KAFELEK MÓWI, DLACZEGO ══
 * Rachunek upakowania dnia liczy domena (`suggestSlots`) i oddaje POWÓD razem z godziną -
 * bez niego sugestia wygląda na wyrocznię. Ten moduł zamienia powód na zdanie i dokłada
 * do niego SĄSIADA, bo tego domena nie wie: zajętości przychodzą do niej jako same
 * przedziały czasu, bez nazwisk.
 *
 * ══ NAZWISKO STOI ZA SEPARATOREM, A NIE W ŚRODKU ZDANIA ══
 * „tuż przed rezerwacją J. Nowaka" wymagałoby odmiany nazwiska, a tej nie da się
 * wyprowadzić regułą (Nowak → Nowaka, Kowalska → Kowalskiej, Lis → Lisa). Ta sama
 * decyzja, przez którą blokada arkusza czasów mówi o SKUTKU zamiast nazywać pola:
 * zdanie zostaje poprawne, a nazwisko dochodzi po kropce w mianowniku.
 */

import { shortName } from '@ninerdeck/format';

import type { RemoteSlot } from '../../../application';

import type { CalendarBooking } from './calendarData';
import { clubHhmm, type ClubDayBounds } from './clubClock';

export interface SlotChipVm {
  startsAt: number;
  endsAt: number;
  /** „11:00 → 13:00" czasem klubu. */
  hours: string;
  /** „tuż przed rezerwacją · J. Nowak", „początek dnia". */
  why: string;
  selected: boolean;
}

export interface SlotChipsInput {
  slots: readonly RemoteSlot[];
  /** Zajętości TEJ maszyny w tej dobie - stąd bierze się sąsiad. */
  busy: readonly CalendarBooking[];
  day: ClubDayBounds;
  /** Okno osi - „początek dnia" znaczy początek doby lotnej, nie północ. */
  window: { from: number; to: number };
  /** Termin ustawiony w szkicu - kafelek, który go trafia, jest zaznaczony. */
  startsAt: number | null;
  endsAt: number | null;
  /** Imię i nazwisko z cache floty; `null` = pilot spoza cache'u. */
  nameOf: (id: string | null) => string | null;
}

export function buildSlotChips(input: SlotChipsInput): SlotChipVm[] {
  return input.slots.flatMap((slot) => {
    const startsAt = Date.parse(slot.startsAt);
    const endsAt = Date.parse(slot.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return [];

    return [
      {
        startsAt,
        endsAt,
        hours: `${clubHhmm(startsAt, input.day)} → ${clubHhmm(endsAt, input.day)}`,
        why: whyOf(slot, startsAt, endsAt, input),
        selected: input.startsAt === startsAt && input.endsAt === endsAt,
      },
    ];
  });
}

function whyOf(
  slot: RemoteSlot,
  startsAt: number,
  endsAt: number,
  input: SlotChipsInput,
): string {
  switch (slot.reason) {
    case 'fills-gap':
      return 'wypełnia wolne okno';

    case 'between-bookings':
      return 'między rezerwacjami';

    case 'next-to-booking': {
      // Domena gwarantuje, że przy tym powodzie DOKŁADNIE JEDNA strona przylega
      // (obie zerowe dałyby `fills-gap`, żadna - `open-day`), więc zerowa szczelina
      // wskazuje sąsiada jednoznacznie.
      const before = slot.gapBeforeMin === 0;
      const neighbour = before
        ? input.busy.find((b) => b.endsAt === startsAt)
        : input.busy.find((b) => b.startsAt === endsAt);

      if (neighbour?.kind === 'block') {
        return before ? 'tuż po wyłączeniu z użytku' : 'tuż przed wyłączeniem z użytku';
      }

      const head = before ? 'tuż po rezerwacji' : 'tuż przed rezerwacją';
      const name = input.nameOf(neighbour?.pilotId ?? null);
      return name == null ? head : `${head} · ${shortName(name)}`;
    }

    default:
      // Granica dnia NIE jest przyleganiem (domena nie premiuje jej i my jej nie
      // nazywamy sąsiadem) - ale kafelek stojący dokładnie na świcie ma prawo
      // powiedzieć, gdzie stoi.
      return startsAt === input.window.from ? 'początek dnia' : 'wolny dzień';
  }
}
