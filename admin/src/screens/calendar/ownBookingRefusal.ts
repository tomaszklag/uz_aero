/**
 * Ninerdeck - panel: ODMOWA ZAPISU WŁASNEJ REZERWACJI (makieta K7b, issue #233).
 *
 * Ta sama odmowa i te same zdania, co na 22C w telefonie (`logic/bookingDeny.ts`):
 * `409 slot_taken` niesie kolidującą zajętość i chwilę jej powstania, a szuflada wraca
 * na KROK 1 z banerem bursztynowym - nic się nie zepsuło, ktoś był pierwszy. Nigdy
 * „spróbuj ponownie".
 *
 * ══ WIEK KOLIZJI JEST CZĘŚCIĄ ODPOWIEDZI ══
 * „weszła 3 min temu" znaczy wyścig o slot, a plan sprzed tygodnia - stan kalendarza,
 * którego pilot nie zauważył. Bez znanego wieku zdania nie ma - nie zgadujemy.
 *
 * Zapis, który nie dojechał, to inna kategoria niż odmowa reguły: mówi, CZYJĄ decyzją
 * jest slot („Slot potwierdza serwer"), a szkic zostaje w całości.
 */

import { relativeAge } from '@ninerdeck/format';

import type { BookingDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import { godzina, type PersonLookup } from './bookingLabels';
import { bookingErrorMessage, bookingRefusal, takenBooking } from './bookingRefusal';
import { busyLabel } from './dayTrack';

/** Jak świeża musi być kolizja, żeby nazwać ją wyścigiem, a nie stanem kalendarza. */
const FRESH_MS = 60 * 60_000;

export interface TakenBanner {
  lead: string;
  body: string;
}

/** Chwila powstania kolidującej zajętości; `null` = serwer jej nie podał. */
export function takenAt(error: unknown): number | null {
  if (!isHttpError(error)) return null;
  const at = Date.parse(String((error.body as { takenAt?: unknown }).takenAt ?? ''));
  return Number.isFinite(at) ? at : null;
}

/** Baner K7b przy `slot_taken`; `null` = to nie jest ta odmowa. */
export function takenBanner(
  error: unknown,
  ctx: { reg: string; tz: string; now: number; viewerId: string | null; person: PersonLookup },
): TakenBanner | null {
  if (bookingRefusal(error) !== 'slot_taken') return null;
  const taken: BookingDto | null = takenBooking(error);
  if (taken == null) return { lead: 'Ten termin jest już zajęty.', body: `${ctx.reg} ma w tych godzinach inną zajętość.` };

  const hours = `${godzina(new Date(taken.startsAt), ctx.tz)} → ${godzina(new Date(taken.endsAt), ctx.tz)}`;
  if (taken.kind === 'block') {
    return {
      lead: 'Maszyna jest w tych godzinach wyłączona.',
      body: `${ctx.reg} ${hours} · ${busyLabel(taken, ctx.person)}.`,
    };
  }
  if (taken.pilotId != null && taken.pilotId === ctx.viewerId) {
    // Własna rezerwacja w tym czasie to podwójny wpis, nie wyścig.
    return { lead: 'Masz już rezerwację w tych godzinach.', body: `${ctx.reg} ${hours} · Twoja rezerwacja.` };
  }

  const at = takenAt(error);
  const fresh = at != null && ctx.now - at < FRESH_MS;
  const age = at == null ? '' : ` · weszła ${relativeAge(Math.max(0, ctx.now - at))} temu`;
  return {
    lead: fresh ? 'Ten termin właśnie zajęto.' : 'Ten termin jest już zajęty.',
    body: `${ctx.reg} ${hours} · rezerwację ma ${busyLabel(taken, ctx.person)}${age}.`,
  };
}

/**
 * Zdanie pod krokiem przy każdej INNEJ odmowie. Zapis, który nie dojechał (awaria sieci),
 * mówi, czyją decyzją jest slot - a nie „coś poszło nie tak".
 */
export function ownRefusalMessage(error: unknown, tz: string, person: PersonLookup): string {
  if (!isHttpError(error)) {
    return 'Nie ma połączenia z serwerem. Slot potwierdza serwer - spróbuj za chwilę, szkic zostaje.';
  }
  return bookingErrorMessage(error, tz, person);
}
