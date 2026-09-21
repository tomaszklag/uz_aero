/**
 * Ninerdeck - panel: ODMOWA ZAPISU ZAJĘTOŚCI jako zdanie dla człowieka (issue #160).
 *
 * Trzeci taki plik po `accountRefusal.ts` i `aircraftRefusal.ts` i z tego samego powodu:
 * `apiMessage.ts` oddaje surowy kod, a nazwanie go po polsku należy do EKRANU - „zajęte"
 * brzmi inaczej przy koncie, przy samolocie i przy terminie.
 *
 * ══ ODMOWA MÓWI, CO STOI W TYM CZASIE ══
 * Serwer odsyła przy `slot_taken` KOLIDUJĄCY wiersz (`taken`) i robi to kosztem punktu
 * zapisu w transakcji - właśnie po to, żeby ekran nie musiał pisać „nie da się". Panel,
 * który by ten wiersz wyrzucił, kupowałby tamtą pracę i nie korzystał z niej.
 *
 * Kształt odpowiedzi jest tu WŁASNY (`{ error, taken }`), nie `409 refused` + `reason`,
 * więc `refusalOf` z `apiMessage` go nie widzi - stąd osobne rozpoznanie po `error`.
 */

import type { BookingDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import { errorMessage } from '../common/apiMessage';
import { operationLabel, stempel, type PersonLookup } from './bookingLabels';

export type BookingRefusalCode =
  | 'slot_taken'
  | 'aircraft_disabled'
  | 'aircraft_not_found'
  | 'not_your_booking'
  | 'booking_in_past'
  | 'booking_order'
  | 'booking_closed'
  | 'reason_required';

const ZDANIA: Readonly<Record<BookingRefusalCode, string>> = {
  slot_taken: 'Ten termin jest już zajęty.',
  aircraft_disabled: 'Ta maszyna jest wyłączona ze służby - nie da się zaplanować nią lotu.',
  // Skasowana albo z innego klubu - serwer nie rozróżnia tego celowo, więc i my nie.
  aircraft_not_found: 'Nie ma już takiej maszyny w klubie. Odśwież stronę i wybierz inną.',
  not_your_booking: 'To nie jest Twoja rezerwacja.',
  booking_in_past: 'Ten termin już minął. Wybierz późniejszy.',
  booking_order: 'Koniec terminu musi wypadać po jego początku.',
  booking_closed: 'Ta zajętość jest już zamknięta - ktoś rozstrzygnął ją przed chwilą.',
  reason_required: 'Podaj powód - pilot przeczyta go w aplikacji.',
};

const KODY = new Set<string>(Object.keys(ZDANIA));

/** Kod odmowy z odpowiedzi serwera; `null` = to nie jest odmowa reguły rezerwacji. */
export function bookingRefusal(error: unknown): BookingRefusalCode | null {
  if (!isHttpError(error)) return null;
  const kod = (error.body as { error?: unknown }).error;
  return typeof kod === 'string' && KODY.has(kod) ? (kod as BookingRefusalCode) : null;
}

/** Kolidująca zajętość dołączona przez serwer do `slot_taken`; `null` = nie dołączył. */
export function takenBooking(error: unknown): BookingDto | null {
  if (!isHttpError(error)) return null;
  const taken = (error.body as { taken?: unknown }).taken;
  return taken == null ? null : (taken as BookingDto);
}

/**
 * Zdanie pod przyciskiem zapisu. Przy zajętym terminie dokleja, CO tam stoi - z godziną
 * w strefie klubu, jak reszta kalendarza.
 */
export function bookingErrorMessage(
  error: unknown,
  timezone: string,
  person: PersonLookup,
): string {
  const kod = bookingRefusal(error);
  if (kod == null) return errorMessage(error);
  if (kod !== 'slot_taken') return ZDANIA[kod];

  const stoi = takenBooking(error);
  return stoi == null ? ZDANIA.slot_taken : `${ZDANIA.slot_taken} ${opis(stoi, timezone, person)}`;
}

/** „Od 23 wrz, 06:00 stoi przegląd." / „Od 21 wrz, 08:00 lata A. Kowalska (egzamin)." */
function opis(taken: BookingDto, timezone: string, person: PersonLookup): string {
  const od = stempel(new Date(taken.startsAt), timezone);
  if (taken.kind === 'block') return `Od ${od} maszyna jest wyłączona z użytku.`;
  const kto = taken.pilotId == null ? null : person(taken.pilotId);
  const zadanie = taken.operation == null ? '' : ` (${operationLabel(taken.operation).toLowerCase()})`;
  return kto == null ? `Od ${od} stoi inna rezerwacja.` : `Od ${od} lata ${kto.name}${zadanie}.`;
}
