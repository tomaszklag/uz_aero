/**
 * Ninerdeck - ODMOWY SERWERA PRZY ZLECENIU, po polsku (4.0.0, epik Z-C #247;
 * `docs/zlecenia.md` §13).
 *
 * Serwer odmawia kodem surowym (`seat_filled`, `not_leader`…), a nazwanie go jest sprawą
 * ekranu - zdanie stoi przy przycisku, którym pilot próbował (issue #55), więc mówi, CO
 * dalej, a nie samą diagnozę. Kod nieznany temu wydaniu jedzie na ekran w nawiasie: pilot
 * przeczyta go administratorowi, a „coś poszło nie tak" nie powie nikomu niczego.
 *
 * Zajęty termin (`slot_taken`) nie ma tu zdania - niesie TREŚĆ (co stoi w tym czasie)
 * i rysuje go karta odmowy formularza, jak przy rezerwacji (22C).
 *
 * ══ ZAPIS, KTÓRY NIE DOJECHAŁ, TO INNA KATEGORIA ══
 * `null` z klienta znaczy „nie wiadomo, czy zapisano" - o zleceniu rozstrzyga serwer, więc
 * zdanie mówi, czyją decyzją jest odpowiedź, a nie „spróbuj ponownie".
 */

import { DUAL_REQUIRED_REASON } from './dualRequirement';

/** Zdanie przy przycisku zapisu, który nie dojechał (brak sieci, wygasła sesja). */
export const ORDER_OFFLINE = 'Zlecenie potwierdza serwer - potrzebne połączenie.';

/** Wiadomość, która nie dojechała - pole wiadomości mówi to samo zdaniem o rozmowie (29A). */
export const MESSAGE_OFFLINE = 'Wiadomość wysyła serwer - potrzebne połączenie.';

/**
 * Odpowiedź adresata, która nie dojechała (28, 28D) - to samo zdanie, co decyzja o cudzej
 * rezerwacji (26): o tym, czy fotel jest Twój, rozstrzyga serwer.
 */
export const ANSWER_OFFLINE = 'Odpowiedź zapisuje serwer - potrzebne połączenie.';

const ORDER_REFUSAL: Readonly<Record<string, string>> = {
  aircraft_disabled: 'Ta maszyna jest wyłączona z użytku - wybierz inny samolot.',
  aircraft_not_found: 'Wybierz samolot jeszcze raz - flota klubu mogła się zmienić.',
  booking_in_past: 'Ten termin już minął - ustaw godziny, które są jeszcze przed Tobą.',
  booking_order: 'Popraw godziny - koniec wypada przed początkiem.',
  booking_closed: 'Ten termin jest już zamknięty.',
  booking_from_order: 'Termin zmienia osoba zlecająca - edycją zlecenia.',
  no_seat_sought: 'Zaznacz „Szukam" przy co najmniej jednym fotelu - inaczej to zwykła rezerwacja.',
  dual_required: DUAL_REQUIRED_REASON,
  no_recipients: 'Dodaj adresatów przy każdym szukanym fotelu.',
  seat_not_sought: 'Ten fotel nie jest szukany - zmień jego stan albo usuń adresatów.',
  unknown_group: 'Tej grupy nie ma już w klubie - wybierz adresatów jeszcze raz.',
  not_member: 'Ta osoba nie jest już członkiem klubu - wybierz kogoś innego.',
  order_closed: 'To zlecenie jest już zamknięte.',
  not_recipient: 'To zlecenie nie jest już do Ciebie.',
  seat_filled: 'Ten fotel jest już obsadzony.',
  not_volunteered: 'Ta osoba nie zgłosiła się na ten lot.',
  wrong_seat: 'Ta osoba nie może trafić na ten fotel.',
  same_person_both_seats: 'Jedna osoba nie może zająć obu foteli.',
  seat_empty: 'W tym fotelu nikt już nie siedzi.',
  not_assigned: 'Nie masz już przydziału w tym zleceniu.',
  already_assigned: 'Ta osoba ma już przydział w tym zleceniu.',
  recipient_assigned: 'Najpierw cofnij przydział tej osoby.',
  not_leader: 'Tego zlecenia nie prowadzisz.',
  not_your_booking: 'To nie jest Twoja rezerwacja.',
  not_found: 'Tego zlecenia już nie ma.',
};

/** Odmowa zapisu zlecenia → zdanie przy przycisku. */
export function orderRefusalText(refusal: string): string {
  return ORDER_REFUSAL[refusal] ?? `Serwer odmówił zapisu (${refusal}).`;
}

const THREAD_REFUSAL: Readonly<Record<string, string>> = {
  read_only: 'Rozmowę prowadzi osoba zlecająca - możesz ją czytać.',
  thread_closed: 'Ta rozmowa jest już zamknięta - zostaje do odczytu.',
  message_invalid: 'Wiadomość jest pusta albo za długa.',
  message_exists: 'Ta wiadomość jest już wysłana.',
  not_found: 'Tej rozmowy już nie ma.',
};

/** Odmowa wysłania wiadomości → zdanie w polu wiadomości (pole i WYŚLIJ to jedna kontrolka). */
export function threadRefusalText(refusal: string): string {
  return THREAD_REFUSAL[refusal] ?? `Serwer odmówił wysłania (${refusal}).`;
}
