/**
 * Ninerdeck (serwer) - REZERWACJA MASZYNY: stany, przejścia i reguły odmowy
 * (milestone 3.0.0, issue #158 B3; dokument decyzji `docs/rezerwacje.md` §3, §4, §5).
 *
 * ══ DLACZEGO TO NIE JEST ZDARZENIE REJESTRU ══
 * Rejestr operacji ma JEDNEGO piszącego (PIC), jest append-only i opisuje FAKTY - co
 * się wydarzyło. Rezerwacja jest przedmiotem konkurencji (dwóch pilotów chce tej samej
 * soboty), jest mutowalna (przesunięcie, odwołanie) i opisuje ZAMIAR. Te dwie rzeczy
 * mają inną naturę i dlatego mieszkają w osobnej tabeli, a nie w strumieniu zdarzeń
 * (§2.1). Jedyne ich zetknięcie jest jednostronne: `session_claim` z `reservationId`
 * przestawia rezerwację na `fulfilled`.
 *
 * ══ CZEGO TU NIE MA I DLACZEGO ══
 * **Nakładania terminów.** Tego pilnuje BAZA (`bookings_no_overlap`, migracja 11):
 * ograniczenie wykluczające na `tstzrange` z predykatem po stanie. Funkcja czysta nie
 * zna reszty kalendarza, a udawanie, że zna, kończy się regułą przegrywającą każdy
 * wyścig - dwa równoczesne zapisy przeczytałyby wolny slot, zanim którykolwiek zdążył
 * go zająć. Domena nazywa tu wyłącznie KOD odmowy (`slot_taken`), którym adapter
 * tłumaczy wyjątek bazy na odpowiedź trasy.
 *
 * **Limitów horyzontu i liczby rezerwacji na pilota** - P7, decyzja właściciela
 * 2026-09-19: w 3.0.0 ich nie ma. Klub jest mały i zna się nawzajem; limit wpisany
 * zawczasu byłby regułą wymyśloną przed problemem.
 */

import type { ServiceStatus } from '@ninerdeck/domain';

/**
 * Rodzaj zajętości. Dwa byty w jednej tabeli, bo ograniczenie wykluczające musi objąć
 * oba naraz, a działa w obrębie jednej tabeli (§3.1) - samolot w serwisie ma być
 * nie do zarezerwowania tym samym mechanizmem, którym nie da się zarezerwować terminu
 * zajętego przez kolegę.
 */
export type BookingKind = 'flight' | 'block';

/**
 * Stany rezerwacji (§4).
 *
 * - `pending` istnieje dopiero w 3.1.0 (ścieżka akceptacji); w 3.0.0 utworzenie daje
 *   od razu `confirmed`, ale stan modelu jest przygotowany;
 * - `released` to NIE decyzja człowieka, tylko upłynięcie czasu: slot zwolniony po
 *   godzinie bez przejęcia maszyny (§4.1). Dlatego nie `cancelled` - rezerwacja ma
 *   zostać w zapisie jako „był plan, nikt nie przyszedł";
 * - `fulfilled` nadaje serwer, gdy przyjdzie `session_claim` z `reservationId`.
 */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'fulfilled'
  | 'released'
  /**
   * Termin nadszedł, a ścieżka akceptacji nie została rozstrzygnięta (3.1.0, §11.5).
   * OSOBNY od `released` i to jest cała różnica między nimi: tam maszyny nie przejęto,
   * tu zgody nie wydano - a pilot ma usłyszeć, którą z tych dwóch rzeczy przegapiono.
   */
  | 'expired';

/**
 * Stany, które TRZYMAJĄ SLOT - dokładnie ten zbiór stoi w predykacie ograniczenia
 * wykluczającego i w predykatach indeksów (migracja 11).
 *
 * `pending` trzyma razem z `confirmed` i to jest decyzja: rezerwacja czekająca na zgodę
 * musi blokować termin, inaczej „czekam na akceptację" znaczyłoby „ktoś mi to zaraz
 * zajmie". Reszta stanów oddaje termin NATYCHMIAST, zostając w tabeli jako zapis.
 *
 * ══ TA STAŁA MUSI ODPOWIADAĆ SQL-owi ══
 * Rozjazd między nią a predykatem w migracji byłby cichy: kod pokazywałby w kalendarzu
 * inny zbiór, niż baza broni przed nakładaniem. Pilnuje tego test kontraktu.
 */
export const SLOT_HOLDING_STATUSES = ['pending', 'confirmed'] as const;

export function holdsSlot(status: BookingStatus): boolean {
  return (SLOT_HOLDING_STATUSES as readonly string[]).includes(status);
}

/**
 * Dozwolone przejścia. Wypisane JAWNIE, a nie wyliczone z „co nie jest końcowe":
 * dopisanie stanu ma zmusić do decyzji, skąd i dokąd wolno nim przejść.
 *
 * Stany końcowe mają puste listy i to jest cała ich definicja - `fulfilled` też, bo
 * operacja, która się odbyła, nie przestaje się była odbyć przez odwołanie rezerwacji.
 */
const TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  pending: ['confirmed', 'rejected', 'cancelled', 'expired'],
  confirmed: ['fulfilled', 'cancelled', 'released'],
  rejected: [],
  cancelled: [],
  fulfilled: [],
  released: [],
  expired: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Kody odmowy. Surowe (`zasób_czynność`), jak `FleetRefusal` i `AccountRefusal` -
 * nazwanie ich po polsku jest sprawą aplikacji i panelu, serwer nie zna języka
 * interfejsu.
 */
export type BookingRefusal =
  /** Termin zajęty przez inną rezerwację albo przez wyłączenie maszyny z użytku. */
  | 'slot_taken'
  /** Maszyna wyłączona ze służby - nie da się zaplanować lotu czymś, co nie lata. */
  | 'aircraft_disabled'
  /**
   * Maszyna nieznana TEMU klubowi: skasowana albo cudza. Jeden kod na oba przypadki,
   * bo odróżnienie ich potwierdzałoby istnienie cudzego egzemplarza.
   *
   * Osobny od `aircraft_disabled`, choć oba kończą się odmową, i to nie jest
   * pedanteria: „wasza maszyna dziś nie lata" jest odpowiedzią o STANIE, a „nie ma
   * takiej maszyny" - o TOŻSAMOŚCI. Zlanie ich w jedno raz już kosztowało dziurę:
   * wyłączenie z użytku nie pyta o stan służby (przegląd na maszynie stojącej
   * w serwisie to norma), więc razem ze stanem przestawało sprawdzać ISTNIENIE -
   * i panel klubu A mógł zająć terminem maszynę klubu B.
   */
  | 'aircraft_not_found'
  /** Cudza rezerwacja, a wołający nie ma władzy nad cudzym planem. */
  | 'not_your_booking'
  /** Termin, który już minął - nie ma czego planować ani przesuwać. */
  | 'booking_in_past'
  /** Koniec przed początkiem albo równy - okno zerowej długości nie jest terminem. */
  | 'booking_order'
  /** Rezerwacja w stanie końcowym: odwołana, odrzucona, zwolniona albo zrealizowana. */
  | 'booking_closed'
  /** Odwołanie CUDZEJ rezerwacji bez powodu - pilot czyta go w aplikacji (P4). */
  | 'reason_required';

/** Okno terminu w milisekundach - ta sama jednostka, co w reszcie domeny. */
export interface BookingWindow {
  startsAt: number;
  endsAt: number;
}

/**
 * Sam termin: kolejność i to, czy jeszcze cokolwiek znaczy.
 *
 * ══ REGUŁA STOI NA KOŃCU TERMINU, NIE NA POCZĄTKU ══
 * Rezerwacja zaczynająca się kwadrans temu jest normalna - pilot bierze maszynę TERAZ
 * i wpisuje, do której godziny ją trzyma. Dopiero termin, który CAŁY już minął, nie
 * ma czego opisywać: samolot albo poleciał, albo nie, i jedno i drugie wie rejestr.
 * Reguła postawiona na `startsAt` odrzucałaby ten pierwszy, całkiem sensowny wpis.
 */
export function refuseWindow(window: BookingWindow, now: number): BookingRefusal | null {
  if (!Number.isFinite(window.startsAt) || !Number.isFinite(window.endsAt)) {
    return 'booking_order';
  }
  if (window.endsAt <= window.startsAt) return 'booking_order';
  if (window.endsAt <= now) return 'booking_in_past';
  return null;
}

/**
 * Utworzenie zajętości - odmowa albo `null`. Składa trzy reguły, które i tak zawsze
 * padają razem, żeby wołający nie musiał pamiętać o wszystkich.
 *
 * ══ STAN SŁUŻBY BRONI SIĘ TU, MIMO ŻE WYŁĄCZENIE Z UŻYTKU MA WŁASNY WPIS ══
 * Wyłączenie maszyny na konkretne dni jest wierszem `kind = block` i odbija się
 * o ograniczenie bazy. `service_status = disabled` to co innego: maszyna jest poza
 * służbą BEZ TERMINU - nie ma z czym się nakładać, więc baza nic tu nie powie.
 * Stąd osobna reguła; bez niej dałoby się zaplanować sobotę czymś, czego klub
 * w ogóle nie wypuszcza.
 */
export function refuseCreate(
  booking: BookingWindow & { kind: BookingKind },
  now: number,
  /** `null` = maszyny nie ma W TYM KLUBIE (cudza albo skasowana). */
  aircraft: { serviceStatus: ServiceStatus | null },
): BookingRefusal | null {
  if (aircraft.serviceStatus == null) return 'aircraft_not_found';
  // Stanu służby pyta WYŁĄCZNIE rezerwacja lotu. Wyłączenie z użytku na konkretne
  // dni wpisuje się także maszynie już stojącej w serwisie - przegląd zaplanowany
  // na takiej jednostce jest zwyczajną sytuacją.
  if (booking.kind === 'flight' && aircraft.serviceStatus !== 'active') {
    return 'aircraft_disabled';
  }
  return refuseWindow(booking, now);
}

/**
 * Kto pyta. `manages` = zdolność `reservations.manage` (panel, rola `admin`) - władza
 * nad CUDZYM planem. Pilot bez niej rozporządza wyłącznie swoim.
 */
export interface BookingActor {
  pilotId: string;
  manages: boolean;
}

/** Rezerwacja widziana przez regułę - tyle, ile trzeba, żeby orzec. */
export interface BookingSubject {
  kind: BookingKind;
  status: BookingStatus;
  /** `null` przy `kind = 'block'` - wyłączenie z użytku nie ma właściciela. */
  pilotId: string | null;
  endsAt: number;
}

/**
 * Zmiana rezerwacji (przesunięcie, zmiana zadania) - odmowa albo `null`.
 *
 * Kolejność sprawdzeń jest kolejnością POWAGI: najpierw „to nie jest twoje", potem
 * „to już się zamknęło", na końcu „to już minęło". Odpowiedź ma być tą, którą wołający
 * naprawdę musi przeczytać - a `not_your_booking` przy cudzej rezerwacji sprzed
 * tygodnia jest ważniejsze niż informacja o jej wieku.
 *
 * **Wyłączenia z użytku (`kind = 'block'`) nie rusza NIKT bez `manages`** - także
 * ten, kto je wpisał. To jest stan MASZYNY, nie czyjś plan; własność wpisu nie daje
 * tu żadnych praw, bo wpis nie należy do człowieka.
 */
export function refuseChange(
  subject: BookingSubject,
  actor: BookingActor,
  now: number,
): BookingRefusal | null {
  if (!ownedBy(subject, actor)) return 'not_your_booking';
  if (!holdsSlot(subject.status)) return 'booking_closed';
  if (subject.endsAt <= now) return 'booking_in_past';
  return null;
}

/**
 * Odwołanie rezerwacji - odmowa albo `null`.
 *
 * Różni się od zmiany DWOMA rzeczami:
 *  1. **termin, który minął, wolno odwołać** - i to nie jest wyjątek dla wygody, tylko
 *     jedyna droga do zamknięcia zapisu, po który nikt nie przyszedł, zanim zadanie
 *     okresowe (§4.1) zdąży go zwolnić. Slot i tak jest już wolny, więc odwołanie
 *     niczego nie zmienia w kalendarzu - zmienia zapis;
 *  2. **odwołanie CUDZEJ wymaga POWODU** (P4, decyzja właściciela 2026-09-19). Pilot,
 *     któremu ktoś zdjął sobotę, czyta w aplikacji dlaczego - a puste pole zamieniłoby
 *     tę wiadomość w samo zniknięcie wiersza. Własną odwołuje się bez tłumaczenia:
 *     nie ma komu.
 */
export function refuseCancel(
  subject: BookingSubject,
  actor: BookingActor,
  reason: string | null,
): BookingRefusal | null {
  if (!ownedBy(subject, actor)) return 'not_your_booking';
  if (!holdsSlot(subject.status)) return 'booking_closed';
  // Wyłączenie z użytku nie ma właściciela, więc nie ma komu tłumaczyć - jego ślad
  // zostaje w audycie panelu (`booking.block`). Powodu żąda wyłącznie zdjęcie
  // CUDZEGO PLANU: pilot, któremu ktoś zabrał sobotę, czyta w aplikacji dlaczego.
  if (subject.kind === 'flight' && !isOwner(subject, actor) && !hasText(reason)) {
    return 'reason_required';
  }
  return null;
}

/**
 * Czy wołający ma w ogóle prawo dotknąć tego wpisu: właściciel rezerwacji lotu albo
 * ktoś ze zdolnością `reservations.manage`.
 */
function ownedBy(subject: BookingSubject, actor: BookingActor): boolean {
  if (actor.manages) return true;
  return isOwner(subject, actor);
}

function isOwner(subject: BookingSubject, actor: BookingActor): boolean {
  return subject.kind === 'flight' && subject.pilotId === actor.pilotId;
}

function hasText(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
