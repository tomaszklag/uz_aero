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
 */

export type PushTarget =
  | { screen: 'Decision'; params: { bookingId: string } }
  | { screen: 'BookingDetails'; params: { bookingId: string } }
  | { screen: 'Notifications'; params?: undefined };

/** Rodzaje z `bookingNotices.ts` (serwer) - zmiana tam wymaga zmiany tutaj. */
const MINE: ReadonlySet<string> = new Set(['booking_approved', 'booking_rejected', 'booking_expired']);

export function pushTarget(data: unknown): PushTarget {
  if (data == null || typeof data !== 'object') return { screen: 'Notifications' };
  const kind = (data as Record<string, unknown>).kind;
  const bookingId = (data as Record<string, unknown>).bookingId;
  if (typeof bookingId !== 'string' || bookingId === '') return { screen: 'Notifications' };

  if (kind === 'approval_requested') return { screen: 'Decision', params: { bookingId } };
  if (typeof kind === 'string' && MINE.has(kind)) return { screen: 'BookingDetails', params: { bookingId } };
  return { screen: 'Notifications' };
}
