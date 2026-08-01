/**
 * UZ Aero — panel: DOSTĘPNOŚĆ AKCJI na flocie i komunikaty odmowy (moduł CZYSTY).
 *
 * Dwie rzeczy naraz, bo to jedna decyzja widziana z dwóch stron:
 *  • **przed kliknięciem** — czy przycisk działa i co napisać obok kłódki;
 *  • **po kliknięciu** — co powiedzieć, gdy serwer odmówił.
 * Rozdzielenie ich do dwóch plików rozjechałoby powody: przycisk mówiłby jedno,
 * a odmowa drugie, o tej samej zasadzie.
 *
 * ══ PRZYCISK JEST WIDOCZNY I ZABLOKOWANY, NIGDY UKRYTY ══
 * Reguła z mockupu A07 („Szef wyszkolenia czyta tę tabelę, ale bez przycisków edycji")
 * znaczy WYSZARZONE, a nie nieobecne. Ukrycie zmusza człowieka do zgadywania, czy
 * funkcji nie ma w produkcie, czy nie ma jej ON — a to dwie różne rozmowy
 * z administratorem.
 *
 * **To nie jest zabezpieczenie.** Egzekwuje serwer, przy każdym żądaniu, świeżą rolą
 * z konta (`server/src/http/authorize.ts`). Tutaj rozstrzygamy wyłącznie, co widzi oko.
 */

import { plural } from '@uzaero/format';

import type {
  AircraftListItemDto,
  ApiErrorDto,
  Capability,
  FleetRefusalDto,
} from '../../api/dto';
import { can, denialReason } from '../../auth/can';

export interface FleetAction {
  enabled: boolean;
  /** Powód blokady — WIDOCZNY przy przycisku; `null` = akcja dostępna. */
  reason: string | null;
}

const ALLOWED: FleetAction = { enabled: true, reason: null };

const NEEDS_CAPABILITY: FleetAction = {
  enabled: false,
  reason: denialReason('fleet.manage'),
};

/** Czy konto zalogowane w panelu w ogóle zmienia flotę. */
export function canManageFleet(capabilities: readonly Capability[] | undefined): boolean {
  return can(capabilities, 'fleet.manage');
}

/** Dodanie jednostki i edycja konfiguracji — jedyny warunek to zdolność. */
export function editAction(capabilities: readonly Capability[] | undefined): FleetAction {
  return canManageFleet(capabilities) ? ALLOWED : NEEDS_CAPABILITY;
}

/**
 * Wyłączenie ze służby. Blokujemy WYŁĄCZNIE przypadek, który panel zna na pewno:
 * jednostka ma otwarty dzień, a serwer podał tę liczbę w wierszu listy. Reszty nie
 * zgadujemy — odmowa serwera i tak przyjdzie z powodem (`refusalText`).
 */
export function disableAction(
  aircraft: AircraftListItemDto,
  capabilities: readonly Capability[] | undefined,
): FleetAction {
  if (!canManageFleet(capabilities)) return NEEDS_CAPABILITY;
  if (aircraft.openSessions > 0) {
    const n = aircraft.openSessions;
    return {
      enabled: false,
      reason: `Ta jednostka ma ${n} ${plural(n, 'otwarty dzień', 'otwarte dni', 'otwartych dni')} — najpierw poczekaj na zamknięcie`,
    };
  }
  return ALLOWED;
}

/**
 * Powody odmowy serwera po polsku. `Record` wymusza komplet: dopisanie kodu
 * w `server/src/domain/fleetGuards.ts` wywali kompilację tutaj, zamiast pokazać
 * administratorowi surowy `open_session`.
 */
const REFUSAL_TEXT: Record<FleetRefusalDto, string> = {
  capacity_not_positive:
    'Pojemność zbiorników musi być większa od zera. Z tej liczby wynika próg flagi FUEL_MISMATCH (większa z dwóch wartości: 10 L albo 5% pojemności) oraz limit wpisu tankowania — przy zerze próg cichcem spadłby do 10 L, a limit przestałby cokolwiek znaczyć.',
  open_session:
    'Ta jednostka ma otwarty dzień lotny. Wyłączenie zabrałoby ją z listy wyboru w chwili, w której ktoś już nią lata — poczekaj na zamknięcie dnia albo wyjaśnij sesję na liście dni.',
};

export function refusalText(refusal: FleetRefusalDto): string {
  return REFUSAL_TEXT[refusal];
}

/** Czy to odmowa dotycząca FLOTY — koperta `409 refused` jest wspólna dla wielu ekranów. */
export function isFleetRefusal(value: unknown): value is FleetRefusalDto {
  return typeof value === 'string' && Object.hasOwn(REFUSAL_TEXT, value);
}

export interface FleetFailure {
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
 * testuje się w Node, bez sieci (wzorzec `accountActions.ts`, `flagResolve.ts`).
 */
export function fleetFailure(status: number | null, body: ApiErrorDto | null): FleetFailure {
  if (status === 409 && body?.error === 'refused' && isFleetRefusal(body.reason)) {
    return {
      tone: 'warn',
      title: 'Serwer odmówił tej zmiany.',
      detail: refusalText(body.reason),
      final: body.reason === 'open_session',
    };
  }

  if (status === 409 && body?.error === 'conflict') {
    return {
      tone: 'danger',
      title: 'Ta rejestracja jest już zajęta.',
      detail:
        'Rejestracja musi być unikalna w całym systemie — widać ją w logu dnia, w nazwie karty arkusza i w każdej fladze. Sprawdź, czy ta maszyna nie jest już w rejestrze floty (także jako wyłączona ze służby: wyłączenia nie kasują wiersza).',
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
      title: 'Serwer odrzucił dane jednostki.',
      detail:
        'Rejestracja to 3–10 liter, cyfr i myślników, typ co najmniej dwa znaki, rok cztery cyfry albo puste pole, pojemność liczba w litrach. Popraw pola i spróbuj ponownie.',
      final: false,
    };
  }

  if (status === 403) {
    return {
      tone: 'warn',
      title: 'Twoja rola nie obejmuje zmian we flocie.',
      detail: `${denialReason('fleet.manage')}. Tabelę czyta każdy, kto ma wejście do panelu — zmienia ją węższa zdolność, bo konfiguracja floty steruje regułami po stronie serwera.`,
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
      title: 'Tej jednostki nie ma w rejestrze.',
      detail:
        'Adres wskazuje identyfikator, którego serwer nie zna. Samolotów nie kasujemy — wyłączenie ze służby zostawia wiersz — więc pomyłka jest raczej w adresie. Wróć do listy i otwórz jednostkę z tabeli.',
      final: true,
    };
  }

  if (status == null) {
    return {
      tone: 'danger',
      title: 'Brak połączenia z serwerem.',
      detail:
        'Panel działa wyłącznie online, a zmiana konfiguracji musi zapisać się razem ze śladem audytu. Nie wiadomo, czy żądanie doszło — odśwież listę, zanim spróbujesz ponownie.',
      final: false,
    };
  }

  return {
    tone: 'danger',
    title: 'Zapis konfiguracji nie powiódł się.',
    detail: `Serwer odpowiedział kodem ${status}. Jeśli to się powtarza, sprawdź dziennik audytu — zmiana albo się zapisała, albo nie zaszła w ogóle.`,
    final: false,
  };
}

/**
 * Stan pobrania floty widziany przez SZUFLADĘ — trzy przypadki, nie dwa.
 *
 * Do 2026-08-01 szuflada rozróżniała wyłącznie `isPending`, więc przy BŁĘDZIE pobrania
 * wklejony link do jednostki pokazywał „Zdejmij filtr albo wyszukiwanie" obok banera
 * „Nie udało się pobrać floty" — czyli kazał człowiekowi poprawiać zawężenie, którego
 * serwer w ogóle nie zdążył zastosować. Brak danych i awaria to dwie różne rozmowy.
 *
 * Wejściem są DWA zapytania, bo szuflada szuka wiersza w obu: liście zawężonej i pełnej
 * (`FleetScreen`). Dopóki którekolwiek jeszcze leci, nie wiadomo, czy jednostki nie ma;
 * gdy któreś padło, nie wiadomo nawet tyle.
 */
export type FleetLoad = 'loading' | 'error' | 'ready';

export interface QueryStatus {
  pending: boolean;
  error: boolean;
}

export function fleetLoad(list: QueryStatus, dictionary: QueryStatus): FleetLoad {
  // Awaria wygrywa z ładowaniem: gdy jedna z dwóch list padła, druga może się jeszcze
  // kręcić, a zdanie „wczytywanie floty…" byłoby wtedy obietnicą, której nikt nie spełni.
  if (list.error || dictionary.error) return 'error';
  if (list.pending || dictionary.pending) return 'loading';
  return 'ready';
}

export interface MissingCopy {
  /** Podpis pod tytułem szuflady. */
  sub: string;
  tone: 'status' | 'danger' | 'warn';
  title: string;
  note: string;
}

/** Głęboki link do jednostki, której nie ma na liście — co dokładnie o niej wiadomo. */
export function missingAircraftCopy(load: FleetLoad): MissingCopy {
  if (load === 'loading') {
    return {
      sub: 'wczytywanie floty…',
      tone: 'status',
      title: 'Flota jeszcze się pobiera.',
      note: 'Szuflada otwiera wiersz, który jest na liście — serwer nie ma osobnej trasy dla pojedynczej jednostki, bo klub ma ich kilka i pobranie całości jest tańsze niż druga trasa.',
    };
  }
  if (load === 'error') {
    return {
      sub: 'nie wiadomo — flota się nie pobrała',
      tone: 'danger',
      title: 'Nie wiadomo, czy ta jednostka istnieje.',
      note: 'Lista floty nie pobrała się, a jest jedynym źródłem wierszy — więc to NIE znaczy, że samolotu nie ma ani że wypadł spod filtra. Panel działa wyłącznie online: ponów pobranie listy pod spodem, zanim cokolwiek zmienisz.',
    };
  }
  return {
    sub: 'nie ma go w bieżącym zawężeniu listy',
    tone: 'warn',
    title: 'Tej jednostki nie ma w bieżącym zawężeniu.',
    note: 'Zdejmij filtr albo wyszukiwanie i otwórz samolot z tabeli. Samolotów nie kasujemy — wyłączenie ze służby zostawia wiersz — więc jednostka najczęściej po prostu wypadła spod chipa, którym patrzysz.',
  };
}

export interface SaveCopy {
  title: string;
  note: string;
}

/**
 * Komunikat po UDANYM zapisie.
 *
 * Mieszka tutaj, a nie w JSX-ie szuflady, z tego samego powodu co `activeChangeCopy`
 * przy kontach: składanie zdania z liczby jest decyzją o treści, a nie układem. A zdanie
 * ma tu jedną robotę — powiedzieć, że zmiana dotyczy PRZYSZŁOŚCI i kiedy zobaczą ją
 * telefony.
 */
export function saveCopy(kind: 'create' | 'update', reg: string): SaveCopy {
  if (kind === 'create') {
    return {
      title: `${reg} jest w rejestrze floty.`,
      note: 'Jednostka pojawi się na liście wyboru w aplikacji przy najbliższym pobraniu danych referencyjnych — telefony odpytują je przy starcie dnia.',
    };
  }
  return {
    title: `Zapisano konfigurację ${reg}.`,
    note: 'Nowe wartości działają wyłącznie na to, co przyjdzie po zapisie. Telefony zobaczą je przy najbliższym pobraniu danych referencyjnych; samolot z otwartą sesją dokończy dzień na konfiguracji, którą pobrał rano.',
  };
}
