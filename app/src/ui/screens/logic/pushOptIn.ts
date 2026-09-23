/**
 * Ninerdeck - KIEDY PROSIĆ O ZGODĘ NA POWIADOMIENIA (3.1.0, epik R-J, J3).
 *
 * Decyzja właściciela 2026-09-23: „po otwarciu aplikacji, gdy osoba jest akceptującym,
 * lub gdy zalogowana osoba złoży rezerwację" - a nie na powitanie. Prośba jest MIĘKKA
 * (odmowa niczego nie blokuje, §4.1): pilot bez zgody dalej ma skrzynkę, tylko nikt
 * go nie szturchnie.
 *
 * Dwa momenty, dwa powody:
 *  - `approver`: Pulpit wie z serwera, że ta osoba rozstrzyga cudze terminy
 *    (`approver` w odpowiedzi skrzynki) - jej dotyczy każda prośba o zgodę;
 *  - `pending_booking`: rezerwacja właśnie złożona CZEKA na zgodę - pilot ma się
 *    dowiedzieć o decyzji bez otwierania aplikacji. Rezerwacja potwierdzona od razu
 *    (klub bez ścieżki) nie rodzi żadnego powiadomienia, więc prośba przy niej pytałaby
 *    o zgodę na nic.
 *
 * Bramka pilnuje, żeby w JEDNYM uruchomieniu aplikacji pytać RAZ: system i tak nie
 * powtarza dialogu po zgodzie, a po dwóch odmowach odpowiada cicho - ale drugie
 * wywołanie w tym samym przebiegu byłoby drugim skokiem ekranu bez treści.
 */

export type PushOptInReason = 'approver' | 'pending_booking';

/** Powód prośby przy wejściu na Pulpit; `undefined` = serwer sprzed 3.1.0 albo bez zasięgu. */
export function optInOnDashboard(approver: boolean | undefined): PushOptInReason | null {
  return approver === true ? 'approver' : null;
}

/** Powód prośby po zapisie rezerwacji - wyłącznie takiej, która czeka na zgodę. */
export function optInAfterBooking(status: string): PushOptInReason | null {
  return status === 'pending' ? 'pending_booking' : null;
}

/** Jedna prośba na uruchomienie aplikacji. */
export class PushOptInGate {
  private asked = false;

  /** `true` = pytaj teraz; potem już nie, dopóki proces żyje. */
  take(reason: PushOptInReason | null): reason is PushOptInReason {
    if (reason == null || this.asked) return false;
    this.asked = true;
    return true;
  }
}
