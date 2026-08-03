/**
 * UZ Aero (serwer) — kiedy panel MUSI odmówić zmiany na koncie.
 *
 * Ten plik istnieje z powodu, który zdarzył się naprawdę: 2026-08-01 administrator nie
 * mógł wejść do systemu, bo w całym produkcie nie było ŻADNEJ ścieżki zmiany hasła —
 * seed nie nadpisuje `password_hash`, CLI nie ma, panelu kont nie było. Wyjściem był
 * ręczny `UPDATE` z hashem policzonym poza aplikacją. Ekran A06 tę dziurę zamyka,
 * ale otwiera drugą, gorszą: jeden klik potrafi zostawić klub bez nikogo, kto zarządza
 * kontami — a ścieżki ratunkowej nadal nie ma.
 *
 * Stąd trzy zakazy, wypisane jako CZYSTE FUNKCJE, nie jako `if`-y w komendzie:
 *  1. nie deaktywujesz własnego konta,
 *  2. nie odbierasz sobie roli administratora,
 *  3. nie odbierasz roli OSTATNIEMU aktywnemu administratorowi.
 *
 * Dlaczego osobny plik, a nie warunki w `commands/pilots.ts`: to jest ta sama zasada,
 * co w `roles.ts` — pytanie „czego panel NIE MOŻE zrobić z kontem" ma mieć jedną
 * odpowiedź, w jednym pliku, który da się przeczytać w całości i pokryć testem bez
 * bazy. Reguły rozsiane po transakcji są konstrukcją, w której nikt nie wie, czy zna
 * wszystkie.
 *
 * **Odmowa jest JAWNA i niesie powód.** Ukrycie przycisku byłoby gorsze niż odmowa:
 * administrator zgadywałby, czy funkcji nie ma w produkcie, czy nie ma jej on
 * (`design/admin/`, reguła „nigdy cichy brak").
 */

import type { PilotRole } from './roles.ts';

/**
 * Powód odmowy. Kody są SUROWE i takie jadą na drut — nazwanie ich po polsku jest
 * sprawą panelu, dokładnie jak przy `AdminAction` (serwer nie zna języka interfejsu).
 */
export type AccountRefusal =
  /** Deaktywacja własnego konta — administrator odciąłby sam siebie. */
  | 'self_deactivate'
  /** Odebranie sobie roli administratora — to samo odcięcie, inną drogą. */
  | 'self_demote'
  /** Ostatni AKTYWNY administrator traci rolę albo dostęp — klub zostaje bez nikogo. */
  | 'last_admin'
  /** Reset hasła konta nieaktywnego — hasło bez dostępu do niczego nie prowadzi. */
  | 'inactive_account';

export interface RoleChange {
  actorPilotId: string;
  targetPilotId: string;
  currentRole: PilotRole;
  nextRole: PilotRole;
  /** Czy konto celu jest aktywne — nieaktywny administrator nie liczy się do puli. */
  targetActive: boolean;
  /** Ile kont AKTYWNYCH ma dziś rolę `admin`, łącznie z celem zmiany. */
  activeAdmins: number;
}

/**
 * Zmiana roli: odmowa albo `null`.
 *
 * Pilnujemy wyłącznie ODEBRANIA roli administratora — nadanie jej komukolwiek jest
 * bezpieczne w tym sensie, o który tu chodzi (nie zmniejsza liczby ludzi zdolnych
 * naprawić system). Rola `training_lead` nie ma zdolności `accounts.manage`, więc jej
 * odebranie nikogo nie zamyka poza panelem kont.
 */
export function refuseRoleChange(change: RoleChange): AccountRefusal | null {
  if (change.nextRole === change.currentRole) return null;
  if (change.currentRole !== 'admin') return null;

  if (change.actorPilotId === change.targetPilotId) return 'self_demote';
  // Nieaktywny administrator nie trzyma nikogo przy życiu, więc jego degradacja
  // nie może być ostatnią kroplą — do puli liczą się wyłącznie konta aktywne.
  if (change.targetActive && change.activeAdmins <= 1) return 'last_admin';
  return null;
}

export interface ActiveChange {
  actorPilotId: string;
  targetPilotId: string;
  currentRole: PilotRole;
  activeAdmins: number;
}

/**
 * Deaktywacja: odmowa albo `null`.
 *
 * Warunek „ostatni administrator" wyglądał na nadmiarowy obok blokady na sobie samym
 * (działający administrator sam jest aktywnym administratorem, więc cudze konto niby
 * nigdy nie jest ostatnie) — i to rozumowanie było prawdziwe wyłącznie w jednym
 * żądaniu naraz. Od 2026-08-01 gałąź jest OSIĄGALNA: mutacje zmieniające populację
 * administratorów szereguje blokada advisory (`PilotsAdminPort.lockAdminPopulation`),
 * więc druga transakcja wyścigu liczy administratorów PO pierwszej i widzi, że jej
 * własny actor przestał już nim być. Wtedy cudze konto naprawdę jest ostatnie.
 * Przypadki: `test/adminAccounts.test.ts`, „wyścig o populację administratorów".
 */
export function refuseDeactivate(change: ActiveChange): AccountRefusal | null {
  if (change.actorPilotId === change.targetPilotId) return 'self_deactivate';
  if (change.currentRole === 'admin' && change.activeAdmins <= 1) return 'last_admin';
  return null;
}

/**
 * Reset hasła konta NIEAKTYWNEGO nie ma skutku, którego administrator oczekuje: konto
 * i tak nie zaloguje się ani w aplikacji, ani w panelu (`AuthCommands.verifyCredentials`
 * odbija `account_disabled` PO sprawdzeniu hasła). Wydane wtedy hasło startowe byłoby
 * poświadczeniem bez powodu, a administrator uznałby sprawę za załatwioną.
 *
 * Mockup A06 mówi to samo w wierszu listy: „Reset hasła" jest przy koncie nieaktywnym
 * wyszarzony z podpowiedzią „Konto nieaktywne — najpierw aktywuj".
 */
export function refusePasswordReset(targetActive: boolean): AccountRefusal | null {
  return targetActive ? null : 'inactive_account';
}
