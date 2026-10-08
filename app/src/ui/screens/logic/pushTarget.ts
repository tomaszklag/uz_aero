/**
 * Ninerdeck - DOKĄD PROWADZI TAPNIĘCIE W POWIADOMIENIE (3.1.0, epik R-J;
 * `docs/rezerwacje.md` §12.5).
 *
 * Push jest BUDZIKIEM, nie treścią (§12.1): niesie identyfikatory, a ekran otwiera
 * się z rejestru serwera jak po każdym innym wejściu. Rodzaj wiadomości mówi, CO
 * pilot ma przed sobą: prośbę o zgodę (jego decyzja - ekran 26) albo wiadomość
 * o własnej rezerwacji (karta 23 z banerem stanu). Wszystko inne - także rodzaj,
 * którego to wydanie nie zna - otwiera skrzynkę, bo każdy nasz budzik mówi
 * „masz coś w skrzynce" i tam pilot to znajdzie.
 *
 * Czysta funkcja bez `expo-notifications`: dane przychodzą jako `unknown`, bo
 * powiadomienie bywa spreparowane albo z nowszego serwera - i wtedy ma prowadzić
 * w bezpieczne miejsce, a nie wywracać aplikacji.
 *
 * ══ KLUB W BUDZIKU (obserwowanie 3.2.0, R6) ══
 * Osoba w dwóch klubach dostaje push z klubu B przy aktywnym klubie A, a ekran otwarty
 * tokenem A odpowiedziałby 404 - czyli „BRAK POŁĄCZENIA" u kogoś z pełnym zasięgiem.
 * Serwer wozi w danych `orgId`; gdy różni się od klubu aktywnego, tapnięcie otwiera
 * skrzynkę z instrukcją „przełącz klub w ustawieniach" (§6 wielofirmowości:
 * przełączenie wymaga sieci i decyzji pilota, więc nie robimy go za niego). Budzik
 * bez `orgId` (serwer sprzed 3.2.0) idzie jak dotąd.
 *
 * ══ MASZYNA (3.2.0) ══ pięć rodzajów z `aircraftNotices.ts` → karta maszyny (27).
 *
 * ══ ZLECENIA (4.0.0, `docs/zlecenia.md` §12) ══ każdy z dwunastu rodzajów `order_*` →
 * karta zlecenia (`Order`), która sama rozstrzyga, kogo pokazuje: adresata (28), prowadzącego
 * (32) albo - przy locie, który jest już Twój - kartę rezerwacji (23F). Wiadomość w rozmowie
 * otwiera od razu ROZMOWĘ: wątek to para zlecenie × adresat, więc budzik niesie obu.
 *
 * ══ PUSH NA WIERZCHU (kanał klubu 4.0.0, K4) ══ serwer budzi pushem tylko urządzenie
 * bez połączenia, więc push odebrany przy otwartej aplikacji znaczy chwilę bez łącza
 * (pierwsze sekundy po powrocie z tła, przerwa w zasięgu). Skrzynka i dzwonek dostają
 * wtedy ten sam sygnał, co od ramki `notification` - ale tylko z klubu AKTYWNEGO
 * (`isActiveClubPush`): liczą jego wiadomości, a token innego klubu ich nie otworzy.
 */

export type PushTarget =
  | { screen: 'Decision'; params: { bookingId: string } }
  | { screen: 'BookingDetails'; params: { bookingId: string } }
  | { screen: 'Aircraft'; params: { aircraftId: string } }
  | { screen: 'Order'; params: { orderId: string } }
  | { screen: 'OrderThread'; params: { orderId: string; recipientId: string } }
  | { screen: 'Notifications'; params?: { foreignClub: true } };

/** Rodzaje z `bookingNotices.ts` (serwer) - zmiana tam wymaga zmiany tutaj. */
const MINE: ReadonlySet<string> = new Set([
  'booking_approved',
  'booking_rejected',
  'booking_expired',
  // Odwołanie rezerwacji (§12.9) - karta pokazuje powód i nazwisko odwołującego (23G).
  'booking_cancelled',
]);
/** Rodzaje z `aircraftNotices.ts` (serwer) - wszystkie otwierają kartę maszyny. */
const AIRCRAFT: ReadonlySet<string> = new Set([
  'aircraft_flight_soon',
  'aircraft_flight_cancelled',
  'aircraft_engine_started',
  'aircraft_released',
  'aircraft_not_taken',
]);

/** Rodzaje z `orderNotices.ts` (serwer) - wszystkie otwierają kartę zlecenia albo rozmowę. */
export const ORDER_KINDS: ReadonlySet<string> = new Set([
  'order_offered',
  'order_changed',
  'order_answered',
  'order_assigned',
  'order_filled',
  'order_removed',
  'order_withdrawn',
  'order_unassigned',
  'order_cancelled',
  'order_unfilled',
  'order_expired',
  'order_message',
]);

const id = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** @param activeOrgId klub AKTYWNY w telefonie; `null` = nie sprawdzamy (testy, brak klubu). */
export function pushTarget(data: unknown, activeOrgId: string | null = null): PushTarget {
  if (data == null || typeof data !== 'object') return { screen: 'Notifications' };
  const d = data as Record<string, unknown>;

  const orgId = id(d.orgId);
  if (orgId != null && activeOrgId != null && orgId !== activeOrgId) {
    return { screen: 'Notifications', params: { foreignClub: true } };
  }

  const kind = d.kind;
  if (typeof kind === 'string' && AIRCRAFT.has(kind)) {
    const aircraftId = id(d.aircraftId);
    return aircraftId == null ? { screen: 'Notifications' } : { screen: 'Aircraft', params: { aircraftId } };
  }
  if (typeof kind === 'string' && ORDER_KINDS.has(kind)) {
    const orderId = id(d.orderId);
    if (orderId == null) return { screen: 'Notifications' };
    const recipientId = id(d.recipientId);
    return kind === 'order_message' && recipientId != null
      ? { screen: 'OrderThread', params: { orderId, recipientId } }
      : { screen: 'Order', params: { orderId } };
  }

  const bookingId = id(d.bookingId);
  if (bookingId == null) return { screen: 'Notifications' };
  if (kind === 'approval_requested') return { screen: 'Decision', params: { bookingId } };
  if (typeof kind === 'string' && MINE.has(kind)) return { screen: 'BookingDetails', params: { bookingId } };
  return { screen: 'Notifications' };
}

/**
 * Czy push należy do skrzynki klubu AKTYWNEGO - wtedy odświeża ją jak ramka kanału.
 * Budzik bez klubu (serwer sprzed 3.2.0) należy do aktywnego, bo innego wtedy nie było;
 * bez klubu aktywnego nie ma skrzynki, którą dałoby się odświeżyć.
 */
export function isActiveClubPush(data: unknown, activeOrgId: string | null): boolean {
  if (activeOrgId == null || data == null || typeof data !== 'object') return false;
  const orgId = id((data as Record<string, unknown>).orgId);
  return orgId == null || orgId === activeOrgId;
}
