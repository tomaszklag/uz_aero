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
 */

export type PushTarget =
  | { screen: 'Decision'; params: { bookingId: string } }
  | { screen: 'BookingDetails'; params: { bookingId: string } }
  | { screen: 'Aircraft'; params: { aircraftId: string } }
  | { screen: 'Notifications'; params?: { foreignClub: true } };

/** Rodzaje z `bookingNotices.ts` (serwer) - zmiana tam wymaga zmiany tutaj. */
const MINE: ReadonlySet<string> = new Set(['booking_approved', 'booking_rejected', 'booking_expired']);
/** Rodzaje z `aircraftNotices.ts` (serwer) - wszystkie otwierają kartę maszyny. */
const AIRCRAFT: ReadonlySet<string> = new Set([
  'aircraft_flight_soon',
  'aircraft_flight_cancelled',
  'aircraft_engine_started',
  'aircraft_released',
  'aircraft_not_taken',
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

  const bookingId = id(d.bookingId);
  if (bookingId == null) return { screen: 'Notifications' };
  if (kind === 'approval_requested') return { screen: 'Decision', params: { bookingId } };
  if (typeof kind === 'string' && MINE.has(kind)) return { screen: 'BookingDetails', params: { bookingId } };
  return { screen: 'Notifications' };
}
