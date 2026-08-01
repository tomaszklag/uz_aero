/**
 * UZ Aero — panel: ROZSTRZYGNIĘCIE FLAGI, decyzje o treści (moduł CZYSTY).
 *
 * Wzorzec z `screens/login/loginMessages.ts`: ekran jest `.tsx` bez decyzji o treści,
 * a odpowiedź serwera → komunikat rozstrzyga się tutaj i ma test w Node. Dlatego
 * funkcje przyjmują STATUS i CIAŁO, a nie wyjątek: pytanie „co powiedzieć człowiekowi"
 * nie ma nic wspólnego z tym, jakiej klasy błąd rzucił klient HTTP.
 */

import { dateUtcShort, timeUtc } from '@uzaero/format';

import type {
  ApiErrorDto,
  Capability,
  ExportAttemptDto,
  ExportRefusalDto,
  FlagListItemDto,
  ResolveFlagResultDto,
} from '../../api/dto';
import { can, denialReason } from '../../auth/can';

/** Lustro `resolveBody` z `server/src/http/routes/admin/flags.ts` (`z.string().max(2000)`). */
export const NOTE_MAX_LENGTH = 2000;

export interface NoteState {
  /** Czy wolno wysłać. */
  ok: boolean;
  /** Powód odmowy — WIDOCZNY tekst przy przycisku, nigdy tooltip. */
  reason: string | null;
}

/**
 * Komentarz jest WYMAGANY i odrzucamy go tutaj, zanim poleci żądanie.
 *
 * Serwer sprawdza to samo (`.trim().min(1)`), więc to nie jest zabezpieczenie —
 * to różnica między „przycisk mówi, czego brakuje" a „serwer odbija 400 bez
 * wyjaśnienia". Same spacje nie liczą się za uzasadnienie: za pół roku nikt nie
 * pamięta, dlaczego nakładka sesji okazała się pozorna, a pusty ślad jest wtedy
 * gorszy niż brak przycisku.
 */
export function noteState(note: string): NoteState {
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      reason: 'Komentarz jest wymagany — to jedyna treść, jaką panel dopisuje do flagi.',
    };
  }
  if (note.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Komentarz ma najwyżej ${NOTE_MAX_LENGTH} znaków; serwer odrzuci dłuższy.`,
    };
  }
  return { ok: true, reason: null };
}

/** Kto i czym zamknął sprawę PIERWSZY — treść odpowiedzi 409. */
export interface ResolutionWinner {
  by: string;
  at: string;
  note: string;
}

export interface ResolveFailure {
  tone: 'danger' | 'warn';
  title: string;
  detail: string;
  /** Wypełnione wyłącznie przy przegranym wyścigu (409). */
  winner: ResolutionWinner | null;
  /**
   * `true` = ponawianie nie ma sensu, bo świat się zmienił (409/404). Formularz
   * ma się wtedy zamknąć, a nie zapraszać do drugiej próby.
   */
  final: boolean;
}

/**
 * Odpowiedź serwera → komunikat odmowy.
 *
 * **409 to najważniejszy przypadek tego pliku.** Ktoś mógł zamknąć sprawę pierwszy —
 * i wtedy komunikat „coś poszło nie tak" byłby wprost szkodliwy: drugi klikający
 * dopisałby własne uzasadnienie do decyzji, której nie podjął, albo poszedłby szukać
 * awarii, której nie ma. Odpowiedź niesie STAN FLAGI wraz z komentarzem zwycięzcy
 * (`server/src/http/routes/admin/flags.ts`), więc pokazujemy CZYJE rozstrzygnięcie
 * zdążyło i jakie.
 *
 * Mockup `A03a` nie ma na to stanu — projektujemy go w duchu reszty ekranu: baner
 * `danger` w szufladzie, cytat komentarza pierwszego rozstrzygającego, formularz
 * zamknięty.
 */
export function resolveFailure(status: number | null, body: ApiErrorDto | null): ResolveFailure {
  if (status === 409) {
    const flag = body?.flag ?? null;
    const at = flag?.resolvedAt == null ? null : Date.parse(flag.resolvedAt);
    return {
      tone: 'danger',
      title: 'Tę sprawę zamknął już ktoś inny.',
      detail:
        'Twój komentarz NIE został zapisany — flaga ma rozstrzygnięcie, które zdążyło ' +
        'pierwsze, i ono zostaje. Jeżeli się z nim nie zgadzasz, to jest rozmowa ' +
        'z autorem, a nie druga decyzja w tym samym miejscu.',
      winner:
        flag == null
          ? null
          : {
              by: flag.resolvedBy ?? '—',
              at: at == null || Number.isNaN(at) ? '—' : `${dateUtcShort(at)} ${timeUtc(at)} UTC`,
              note: flag.resolutionNote ?? '',
            },
      final: true,
    };
  }

  if (status === 404) {
    return {
      tone: 'warn',
      title: 'Tej flagi nie ma w rejestrze.',
      detail:
        'Adres wskazuje numer, którego serwer nie zna. Wróć do skrzynki i otwórz sprawę ' +
        'z listy — flag nie kasuje się z bazy, więc pomyłka jest raczej w adresie.',
      winner: null,
      final: true,
    };
  }

  if (status === 403) {
    return {
      tone: 'warn',
      title: 'Twoja rola nie obejmuje rozstrzygania flag.',
      detail: `${denialReason('flags.resolve')}. Skrzynkę czyta każdy, kto ma wejście do panelu — zamyka sprawę węższa zdolność.`,
      winner: null,
      final: true,
    };
  }

  if (status === 400) {
    return {
      tone: 'danger',
      title: 'Serwer odrzucił komentarz.',
      detail:
        `Komentarz musi mieć treść i nie więcej niż ${NOTE_MAX_LENGTH} znaków. ` +
        'Popraw wpis i spróbuj jeszcze raz.',
      winner: null,
      final: false,
    };
  }

  if (status == null) {
    return {
      tone: 'danger',
      title: 'Brak połączenia z serwerem.',
      detail:
        'Panel działa wyłącznie online, a rozstrzygnięcie musi zapisać się w bazie razem ' +
        'ze śladem audytu. Nie wiadomo, czy żądanie doszło — odśwież skrzynkę, zanim ' +
        'spróbujesz ponownie.',
      winner: null,
      final: false,
    };
  }

  return {
    tone: 'danger',
    title: 'Rozstrzygnięcie nie powiodło się.',
    detail: `Serwer odpowiedział kodem ${status}. Jeśli to się powtarza, zgłoś administratorowi.`,
    winner: null,
    final: false,
  };
}

/**
 * Powody, dla których eksporter ODMÓWIŁ zbudowania karty. `Record` wymusza komplet:
 * dopisanie szóstego powodu w `dayExporter.ts` wywali kompilację tutaj, zamiast
 * pokazać administratorowi surowy kod z bazy.
 */
const REFUSAL_LABEL: Record<ExportRefusalDto, string> = {
  no_events: 'brak zdarzeń w rejestrze tej sesji',
  session_open: 'dzień jeszcze nie zamknięty — karta powstanie po `day_close`',
  no_preflight: 'brak potwierdzenia przedlotowego, nie ma z czego zbudować karty',
  overlap_flag: 'inna otwarta flaga nakładki wciąż trzyma tę kartę',
};

export interface ResolveOutcome {
  tone: 'ok' | 'warn';
  title: string;
  /** Po jednej linii na sesję objętą flagą; pusta lista = nic nie eksportowano. */
  lines: string[];
  note: string;
}

/**
 * Skutek rozstrzygnięcia — co naprawdę stało się z kartą dnia.
 *
 * Serwer zwraca SKUTEK, a nie `204`, właśnie po to, żeby padło „arkusz odblokowany ·
 * rewizja 1", a nie samo „zapisano". Re-eksport uruchamia się **wyłącznie dla
 * `session_overlap`**, bo tylko ten typ jest bramką w `DayExporter` — pusta lista
 * jest więc poprawną odpowiedzią, a nie brakiem informacji, i tak ją opisujemy.
 */
export function resolveOutcome(result: ResolveFlagResultDto): ResolveOutcome {
  if (result.exports.length === 0) {
    return {
      tone: 'ok',
      title: 'Sprawa zamknięta.',
      lines: [],
      note:
        'Ta flaga nie blokowała eksportu, więc żadna karta dnia nie wymagała odświeżenia. ' +
        'Komentarz i tożsamość rozstrzygającego są w audycie, a wpis flagi zostaje w bazie na stałe.',
    };
  }

  const failed = result.exports.some((attempt) => attempt.outcome == null);
  return {
    tone: failed ? 'warn' : 'ok',
    title: failed ? 'Sprawa zamknięta, karta dnia — nie.' : 'Sprawa zamknięta, karta odblokowana.',
    lines: result.exports.map(exportLine),
    note: failed
      ? 'Flaga JEST rozwiązana — nie powiódł się sam zapis karty. Ponów eksport na ekranie Eksporty.'
      : 'Bramka `dayExporter` przestała trzymać sesję. Ślad akcji jest w audycie.',
  };
}

function exportLine(attempt: ExportAttemptDto): string {
  const session = attempt.sessionUuid;
  if (attempt.outcome == null) return `${session} — eksport karty rzucił błędem`;
  if (attempt.outcome.exported) {
    return `${session} — karta ${attempt.outcome.tab} · rewizja ${attempt.outcome.revision}`;
  }
  return `${session} — bez karty: ${REFUSAL_LABEL[attempt.outcome.reason]}`;
}

export interface CorrectionAction {
  /** Adres KARTY DNIA, na której wybiera się zdarzenie; pusty, gdy akcja zablokowana. */
  to: string;
  label: string;
  disabled: boolean;
  /** Powód blokady — WIDOCZNY przy przycisku, nigdy ciche ukrycie pozycji. */
  reason: string | null;
}

/**
 * Przejście do korekty zdarzenia — jedyna droga, którą zmienia się LICZBY.
 *
 * ══ PROWADZI NA KARTĘ DNIA, NIE WPROST W FORMULARZ ══
 * Korekta dotyczy KONKRETNEGO zdarzenia (`/dni/<sesja>/korekta/<zdarzenie>`), a flaga
 * wskazuje sesję, nie zdarzenie — `session_overlap` opisuje dwie nakładające się sesje,
 * a nie pojedynczy odczyt. Wyboru dokonuje się więc na osi dnia, która ZNA uuid-y
 * i wie, które zdarzenia są korygowalne. Adres bez celu prowadziłby w ekran, który nie
 * wie, co poprawia — a to jest gorsze niż jeden klik więcej.
 *
 * Rozstrzygnięcie flagi jest komentarzem i zmianą statusu; jeżeli błędna jest sama
 * liczba, poprawia ją nowe zdarzenie `event_correction`, a oryginał zostaje
 * w rejestrze na zawsze. Zdolności są tu ROZŁĄCZNE i to jest sedno tej funkcji:
 * `flags.resolve` ma administrator **oraz** szef wyszkolenia, `events.correct` —
 * **tylko administrator**. Dla szefa wyszkolenia przycisk zostaje WIDOCZNY
 * i wyszarzony z powodem: ukrycie zmusiłoby go do zgadywania, czy funkcji nie ma
 * w produkcie, czy nie ma jej on.
 *
 * To podpowiedź dla UI, nie zabezpieczenie — egzekwuje serwer przy każdym żądaniu.
 */
export function correctionAction(
  flag: FlagListItemDto,
  capabilities: readonly Capability[] | undefined,
): CorrectionAction {
  if (!can(capabilities, 'events.correct')) {
    return {
      to: '',
      label: 'Korekta zdarzenia',
      disabled: true,
      reason: denialReason('events.correct'),
    };
  }

  const sessionUuid = flag.sessionUuids[0];
  if (sessionUuid == null) {
    return {
      to: '',
      label: 'Korekta zdarzenia',
      disabled: true,
      reason: 'Flaga nie wskazuje żadnej sesji — nie ma czego korygować',
    };
  }

  return {
    to: `/dni/${encodeURIComponent(sessionUuid)}`,
    label: `Wybierz zdarzenie na osi dnia · ${flag.reg ?? flag.aircraftId}`,
    disabled: false,
    reason: null,
  };
}
