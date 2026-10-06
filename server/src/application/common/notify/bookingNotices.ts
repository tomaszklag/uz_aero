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
  | 'booking_expired'
  /**
   * „Prośba o zgodę wycofana" (3.2.0, issue #233) - do osób kroku BIEŻĄCEGO, gdy
   * czekającą rezerwację odwołano. Bez niej osoba kroku miała w skrzynce prośbę, której
   * nie było już jak rozstrzygnąć, a kolejka „Do decyzji" gasła bez słowa dlaczego.
   */
  | 'approval_withdrawn'
  /**
   * „Rezerwacja odwołana" (§12.9, decyzje właściciela 2026-10-06) - do osób W FOTELACH
   * rezerwacji poza odwołującym: przy odwołaniu przez klub dowódca i drugi pilot, przy
   * odwołaniu własnej sam drugi pilot. Panel obiecywał „Pilot zobaczy powód w aplikacji",
   * a do tej wiadomości powód nie docierał nigdzie.
   */
  | 'booking_cancelled'
  /*
   * OBSERWOWANIE SAMOLOTU (3.2.0, issue #205) - pięć rodzajów do obserwujących maszynę,
   * treści w `aircraftNotices.ts`. Stoją w TEJ unii, bo to jest kontrakt skrzynki:
   * aplikacja rozpoznaje rodzaj po napisie, a rodzaj nieznany kieruje do skrzynki.
   */
  /** „Zbliża się lot" - potwierdzony termin zaczyna się za godzinę. */
  | 'aircraft_flight_soon'
  /** Odwołano albo przesunięto termin, o którym już przypomniano. */
  | 'aircraft_flight_cancelled'
  /** Przyjęte uruchomienie silnika - maszyny nie wolno tknąć. */
  | 'aircraft_engine_started'
  /** Maszyna zdana (z odczytami) albo operację zakończył administrator. */
  | 'aircraft_released'
  /** Nikt nie odebrał zarezerwowanej maszyny - slot wrócił do puli. */
  | 'aircraft_not_taken'
  /*
   * ZLECENIA NA LOT (4.0.0, issue #245; `docs/zlecenia.md` §12) - treści w
   * `orderNotices.ts`. Tapnięcie każdego z nich otwiera kartę zlecenia, a `order_message`
   * od razu rozmowę; rodzaj nieznany starszej aplikacji ląduje w skrzynce.
   */
  /** „Zlecenie lotu" - wysłanie, dopisanie adresatów, „Wyślij ponownie". */
  | 'order_offered'
  /** „Zlecenie zmienione" (termin) albo „Zlecenie edytowane" (reszta). */
  | 'order_changed'
  /** „Odpowiedź na zlecenie" - wyłącznie do autora. */
  | 'order_answered'
  /** „Lot przydzielony" - wybrany z grupy albo listy. */
  | 'order_assigned'
  /** „Zlecenie nieaktualne" - fotel obsadzony (przy liście wspólnej: komplet). */
  | 'order_filled'
  /** „Zlecenie nieaktualne" - zlecenie odebrane adresatowi. */
  | 'order_removed'
  /** „Rezygnacja z lotu" - do autora. */
  | 'order_withdrawn'
  /** „Przydział cofnięty" - cofnięcie albo fotel przestawiony na „ja"/„brak". */
  | 'order_unassigned'
  /** „Zlecenie odwołane". */
  | 'order_cancelled'
  /** „Zlecenie bez kompletu załogi" - do autora, w przeddzień o 18:00 czasu klubu. */
  | 'order_unfilled'
  /** „Zlecenie wygasło" - termin nadszedł bez kompletu. */
  | 'order_expired'
  /** „Wiadomość w zleceniu" - jeden nieprzeczytany wiersz na wątek. */
  | 'order_message';

/** Rezerwacja w postaci, w jakiej opisuje ją wiadomość. */
export interface NoticeBooking {
  id: string;
  aircraftId: string;
  startsAt: number;
  endsAt: number;
  /**
   * Rezerwujący (3.1.0, epik R-I) - skrzynka pisze „Jakub Wrona prosi o zgodę na lot",
   * a nazwisko rozwiązuje z cache floty po identyfikatorze, jak wszędzie. `null` przy
   * wyłączeniu z użytku, którego ścieżka nie dotyczy.
   */
  pilotId: string | null;
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
  pilotId: booking.pilotId,
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
 * Prośba wycofana - do osób kroku, którego pytano (3.2.0, issue #233; decyzja właściciela
 * 2026-09-27). `cancelledBy` jedzie obok rezerwującego, bo odwołać czekającą sprawę może
 * też administrator z `reservations.manage` - skrzynka rozwiązuje nazwisko sama, tak jak
 * rezerwującego. Push bez nazwisk, jak każdy (§12.1).
 */
export function approvalWithdrawn(
  booking: NoticeBooking,
  approverIds: readonly string[],
  step: { id: string; label: string },
  cancelledBy: string,
): NotificationDraft[] {
  return approverIds.map((pilotId) => ({
    pilotId,
    kind: 'approval_withdrawn' as const,
    payload: { ...about(booking), stepId: step.id, stepLabel: step.label, cancelledBy },
    push: {
      title: 'Prośba wycofana',
      body: 'Rezerwacja, o którą Cię pytano, została odwołana.',
    },
  }));
}

/**
 * Rezerwacja odwołana - do osób W FOTELACH poza odwołującym (§12.9). Jedna reguła dla
 * odwołania przez klub i odwołania własnej: kto odwołał, wie o tym; kto siedział w fotelu
 * obok, dowiaduje się stąd. Administrator siedzący w którymś fotelu nie słyszy o sobie.
 *
 * Powód bywa pusty - przy odwołaniu własnej jest opcjonalny (telefon) albo go nie ma
 * (panel) - i wtedy budzik nie obiecuje powodu do przeczytania, tylko mówi skutek.
 * Wyłączenie z użytku nie ma foteli, więc nie rodzi wiadomości z samej konstrukcji.
 */
export function bookingCancelled(
  booking: NoticeBooking & { dualId: string | null },
  cancel: { reason: string | null; cancelledBy: string },
): NotificationDraft[] {
  const reason = cancel.reason?.trim() ? cancel.reason.trim() : null;
  const seats = new Set(
    [booking.pilotId, booking.dualId].filter(
      (id): id is string => id != null && id !== cancel.cancelledBy,
    ),
  );
  return [...seats].map((pilotId) => ({
    pilotId,
    kind: 'booking_cancelled' as const,
    payload: { ...about(booking), reason, cancelledBy: cancel.cancelledBy },
    push: {
      title: 'Rezerwacja odwołana',
      body: reason == null ? 'Termin wrócił do puli.' : 'Otwórz, żeby przeczytać powód.',
    },
  }));
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
