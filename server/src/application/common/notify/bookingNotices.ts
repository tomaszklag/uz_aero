/**
 * Ninerdeck (serwer) - TREŚCI POWIADOMIEŃ o rezerwacji (milestone 3.1.0, issue #164;
 * `docs/rezerwacje.md` §12.1).
 *
 * Czyste funkcje, dokładnie jak treści listów (`mail/passwordMails.ts`): biorą fakty,
 * oddają wiersz skrzynki razem z budzikiem. Zero zapytań, zero zegara - dzięki temu
 * brzmienie da się sprawdzić testem, a nie oglądaniem telefonu.
 *
 * ══ SKRZYNKA NIESIE FAKTY, BUDZIK NIESIE ZACZEPKĘ ══
 * `payload` wozi IDENTYFIKATORY i czasy, a nie gotowe zdania: znak maszyny i nazwisko
 * pilota rozwiązuje aplikacja z cache'u floty (tak samo, jak na każdym innym ekranie -
 * surowy identyfikator nie trafia pod oczy pilota). Push ma być krótki i BEZ NAZWISK:
 * ląduje na ekranie blokady, który widzi każdy, kto akurat patrzy na telefon, a treść
 * i tak stoi w skrzynce (§12.1 - push jest budzikiem, nie treścią).
 *
 * ══ POWÓD ODMOWY JEST CZĘŚCIĄ WIADOMOŚCI ══
 * Bez niego „odmowa" zostawia pilota z pytaniem, na które musiałby zadzwonić (§9.4).
 * Tą samą zasadą wiadomość o wygaśnięciu mówi, co robić dalej, a wiadomość o zmianie
 * ścieżki - dlaczego rezerwacja czeka, mimo że ktoś już ją zatwierdził.
 */

/**
 * Rodzaje wiadomości. Napisy jadą na drut i czyta je aplikacja, więc są częścią
 * kontraktu - nowy rodzaj dokłada się tutaj, a nie po drugiej stronie.
 */
export type NotificationKind =
  /** „Ktoś czeka na Twoją decyzję" - do osób kroku bieżącego. */
  | 'approval_requested'
  /** „Twoja rezerwacja ma komplet zgód" - do rezerwującego. */
  | 'booking_approved'
  /** „Odmówiono" razem z powodem - do rezerwującego. */
  | 'booking_rejected'
  /** „Nikt nie zdążył zdecydować" (§11.5) - do rezerwującego. */
  | 'booking_expired';

/** Rezerwacja w postaci, w jakiej opisuje ją wiadomość. */
export interface NoticeBooking {
  id: string;
  aircraftId: string;
  startsAt: number;
  endsAt: number;
}

/**
 * Wiadomość gotowa do zapisania i do obudzenia telefonu. Jedna struktura na oba, bo
 * to JEDNA wiadomość widziana z dwóch stron - rozdzielone kształty rozjechałyby się
 * przy pierwszej zmianie brzmienia.
 */
export interface NotificationDraft {
  pilotId: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  push: { title: string; body: string };
}

const about = (booking: NoticeBooking): Record<string, unknown> => ({
  bookingId: booking.id,
  aircraftId: booking.aircraftId,
  startsAt: new Date(booking.startsAt).toISOString(),
  endsAt: new Date(booking.endsAt).toISOString(),
});

/** Prośba o zgodę - po jednej do każdej osoby kroku bieżącego. */
export function approvalRequested(
  booking: NoticeBooking,
  approverIds: readonly string[],
  step: { id: string; label: string },
): NotificationDraft[] {
  return approverIds.map((pilotId) => ({
    pilotId,
    kind: 'approval_requested' as const,
    // Nazwa kroku jedzie do SKRZYNKI, choć ekran decyzji jej nie pisze („ekran pyta
    // CIEBIE, więc nazwa kroku odpowiada na pytanie, którego nikt nie zadał", §9.4).
    // W wiadomości jest czym innym: osoba stojąca w dwóch krokach ma prawo wiedzieć,
    // w której roli ją pytają.
    payload: { ...about(booking), stepId: step.id, stepLabel: step.label },
    push: {
      title: 'Prośba o zgodę',
      body: 'Rezerwacja czeka na Twoją decyzję.',
    },
  }));
}

/** Komplet zgód - do rezerwującego. */
export function bookingApproved(booking: NoticeBooking, pilotId: string): NotificationDraft {
  return {
    pilotId,
    kind: 'booking_approved',
    payload: about(booking),
    push: { title: 'Rezerwacja potwierdzona', body: 'Masz komplet zgód.' },
  };
}

/**
 * Odmowa - do rezerwującego, RAZEM Z POWODEM. Powód jest wymagany przy odmowie (§11.3),
 * więc tu jest napisem, a nie polem opcjonalnym: wiadomość bez niego nie powstaje.
 */
export function bookingRejected(
  booking: NoticeBooking,
  pilotId: string,
  refusal: { reason: string; decidedBy: string; stepLabel: string },
): NotificationDraft {
  return {
    pilotId,
    kind: 'booking_rejected',
    payload: { ...about(booking), ...refusal },
    push: { title: 'Rezerwacja odrzucona', body: 'Otwórz, żeby przeczytać powód.' },
  };
}

/**
 * Termin nadszedł bez decyzji (§11.5) - do rezerwującego. Osobna wiadomość od odmowy
 * i to jest jej cały sens: nikt nie powiedział „nie", tylko nikt nie powiedział nic.
 */
export function bookingExpired(booking: NoticeBooking, pilotId: string): NotificationDraft {
  return {
    pilotId,
    kind: 'booking_expired',
    payload: about(booking),
    push: {
      title: 'Rezerwacja wygasła',
      body: 'Nikt nie zdążył zdecydować - termin wrócił do puli.',
    },
  };
}
