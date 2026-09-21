/**
 * Ninerdeck - ODMOWA ZAPISU REZERWACJI jako zdanie na ekranie (makieta 22C, #162 F6).
 *
 * ══ ODMOWA NIESIE TREŚĆ, WIĘC NIE JEST BŁĘDEM ══
 * `409 slot_taken` przychodzi z kolidującą zajętością, którą serwer dociąga kosztem
 * punktu zapisu w transakcji (epik R-B) - i cały sens tego modułu polega na tym, żeby
 * jej nie zmarnować. „Spróbuj ponownie" kazałoby pilotowi zgadywać, czy stoi tam
 * przegląd, czy kolega, i czy warto czekać.
 *
 * ══ NAZWISKO STOI ZA SEPARATOREM, A NIE W ŚRODKU ZDANIA ══
 * „zarezerwowana przez J. Nowaka" wymaga dopełniacza, a odmiany nie da się wyprowadzić
 * regułą (Nowak → Nowaka, Kowalska → Kowalskiej, Lis → Lisa). Ta sama decyzja, co przy
 * powodach sugestii i przy blokadzie arkusza czasów: zdanie zostaje poprawne, a nazwisko
 * dochodzi w MIANOWNIKU po kropce albo po separatorze.
 *
 * ══ WIEK KOLIZJI JEST CZĘŚCIĄ ODPOWIEDZI ══
 * „weszła 3 min temu" znaczy co innego niż cudzy plan sprzed tygodnia: pierwsze jest
 * wyścigiem o slot, drugie - zwykłym stanem kalendarza, którego pilot nie zauważył.
 * Bez znanego wieku (stary serwer) zdania po prostu nie ma - nie zgadujemy.
 */

import { relativeAge, shortName } from '@ninerdeck/format';

import type { CalendarBooking } from './calendarData';
import { clubHhmm, type ClubDayBounds } from './clubClock';

/** Jak świeża musi być kolizja, żeby nazwać ją wyścigiem, a nie stanem kalendarza. */
const FRESH_MS = 60 * 60_000;

export interface BookingDenyInput {
  /** Kod odmowy z serwera (`slot_taken`, `aircraft_disabled`, …). */
  refusal: string;
  /** Kolidująca zajętość; `null` = odmowa bez niej albo zapis, który nie dojechał. */
  taken: CalendarBooking | null;
  /** Kiedy powstała kolidująca zajętość (UTC, ms); `null` = serwer nie podał. */
  takenAt: number | null;
  now: number;
  /** Doba, w której stoi formularz - z niej liczą się godziny kolizji. */
  day: ClubDayBounds;
  /** Znak wybranej maszyny; `null` = poza cache'em floty. */
  reg: string | null;
  /** Ten pilot - własna rezerwacja w tym czasie czyta się inaczej niż cudza. */
  pilotId: string;
  nameOf: (id: string | null) => string | null;
}

export interface BookingDenyVm {
  title: string;
  body: string;
  /**
   * Czy pokazać skrót „najbliższe wolne".
   *
   * Tylko przy zajętym TERMINIE: sugestie liczą się dla WYBRANEJ maszyny, więc przy
   * maszynie wyłączonej z użytku albo nieznanej prowadziłyby w tę samą ścianę.
   */
  offerFix: boolean;
}

/**
 * Zapis, który NIE DOJECHAŁ - inna kategoria niż odmowa reguły.
 *
 * Serwer nie odpowiedział, więc o terminie nie wiemy NIC: mógł się zapisać i zginąć
 * po drodze albo nie powstać wcale. Dlatego zdanie mówi, czyją decyzją jest slot
 * (§2.1), a nie „spróbuj ponownie" - ponowienie jest oczywiste, a powód nie.
 */
export const BOOKING_OFFLINE: BookingDenyVm = {
  title: 'Rezerwacja wymaga połączenia',
  body: 'Slot potwierdza serwer - bez zasięgu nie ma jak sprawdzić, czy termin jest wolny.',
  offerFix: false,
};

export function bookingDeny(input: BookingDenyInput): BookingDenyVm {
  const reg = input.reg ?? 'Ta maszyna';

  switch (input.refusal) {
    case 'slot_taken':
      return takenVm(input, reg);

    case 'aircraft_disabled':
      return {
        title: 'Maszyna wyłączona z użytku',
        body: `${reg} nie jest w tej chwili dostępna. Wybierz inny samolot.`,
        offerFix: false,
      };

    case 'aircraft_not_found':
      // Flota zmieniła się między wczytaniem ekranu a zapisem - wskazanie maszyny
      // przestało cokolwiek znaczyć, więc krok wraca do wyboru.
      return {
        title: 'Nie znam tej maszyny',
        body: 'Wybierz samolot jeszcze raz - flota klubu mogła się w międzyczasie zmienić.',
        offerFix: false,
      };

    case 'booking_in_past':
      return {
        title: 'Ten termin już minął',
        body: 'Ustaw godziny, które są jeszcze przed Tobą.',
        offerFix: true,
      };

    case 'booking_order':
      return {
        title: 'Koniec wypada przed początkiem',
        body: 'Popraw godziny rezerwacji.',
        offerFix: false,
      };

    default:
      // Odmowa, której ten ekran nie zna (nowszy serwer). Kod jedzie na ekran, bo
      // pilot przeczyta go administratorowi - tak samo jak przy zablokowanej wysyłce.
      return {
        title: 'Nie udało się zarezerwować',
        body: `Serwer odmówił zapisu (${input.refusal}).`,
        offerFix: false,
      };
  }
}

function takenVm(input: BookingDenyInput, reg: string): BookingDenyVm {
  const taken = input.taken;
  if (taken == null) {
    return {
      title: 'Ten termin jest już zajęty',
      body: `${reg} ma w tych godzinach inną zajętość.`,
      offerFix: true,
    };
  }

  const hours = `${clubHhmm(taken.startsAt, input.day)} → ${clubHhmm(taken.endsAt, input.day)}`;

  if (taken.kind === 'block') {
    // Wyłączenie z użytku nie ma właściciela, więc nazywa je POWÓD - ten sam napis,
    // który stoi na pasku osi i na karcie maszyny.
    const why = taken.blockReason == null ? '' : ` · ${taken.blockReason}`;
    return {
      title: 'Maszyna jest w tych godzinach wyłączona',
      body: `${reg} jest wyłączona z użytku ${hours}${why}.`,
      offerFix: true,
    };
  }

  if (taken.pilotId === input.pilotId) {
    // Własna rezerwacja w tym czasie to nie jest wyścig, tylko podwójny wpis - i tak
    // ma się czytać, bez zdania o kimś, kto zajął termin.
    return {
      title: 'Masz już rezerwację w tych godzinach',
      body: `${reg} jest zajęta ${hours} Twoją własną rezerwacją.`,
      offerFix: true,
    };
  }

  const name = input.nameOf(taken.pilotId);
  const who = name == null ? 'inny pilot' : shortName(name);
  const age =
    input.takenAt == null ? '' : ` Weszła ${relativeAge(Math.max(0, input.now - input.takenAt))} temu.`;

  return {
    title:
      input.takenAt != null && input.now - input.takenAt < FRESH_MS
        ? 'Ten termin właśnie zajęto'
        : 'Ten termin jest już zajęty',
    body: `${reg} jest zajęta ${hours} · rezerwację ma ${who}.${age}`,
    offerFix: true,
  };
}
