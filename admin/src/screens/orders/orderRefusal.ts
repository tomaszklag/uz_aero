/**
 * Ninerdeck - panel: odmowa reguły ZLECENIA → zdanie po polsku (4.0.0, epik Z-D #248).
 *
 * `Record<OrderRefusalDto, …>` wywala kompilację, gdy serwer dopisze nowy powód - a lustro
 * unii pilnuje `test/mirrors.test.ts`. Kody serwera nie wychodzą na ekran (§3): odmowa
 * terminu („Ten termin jest już zajęty") idzie mapą rezerwacji, bo zlecenie JEST
 * rezerwacją, a reszta - zdaniem z odpowiedzi zapisu (`errorMessage`).
 *
 * „Fotel już obsadzony" przy przydziale jest odpowiedzią o stanie, nie awarią (§20 Z3):
 * drugi prowadzący zdążył wybrać przed chwilą, a zdanie mówi to wprost.
 */

import type { OrderRefusalDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import type { PersonLookup } from '../calendar/bookingLabels';
import { bookingErrorMessage, bookingRefusal } from '../calendar/bookingRefusal';
import { errorMessage } from '../common/apiMessage';

const REFUSALS: Record<OrderRefusalDto, string> = {
  no_seat_sought: 'Zlecenie musi szukać co najmniej jednego fotela.',
  dual_required: 'Ta maszyna wymaga załogi dwuosobowej - drugi fotel nie może zostać pusty.',
  no_recipients: 'Każdy szukany fotel potrzebuje co najmniej jednego adresata.',
  seat_not_sought: 'Ten fotel nie jest szukany - adresatów dopisuje się do fotela, który szuka.',
  unknown_group: 'Tej grupy nie ma już w klubie. Wybierz adresatów jeszcze raz.',
  not_member: 'Ktoś z adresatów nie jest już aktywnym członkiem klubu.',
  order_closed: 'Zlecenie jest już odwołane albo wygasło.',
  not_recipient: 'Ta osoba nie jest już adresatem zlecenia.',
  seat_filled: 'Ten fotel jest już obsadzony - ktoś wybrał przed chwilą.',
  not_volunteered: 'Ta osoba nie zgłosiła się do lotu - fotel obsadza się spośród zgłoszonych.',
  wrong_seat: 'Ta osoba jest zaadresowana na drugi fotel.',
  same_person_both_seats: 'Ta osoba siedzi już w drugim fotelu.',
  seat_empty: 'W tym fotelu nikt już nie siedzi.',
  not_assigned: 'Ta osoba nie siedzi w fotelu.',
  already_assigned: 'Ta osoba siedzi już w fotelu.',
  recipient_assigned: 'Ta osoba siedzi w fotelu - najpierw cofnij przydział.',
};

const CODES = new Set<string>(Object.keys(REFUSALS));

/** Kod odmowy reguły zlecenia; `null` = to nie ta odmowa. */
export function orderRefusalOf(error: unknown): OrderRefusalDto | null {
  if (!isHttpError(error)) return null;
  const code = (error.body as { error?: unknown }).error;
  return typeof code === 'string' && CODES.has(code) ? (code as OrderRefusalDto) : null;
}

/** Zdanie po nieudanej czynności na zleceniu - reguła zlecenia, reguła terminu, reszta. */
export function orderErrorMessage(error: unknown, timezone: string, person: PersonLookup): string {
  const refusal = orderRefusalOf(error);
  if (refusal != null) return REFUSALS[refusal];
  if (bookingRefusal(error) != null) return bookingErrorMessage(error, timezone, person);
  return errorMessage(error);
}
