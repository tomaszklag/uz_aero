/**
 * Ninerdeck (serwer) - kiedy panel MUSI odmówić zmiany na koncie.
 *
 * Ten plik istnieje z powodu, który zdarzył się naprawdę: 2026-08-01 administrator nie
 * mógł wejść do systemu, bo w całym produkcie nie było ŻADNEJ ścieżki zmiany hasła -
 * seed nie nadpisuje `password_hash`, CLI nie ma, panelu kont nie było. Wyjściem był
 * ręczny `UPDATE` z hashem policzonym poza aplikacją. Ekran A06 tę dziurę zamyka,
 * ale otwiera drugą, gorszą: jeden klik potrafi zostawić klub bez nikogo, kto zarządza
 * kontami - a ścieżki ratunkowej nadal nie ma.
 *
 * Stąd trzy zakazy, wypisane jako CZYSTE FUNKCJE, nie jako `if`-y w komendzie:
 *  1. nie deaktywujesz własnego konta,
 *  2. nie odbierasz sobie zdolności `accounts.manage`,
 *  3. nie odbierasz jej OSTATNIEMU aktywnemu nosicielowi w klubie.
 *
 * ══ OŚ PRZESZŁA Z ROLI NA ZDOLNOŚĆ (epik #197) ══
 * Do 3.1.0 zapora pytała o rolę `admin`, bo rola nadawała wszystko naraz. Odkąd
 * zdolności nadaje się pojedynczo, „administrator" przestał być bytem - a klub
 * zamyka się dokładnie wtedy, gdy nikt nie ma `accounts.manage`, bo tylko ta
 * zdolność potrafi nadać komukolwiek cokolwiek. Pozostałe można odebrać do zera
 * i klub żyje dalej: nie będzie miał kto rozwiązywać flag, ale będzie miał kto
 * przywrócić prawa.
 *
 * **Ta sama zapora obejmuje TRZY drogi**: odebranie zdolności, wyłączenie
 * członkostwa i usunięcie konta. Pilnowanie jednej z nich zamykałoby klub
 * pozostałymi dwiema.
 *
 * Dlaczego osobny plik, a nie warunki w `commands/pilots.ts`: to jest ta sama zasada,
 * co w `roles.ts` - pytanie „czego panel NIE MOŻE zrobić z kontem" ma mieć jedną
 * odpowiedź, w jednym pliku, który da się przeczytać w całości i pokryć testem bez
 * bazy. Reguły rozsiane po transakcji są konstrukcją, w której nikt nie wie, czy zna
 * wszystkie.
 *
 * **Odmowa jest JAWNA i niesie powód.** Ukrycie przycisku byłoby gorsze niż odmowa:
 * administrator zgadywałby, czy funkcji nie ma w produkcie, czy nie ma jej on
 * (`design/admin/`, reguła „nigdy cichy brak").
 */

import { can, type Capability } from './roles.ts';

/**
 * Powód odmowy. Kody są SUROWE i takie jadą na drut - nazwanie ich po polsku jest
 * sprawą panelu, dokładnie jak przy `AdminAction` (serwer nie zna języka interfejsu).
 */
export type AccountRefusal =
  /** Deaktywacja własnego konta - administrator odciąłby sam siebie. */
  | 'self_deactivate'
  /** Odebranie sobie zdolności `accounts.manage` - to samo odcięcie, inną drogą. */
  | 'self_demote'
  /** Ostatni AKTYWNY nosiciel `accounts.manage` traci ją albo dostęp - klub zostaje bez nikogo. */
  | 'last_admin'
  /**
   * Konto nieaktywne przy operacji, która wymaga działającego dostępu.
   *
   * Do 2026-09-04 wystawiał go WYŁĄCZNIE reset hasła; hasła znikły, a wariant został,
   * bo zatwierdzenie zgłoszenia pyta o to samo (konto wyłączone nie ma czego podpiąć).
   */
  | 'inactive_account'
  /** Usunięcie własnego konta - to samo odcięcie, co deaktywacja, tylko nieodwracalne. */
  | 'self_delete'
  /** Usunięcie konta, które nadal ma dostęp - patrz `refuseDelete`. */
  | 'account_active'
  /** Usunięcie konta, do którego coś się odwołuje - zostałaby historia bez właściciela. */
  | 'has_history';

export interface ScopeChange {
  actorPilotId: string;
  targetPilotId: string;
  currentCapabilities: readonly Capability[];
  nextCapabilities: readonly Capability[];
  /** Czy członkostwo celu jest aktywne - nieaktywny nosiciel nie liczy się do puli. */
  targetActive: boolean;
  /** Ile AKTYWNYCH członkostw klubu ma dziś `accounts.manage`, łącznie z celem. */
  activeManagers: number;
}

/**
 * Zmiana zakresu: odmowa albo `null`.
 *
 * Pilnujemy WYŁĄCZNIE odebrania `accounts.manage` - nadanie czegokolwiek jest
 * bezpieczne w tym sensie, o który tu chodzi (nie zmniejsza liczby ludzi zdolnych
 * naprawić system), a odebranie pozostałych zdolności odbiera funkcje, nie drogę
 * powrotu: zostaje ktoś, kto potrafi je nadać z powrotem.
 */
export function refuseScopeChange(change: ScopeChange): AccountRefusal | null {
  const had = can(change.currentCapabilities, 'accounts.manage');
  const has = can(change.nextCapabilities, 'accounts.manage');
  if (!had || has) return null;

  if (change.actorPilotId === change.targetPilotId) return 'self_demote';
  // Nieaktywny nosiciel nie trzyma nikogo przy życiu, więc odebranie mu zdolności
  // nie może być ostatnią kroplą - do puli liczą się wyłącznie członkostwa aktywne.
  if (change.targetActive && change.activeManagers <= 1) return 'last_admin';
  return null;
}

export interface ActiveChange {
  actorPilotId: string;
  targetPilotId: string;
  /** Czy WYŁĄCZANE członkostwo ma dziś `accounts.manage`. */
  targetManagesAccounts: boolean;
  /** Ile AKTYWNYCH członkostw klubu ma dziś tę zdolność, łącznie z celem. */
  activeManagers: number;
}

/**
 * Deaktywacja: odmowa albo `null`.
 *
 * Warunek „ostatni administrator" wyglądał na nadmiarowy obok blokady na sobie samym
 * (działający administrator sam nosi `accounts.manage`, więc cudze konto niby
 * nigdy nie jest ostatnie) - i to rozumowanie było prawdziwe wyłącznie w jednym
 * żądaniu naraz. Od 2026-08-01 gałąź jest OSIĄGALNA: mutacje zmieniające populację
 * nosicieli szereguje blokada advisory (`PilotsAdminPort.lockAdminPopulation`),
 * więc druga transakcja wyścigu liczy administratorów PO pierwszej i widzi, że jej
 * własny actor przestał już nim być. Wtedy cudze konto naprawdę jest ostatnie.
 * Przypadki: `test/adminAccounts.test.ts`, „wyścig o populację administratorów".
 */
export function refuseDeactivate(change: ActiveChange): AccountRefusal | null {
  if (change.actorPilotId === change.targetPilotId) return 'self_deactivate';
  if (change.targetManagesAccounts && change.activeManagers <= 1) return 'last_admin';
  return null;
}

/**
 * Stan konta w chwili próby USUNIĘCIA - wszystko, czego potrzebuje reguła niżej.
 *
 * `references` to LICZBA odwołań do tego konta w całym systemie: zdarzenia (jako PIC
 * i jako drugi pilot), sesje oraz wpisy dziennika audytu, w których konto jest sprawcą.
 * Liczy je repozytorium jednym zapytaniem - domena nie zna SQL-a, ale zna regułę.
 */
export interface AccountDeletion {
  actorPilotId: string;
  targetPilotId: string;
  targetActive: boolean;
  references: number;
}

/**
 * Usunięcie konta - odmowa albo `null`.
 *
 * ══ USUWANIE JEST DWUSTOPNIOWE, A DRUGI WARUNEK NIE JEST FORMALNOŚCIĄ ══
 * Kasujemy wyłącznie konto, które JUŻ JEST WYŁĄCZONE - i nie z ostrożności, tylko
 * dlatego, że telefon nie ma ścieżki usuwania wiersza: `referenceSync` w aplikacji
 * pilota robi wyłącznie `upsertPilots`, nigdy `delete`. Konto skasowane na serwerze
 * zostałoby więc na każdym telefonie, który zdążył się zsynchronizować - z ostatnim
 * znanym stanem, czyli AKTYWNE. Wyłączenie przechodzi natomiast normalną drogą
 * (`active: false` jedzie w `GET /reference`, a aplikacja po tym polu filtruje), więc
 * kolejność „wyłącz → poczekaj na sync → usuń" zamyka dziurę mechanizmem, który już
 * istnieje: bez zmiany w aplikacji i bez wydania APK.
 *
 * Tombstone w `/reference` (serwer mówi „tego już nie ma", telefon kasuje wiersz) jest
 * właściwym docelowym rozwiązaniem i zdejmie ten warunek - ale wymaga zmiany kontraktu
 * ORAZ aplikacji, a starsze buildy w terenie i tak nigdy nie skasują wiersza.
 *
 * `references > 0` blokuje TWARDO i bez wyjątków: w tym schemacie jest DOKŁADNIE JEDEN
 * klucz obcy (`refresh_tokens.pilot_id`), a `events`, `sessions` i `admin_audit`
 * wskazują konto zwykłym tekstem. Baza nie powstrzymałaby więc kasowania - powstrzymuje
 * ta funkcja, a osierocona historia jest nie do naprawienia po fakcie.
 */
export function refuseDelete(deletion: AccountDeletion): AccountRefusal | null {
  if (deletion.actorPilotId === deletion.targetPilotId) return 'self_delete';
  if (deletion.targetActive) return 'account_active';
  if (deletion.references > 0) return 'has_history';
  return null;
}

/**
 * ZATWIERDZENIE ZGŁOSZENIA kodem klubu (issue #100, D2) - odmowa albo `null`.
 *
 * Jeden warunek i jest nim blokada PLATFORMOWA osoby (`pilots.active = false`), nałożona
 * przez superadministratora. Zatwierdzenie zgłoszenia takiej osoby dałoby członkostwo
 * `active`, którego brama i tak nie przepuści (`authorizeOrg` pyta o koniunkcję: osoba,
 * klub, członkostwo) - czyli wiersz wyglądający na wpuszczony i człowiek, który nie
 * wchodzi. Administrator klubu nie ma jak tej blokady zdjąć, więc musi ją ZOBACZYĆ
 * jako odmowę z powodem, a nie domyślić się z nieudanego logowania pilota.
 *
 * Populacji administratorów ta operacja nie pilnuje i pilnować nie ma czego: zatwierdzenie
 * wyłącznie DODAJE członka (także administratora), a `refuseRoleChange` i `refuseDeactivate`
 * bronią przed odejmowaniem.
 */
export function refuseApprove(person: { active: boolean }): AccountRefusal | null {
  return person.active ? null : 'inactive_account';
}
