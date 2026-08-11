/**
 * UZ Aero — panel: SKUTEK I ODMOWA korekty, decyzje o treści (moduł CZYSTY).
 *
 * Funkcje przyjmują STATUS i CIAŁO, a nie wyjątek: pytanie „co powiedzieć człowiekowi"
 * nie ma nic wspólnego z tym, jakiej klasy błąd rzucił klient HTTP (wzorzec
 * `flagResolve.ts` i `loginMessages.ts`).
 *
 * ══ NAJWAŻNIEJSZY PRZYPADEK TEGO PLIKU: `reexport === null` ══
 * Korekta ZOSTAŁA zapisana, a karta arkusza NIE została zregenerowana — eksport rzucił
 * po commicie. Obie połowy tej wiadomości muszą paść wprost. Sugerowanie sukcesu byłoby
 * kłamstwem (klub dostaje stare liczby), a sugerowanie porażki kłamstwem GORSZYM:
 * administrator dopisałby korektę drugi raz, do rejestru, który już ją ma.
 */

import { dateUtcShort, timeUtcSeconds } from '@uzaero/format';

import type {
  ApiErrorDto,
  CorrectionResultDto,
  ExportOutcomeDto,
  ExportRefusalDto,
} from '../../api/dto';
import { denialReason } from '../../auth/can';

/**
 * Powody, dla których eksporter ODMÓWIŁ zbudowania karty. `Record` wymusza komplet:
 * dopisanie piątego powodu w `dayExporter.ts` wywali kompilację tutaj, zamiast pokazać
 * administratorowi surowy kod z bazy.
 */
const REFUSAL_LABEL: Record<ExportRefusalDto, string> = {
  no_events: 'brak zdarzeń w rejestrze tej doby',
  session_open: 'żadnej maszyny tej doby jeszcze nie zdano — karta powstaje po `day_close`',
  no_preflight: 'sesja bez `session_claim`, więc karty nie da się nazwać',
  overlap_flag: 'otwarta flaga `aircraft_overlap` wciąż trzyma tę sesję poza kartą doby',
};

export interface CorrectionOutcome {
  tone: 'ok' | 'warn';
  title: string;
  /** Kolejne kroki, które się WYDARZYŁY — po jednym na linię, jak w mockupie. */
  steps: string[];
  note: string;
}

/**
 * Odpowiedź 200 → co się właśnie stało.
 *
 * Kolejność kroków jest kolejnością z mockupu i z kodu serwera: rejestr, audyt, arkusz,
 * flaga. Ostatni krok jest tam nie przez pomyłkę — `A02b` mówi wprost, że flaga
 * `CLOCK_DRIFT` **zostaje otwarta**, bo korekta poprawia liczbę, a nie rozstrzyga
 * rozbieżności; zamyka ją człowiek w skrzynce.
 */
export function correctionOutcome(result: CorrectionResultDto): CorrectionOutcome {
  const at = Date.parse(result.recordedAt);
  const stamp = Number.isNaN(at) ? '—' : `${dateUtcShort(at)} ${timeUtcSeconds(at)} UTC`;

  const steps = [
    `Rejestr — dopisane zdarzenie event_correction ${result.correctionUuid} (${stamp})`,
    'Audyt — kto, kiedy, obie wartości i powód; wpis poszedł tą samą transakcją',
    sheetStep(result.reexport),
    'Flagi — bez zmian; rozbieżność zamyka człowiek w skrzynce flag',
  ];

  if (result.reexport == null) {
    return {
      tone: 'warn',
      title: 'Korekta zapisana, karta arkusza — NIE.',
      steps,
      note:
        'To nie jest awaria zapisu: zdarzenie jest w rejestrze i liczby dnia już się ' +
        'zmieniły. Nie powiodło się wyłącznie odświeżenie karty arkusza, które idzie PO ' +
        'commicie. NIE powtarzaj korekty — powstałoby drugie zdarzenie o tym samym ' +
        'skutku. Ponów sam eksport na ekranie Eksporty.',
    };
  }

  if (!result.reexport.exported) {
    return {
      tone: 'warn',
      title: 'Korekta zapisana, karty arkusza nie da się dziś zbudować.',
      steps,
      note:
        'Eksporter odmówił i podał powód — to poprawna odpowiedź o stanie świata, ' +
        'nie błąd. Korekta jest w rejestrze; karta powstanie, gdy powód zniknie.',
    };
  }

  return {
    tone: 'ok',
    title: 'Korekta zapisana, arkusz zaktualizowany.',
    steps,
    note:
      'Liczby dnia w panelu, w karcie arkusza i w rejestrze mówią od tej chwili to samo. ' +
      'Telefon pilota — nie: synchronizacja jest jednokierunkowa i ta zmiana do niego nie wróci.',
  };
}

function sheetStep(outcome: ExportOutcomeDto | null): string {
  if (outcome == null) return 'Arkusz — re-eksport RZUCIŁ BŁĘDEM, karta została ze starymi liczbami';
  if (!outcome.exported) return `Arkusz — bez nowej karty: ${REFUSAL_LABEL[outcome.reason]}`;
  return `Arkusz — karta ${outcome.tab} · rewizja ${outcome.revision}`;
}

export interface CorrectionFailure {
  tone: 'danger' | 'warn';
  title: string;
  detail: string;
  /** Komunikaty naruszeń domeny (422) — konkretne powody, nie „popraw formularz". */
  violations: string[];
  /** `true` = ponawianie nie ma sensu, bo świat się zmienił albo brakuje uprawnień. */
  final: boolean;
}

/**
 * Odpowiedź serwera → komunikat odmowy.
 *
 * **422 jest tu przypadkiem głównym.** Żądanie było poprawnie zbudowane, to DOMENA
 * odmówiła: cel nie podlega korekcie, celu nie ma w tej sesji, czas jest z przyszłości.
 * Każdy z tych powodów ma w domenie własny komunikat pisany dla człowieka — i to jego
 * pokazujemy, zamiast tłumaczyć kod statusu.
 */
export function correctionFailure(
  status: number | null,
  body: ApiErrorDto | null,
): CorrectionFailure {
  if (status === 422) {
    return {
      tone: 'danger',
      title: 'Domena odrzuciła tę korektę.',
      detail:
        'Żądanie było poprawne — to reguły rejestru mówią „nie". Uchylenie 24-godzinnego ' +
        'okna pilota jest JEDYNYM przywilejem administratora; reszta inwariantów obowiązuje ' +
        'go tak samo. Nic nie zostało zapisane.',
      violations: (body?.violations ?? []).map((v) => `${v.code} — ${v.message}`),
      final: false,
    };
  }

  // ZNIKŁA STĄD GAŁĄŹ `400 day_open` (decyzja 2026-08-07). Serwer takiej odmowy już nie
  // wysyła: administrator może edytować ZAWSZE, a kolizja z pilotem jedzie jako
  // OSTRZEŻENIE nad formularzem (`correctionWarnings.ts`), nie jako odmowa po zapisie.
  if (status === 400) {
    return {
      tone: 'danger',
      title: 'Serwer odrzucił formularz.',
      detail:
        `Powód musi mieć treść i nie więcej niż 2000 znaków, a akcja \`retime\` — czytelny ` +
        'czas w UTC. Popraw wpis i spróbuj jeszcze raz.',
      violations: [],
      final: false,
    };
  }

  if (status === 403) {
    return {
      tone: 'warn',
      title: 'Twoja rola nie obejmuje korekty zdarzeń.',
      detail: `${denialReason('events.correct')}. Korekta dopisuje zdarzenie do cudzego rejestru, więc zostaje przy administratorze.`,
      violations: [],
      final: true,
    };
  }

  if (status === 404) {
    return {
      tone: 'warn',
      title: 'Tej sesji nie ma w rejestrze.',
      detail:
        'Serwer nie zna podanego `session_uuid`. Najczęstsza przyczyna to niekompletny ' +
        'uuid z wklejonego linku — wróć na listę dni i wejdź w dzień z tabeli.',
      violations: [],
      final: true,
    };
  }

  if (status == null) {
    return {
      tone: 'danger',
      title: 'Brak połączenia z serwerem.',
      detail:
        'Panel działa wyłącznie online, a korekta musi zapisać się w bazie razem ze śladem ' +
        'audytu. Nie wiadomo, czy żądanie doszło — ODŚWIEŻ kartę dnia i sprawdź oś zdarzeń, ' +
        'zanim spróbujesz ponownie. Powtórzona korekta dopisze drugie zdarzenie.',
      violations: [],
      final: false,
    };
  }

  return {
    tone: 'danger',
    title: 'Zapis korekty nie powiódł się.',
    detail: `Serwer odpowiedział kodem ${status}. Sprawdź oś zdarzeń dnia, zanim spróbujesz ponownie.`,
    violations: [],
    final: false,
  };
}

/**
 * Naruszenia z PODGLĄDU → napisy. Ten sam kształt, co przy 422, bo to te same reguły
 * i te same komunikaty — różni się wyłącznie chwila, w której o nich mówimy.
 */
export function violationMessages(
  violations: readonly { code: string; message: string }[],
): string[] {
  return violations.map((v) => `${v.code} — ${v.message}`);
}
