/**
 * UZ Aero — panel: DOSTĘPNOŚĆ AKCJI na koncie i komunikaty odmowy (moduł CZYSTY).
 *
 * Dwie rzeczy naraz, bo to jest jedna decyzja widziana z dwóch stron:
 *  • **przed kliknięciem** — czy przycisk działa i co napisać obok kłódki;
 *  • **po kliknięciu** — co powiedzieć, gdy serwer odmówił.
 * Rozdzielenie ich do dwóch plików rozjechałoby powody: przycisk mówiłby jedno,
 * a odmowa drugie, o tej samej zasadzie.
 *
 * ══ PRZYCISK JEST WIDOCZNY I ZABLOKOWANY, NIGDY UKRYTY ══
 * Reguła z mockupu A06 („Szef wyszkolenia widzi tę listę, ale bez przycisków") znaczy
 * WYSZARZONE, a nie nieobecne. Ukrycie zmusza człowieka do zgadywania, czy funkcji nie
 * ma w produkcie, czy nie ma jej ON — a to dwie różne rozmowy z administratorem.
 *
 * **To nie jest zabezpieczenie.** Egzekwuje serwer, przy każdym żądaniu, świeżą rolą
 * z konta (`server/src/http/authorize.ts`). Tutaj rozstrzygamy wyłącznie, co widzi oko.
 */

import type { ApiErrorDto, Capability, PilotListItemDto, PilotRefusalDto } from '../../api/dto';
import { can, denialReason } from '../../auth/can';

export interface AccountAction {
  enabled: boolean;
  /** Powód blokady — WIDOCZNY przy przycisku; `null` = akcja dostępna. */
  reason: string | null;
}

const ALLOWED: AccountAction = { enabled: true, reason: null };

const NEEDS_CAPABILITY: AccountAction = {
  enabled: false,
  reason: denialReason('accounts.manage'),
};

/** Czy konto zalogowane w panelu w ogóle zarządza kontami. */
export function canManage(capabilities: readonly Capability[] | undefined): boolean {
  return can(capabilities, 'accounts.manage');
}

/**
 * Reset hasła. Konto NIEAKTYWNE odpada, bo hasło i tak nie zaloguje — serwer odmawia
 * tak samo (`inactive_account`), a mockup A06 wyszarza ten przycisk w wierszu
 * z podpowiedzią „Konto nieaktywne — najpierw aktywuj".
 */
export function resetAction(
  pilot: PilotListItemDto,
  capabilities: readonly Capability[] | undefined,
): AccountAction {
  if (!canManage(capabilities)) return NEEDS_CAPABILITY;
  if (!pilot.active) {
    return { enabled: false, reason: 'Konto nieaktywne — najpierw aktywuj' };
  }
  return ALLOWED;
}

/**
 * Deaktywacja i aktywacja. Blokujemy WYŁĄCZNIE własne konto — „ostatniego
 * administratora" panel policzyłby po swojemu i mógłby się pomylić (lista bywa
 * zawężona filtrem), a serwer i tak zna prawdę. Odmowa serwera ma wtedy komunikat
 * w `refusalText`, a przycisk zostaje klikalny: lepiej dostać jasne „nie, bo jesteś
 * ostatni", niż patrzeć na kłódkę z powodem policzonym z niepełnych danych.
 */
export function activeAction(
  pilot: PilotListItemDto,
  capabilities: readonly Capability[] | undefined,
  selfId: string | null,
): AccountAction {
  if (!canManage(capabilities)) return NEEDS_CAPABILITY;
  if (pilot.active && pilot.id === selfId) {
    return { enabled: false, reason: 'To Twoje konto — nie odetniesz sam siebie' };
  }
  return ALLOWED;
}

/** Zmiana tożsamości i roli — jedyny warunek to zdolność. */
export function editAction(capabilities: readonly Capability[] | undefined): AccountAction {
  return canManage(capabilities) ? ALLOWED : NEEDS_CAPABILITY;
}

/**
 * Powody odmowy serwera po polsku. `Record` wymusza komplet: dopisanie kodu
 * w `server/src/domain/accountGuards.ts` wywali kompilację tutaj, zamiast pokazać
 * administratorowi surowy `last_admin`.
 */
const REFUSAL_TEXT: Record<PilotRefusalDto, string> = {
  self_deactivate:
    'To Twoje konto. Deaktywacja odcięłaby Cię od panelu, a ścieżki powrotu nie ma — konta zakłada i odblokowuje wyłącznie administrator z panelu.',
  self_demote:
    'To Twoje konto. Odebranie sobie roli administratora działa dokładnie jak deaktywacja: stracisz tę sekcję i nie będzie komu jej odzyskać.',
  last_admin:
    'To ostatnie aktywne konto z rolą administratora. Klub zostałby bez nikogo, kto zarządza kontami, flotą i progami — najpierw nadaj tę rolę komuś jeszcze.',
  inactive_account:
    'Konto jest nieaktywne, więc hasło i tak nikogo nie zaloguje. Najpierw aktywuj konto, potem zresetuj hasło.',
};

export function refusalText(refusal: PilotRefusalDto): string {
  return REFUSAL_TEXT[refusal];
}

/**
 * Czy to odmowa dotycząca KONTA.
 *
 * Potrzebne od 2026-08-01, gdy `ApiErrorDto.reason` przestało być polem jednego
 * ekranu: odmowy floty (`open_session`, `capacity_not_positive`) jadą tą samą kopertą
 * `409 refused`. Bez tego strażnika ekran kont zawołałby `REFUSAL_TEXT` kluczem, którego
 * ta mapa nie ma, i pokazał `undefined` w miejscu wyjaśnienia zasady.
 */
export function isPilotRefusal(value: unknown): value is PilotRefusalDto {
  return typeof value === 'string' && Object.hasOwn(REFUSAL_TEXT, value);
}

export interface AccountFailure {
  tone: 'danger' | 'warn';
  title: string;
  detail: string;
  /**
   * `true` = ponawianie nie ma sensu, bo świat się zmienił albo zasada jest twarda.
   * Formularz ma wtedy przestać zapraszać do drugiej próby.
   */
  final: boolean;
}

/**
 * Odpowiedź serwera → komunikat odmowy.
 *
 * Przyjmuje STATUS i CIAŁO, a nie wyjątek: pytanie „co powiedzieć człowiekowi" nie ma
 * nic wspólnego z tym, jakiej klasy błąd rzucił klient HTTP — i dzięki temu ten plik
 * testuje się w Node, bez sieci (wzorzec `flagResolve.ts`, `correctionResult.ts`).
 */
export function accountFailure(status: number | null, body: ApiErrorDto | null): AccountFailure {
  if (status === 409 && body?.error === 'refused' && isPilotRefusal(body.reason)) {
    return {
      tone: 'warn',
      title: 'Serwer odmówił tej zmiany.',
      detail: refusalText(body.reason),
      final: true,
    };
  }

  if (status === 409 && body?.error === 'conflict') {
    const field = body.field === 'email' ? 'e-mail' : 'kod pilota';
    return {
      tone: 'danger',
      title: `Ten ${field} jest już zajęty.`,
      detail:
        field === 'kod pilota'
          ? 'Kod pilota musi być unikalny w całym systemie — widać go w logu dnia i w kartach arkusza. Wybierz inny.'
          : 'E-mail jest loginem, więc może należeć tylko do jednego konta. Sprawdź, czy pilot nie ma już konta w klubie.',
      final: false,
    };
  }

  if (status === 400 && body?.error === 'no_changes') {
    return {
      tone: 'warn',
      title: 'Nic się nie zmieniło.',
      detail:
        'Serwer nie zapisuje pustych zmian, żeby dziennik audytu nie zapełniał się wpisami o niczym. Zmień pole albo zamknij szufladę.',
      final: false,
    };
  }

  if (status === 400) {
    return {
      tone: 'danger',
      title: 'Serwer odrzucił dane konta.',
      detail:
        'Kod pilota to 2–10 liter i cyfr, nazwisko co najmniej dwa znaki, e-mail musi wyglądać jak adres. Popraw pola i spróbuj ponownie.',
      final: false,
    };
  }

  if (status === 403) {
    return {
      tone: 'warn',
      title: 'Twoja rola nie obejmuje zarządzania kontami.',
      detail: `${denialReason('accounts.manage')}. Listę kont czyta każdy, kto ma wejście do panelu — zmienia ją węższa zdolność.`,
      final: true,
    };
  }

  if (status === 401) {
    return {
      tone: 'danger',
      title: 'Twoja sesja panelu wygasła albo konto zostało wyłączone.',
      detail:
        'Panel czyta rolę i status konta przy KAŻDYM żądaniu, więc odebranie dostępu działa natychmiast. Zaloguj się ponownie — jeśli to nie pomoże, poproś drugiego administratora.',
      final: true,
    };
  }

  if (status === 404) {
    return {
      tone: 'warn',
      title: 'Tego konta nie ma w bazie.',
      detail:
        'Adres wskazuje identyfikator, którego serwer nie zna. Kont nie kasujemy — deaktywacja zostawia wiersz — więc pomyłka jest raczej w adresie. Wróć do listy i otwórz konto z tabeli.',
      final: true,
    };
  }

  if (status == null) {
    return {
      tone: 'danger',
      title: 'Brak połączenia z serwerem.',
      detail:
        'Panel działa wyłącznie online, a zmiana konta musi zapisać się razem ze śladem audytu. Nie wiadomo, czy żądanie doszło — odśwież listę, zanim spróbujesz ponownie.',
      final: false,
    };
  }

  return {
    tone: 'danger',
    title: 'Zmiana konta nie powiodła się.',
    detail: `Serwer odpowiedział kodem ${status}. Jeśli to się powtarza, sprawdź dziennik audytu — zmiana albo się zapisała, albo nie zaszła w ogóle.`,
    final: false,
  };
}

/**
 * ══ DWA RODZAJE SESJI I DLACZEGO LICZBA OPISUJE TYLKO JEDEN ══
 *
 * `revokedSessions` z odpowiedzi serwera liczy WYŁĄCZNIE refresh tokeny telefonu —
 * bo tylko one mają wiersz w bazie, który dało się skasować i policzyć. Sesja panelu
 * to podpisany JWT w ciasteczku `HttpOnly`: nie ma jej w żadnej tabeli, więc nikt jej
 * nie zliczał i zliczyć nie może. Odbiera ją znacznik `credentials_valid_from` — brama
 * odrzuca token wydany przed resetem albo deaktywacją (`pilots.credentials_valid_from`).
 *
 * Dlatego komunikaty niżej mówią o obu rodzajach OSOBNO i pozostają prawdziwe także
 * przy `revokedSessions === 0`: „ten pilot nie miał aktywnych sesji" byłoby wtedy
 * zdaniem fałszywym o panelu.
 */
export interface SecretCopy {
  title: string;
  note: string;
}

export interface ActiveChangeCopy {
  title: string;
  note: string;
}

/**
 * Baner po zmianie dostępu do konta (`A06a`, po deaktywacji albo aktywacji).
 *
 * Mieszka TUTAJ, a nie w JSX-ie szuflady, z tego samego powodu co `secretCopy`:
 * składanie napisu z liczby jest decyzją o treści, a nie układem. Do 2026-08-01
 * ekran sklejał to w `.tsx` i wychodziło z tego „Unieważniono 1 sesji" — mimo że
 * funkcja odmieniająca stała obok, miała test i jednego użytkownika.
 */
export function activeChangeCopy(active: boolean, revokedSessions: number): ActiveChangeCopy {
  if (active) {
    return {
      title: 'Konto aktywowane.',
      note:
        'Pilot zaloguje się swoim dotychczasowym hasłem; jeśli go nie pamięta, zresetuj je niżej. ' +
        'Sesje sprzed deaktywacji zostają martwe — przywrócenie dostępu nie ożywia poświadczeń, ' +
        'które ktoś mógł w międzyczasie skopiować.',
    };
  }

  return {
    title: 'Konto deaktywowane — dostęp zniknął natychmiast.',
    note:
      `${phoneSessions(revokedSessions)} Sesja panelu (jeśli ten pilot ją miał) przestała działać ` +
      'w tej samej chwili: serwer odrzuca poświadczenie wydane przed deaktywacją, więc odcięcie ' +
      'nie czeka na wygaśnięcie ośmiogodzinnego tokenu.',
  };
}

/** Zdanie o sesjach TELEFONU — jedyne, które opiera się na liczbie z serwera. */
function phoneSessions(revokedSessions: number): string {
  if (revokedSessions === 0) return 'Ten pilot nie miał żywych sesji telefonu.';
  return `Unieważniono ${revokedSessions} ${sessionWord(revokedSessions)} telefonu tego pilota.`;
}

/**
 * Co napisać nad hasłem pokazanym RAZ. Dwa wejścia (nowe konto, reset) to ta sama
 * szuflada, ale inne konsekwencje: po resecie pilot traci wszystkie sesje i PIN,
 * po założeniu konta nie ma czego tracić.
 */
export function secretCopy(kind: 'create' | 'reset', revokedSessions: number): SecretCopy {
  if (kind === 'create') {
    return {
      title: 'Konto założone. Hasło startowe widzisz tylko teraz.',
      note: 'Przekaż je pilotowi kanałem, któremu ufasz. Przy pierwszym logowaniu w aplikacji pilot ustawia własny PIN — od tego momentu wchodzi PIN-em i offline.',
    };
  }
  return {
    title: 'Hasło zresetowane. Widzisz je tylko teraz.',
    note:
      `${phoneSessions(revokedSessions)} Sesja panelu — jeśli ją miał — przestała działać tak samo: ` +
      'stare poświadczenie nie przeżywa zmiany hasła, niezależnie od tego, ile sesji dało się ' +
      'policzyć. Pilot potrzebuje pełnego logowania przy sieci i ustawia PIN od nowa.',
  };
}

/** Odmiana rzeczownika „sesja" — trzy formy, jak wymaga polszczyzna. */
function sessionWord(n: number): string {
  if (n === 1) return 'sesję';
  const tens = n % 100;
  const ones = n % 10;
  if (ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14)) return 'sesje';
  return 'sesji';
}
