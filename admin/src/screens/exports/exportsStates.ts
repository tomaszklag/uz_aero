/**
 * UZ Aero — panel: NAZWANIE stanów karty dnia (moduł CZYSTY, testowany w Node).
 *
 * Serwer wysyła surowy kod (`current`, `blocked`, `missing`, `waiting`, `impossible`);
 * polska nazwa, plakietka i zdanie wyjaśniające są własnością panelu, bo serwer nie zna
 * języka interfejsu. Ta sama granica, co przy odmowach floty i kont.
 *
 * `Record<ExportStateDto, …>` jest tu WYMUSZENIEM kompilatora: dopisanie stanu po
 * stronie serwera bez nazwania go tutaj przestaje się kompilować. Bez tego nowy kod
 * pojawiłby się w tabeli jako pusta komórka — i nikt by tego nie zauważył, bo stan
 * rzadki z natury jest rzadki.
 */

import type {
  ExportFailureDto,
  ExportOutcomeDto,
  ExportRefusalDto,
  ExportStateDto,
} from '../../api/dto';
import type { PillTone } from '../../ui/components/Pill';

export interface ExportStateMeta {
  tone: PillTone;
  label: string;
  /** Druga linia komórki „Status" — czym ten stan jest w szczegółach. */
  note: string;
  /** Kropka tylko przy stanie, który TRWA (dzień w toku, flaga czekająca na człowieka). */
  dot: boolean;
}

export const EXPORT_STATE_META: Record<ExportStateDto, ExportStateMeta> = {
  waiting: {
    tone: 'blue',
    label: 'Czeka · dzień otwarty',
    note: 'karta powstaje po day_close',
    dot: true,
  },
  blocked: {
    tone: 'red',
    label: 'Zablokowana',
    note: 'otwarta flaga session_overlap',
    dot: true,
  },
  missing: {
    tone: 'red',
    label: 'Brak karty',
    note: 'dzień zamknięty, eksport nie doszedł',
    dot: false,
  },
  impossible: {
    tone: 'dim',
    label: 'Bez preflightu',
    note: 'karty nie da się nazwać',
    dot: false,
  },
  current: {
    tone: 'green',
    label: 'W arkuszu',
    note: 'karta w exported_sheets',
    dot: false,
  },
};

/**
 * Powody odmowy eksportera po polsku. Serwer wysyła kody `ExportOutcome`, panel je
 * nazywa — i nazywa WSZYSTKIE, bo `Record` po unii nie pozwala pominąć żadnego.
 */
const REFUSAL_LABEL: Record<ExportRefusalDto, string> = {
  no_events: 'ta sesja nie ma ani jednego zdarzenia w rejestrze',
  session_open: 'dzień jest wciąż otwarty — karta powstaje po day_close',
  no_preflight: 'sesja bez preflightu — karty nie da się nazwać',
  overlap_flag: 'otwarta flaga session_overlap trzyma kartę poza arkuszem',
};

export interface RetryMessage {
  tone: 'ok' | 'warn' | 'danger';
  title: string;
  body: string;
}

/**
 * Awarie próby po polsku — `Record` po unii, więc nowego rodzaju nie da się przemilczeć.
 *
 * ══ DWA ZDANIA, BO PROWADZĄ W DWIE RÓŻNE STRONY ══
 * Do 2026-08-01 był jeden: „Adapter arkuszy zgłosił awarię — spróbuj za chwilę".
 * Dostawał go także `TypeError` w budowie karty i przegrany wyścig rewizji, bo komenda
 * łapała każdy wyjątek i zwracała `null`. Administrator dostawał wtedy polecenie
 * CZEKANIA na usterkę, która sama nie mija — i to jest gorsze niż „coś poszło nie tak",
 * bo nie zostawia nawet zdziwienia.
 */
const FAILURE_MESSAGE: Record<ExportFailureDto, { title: string; body: string }> = {
  sheets_adapter: {
    title: 'Adapter arkuszy zgłosił awarię.',
    body:
      'Karta nie została zapisana i dziennik nie dostał nowego wiersza. To awaria ZAPISU ' +
      'do arkusza — dane w rejestrze są całe, a nieudana próba nie zostawia śladu w bazie, ' +
      'więc historii tych awarii nie ma gdzie zobaczyć. Spróbuj ponownie za chwilę.',
  },
  unexpected: {
    title: 'Eksport przerwał się błędem po stronie serwera.',
    body:
      'To NIE jest awaria arkuszy i ponowienie za chwilę samo tego nie naprawi — powtórna ' +
      'próba trafi na ten sam błąd. Szczegóły są w logach serwera; wpis w dzienniku audytu ' +
      'niesie rodzaj awarii, więc da się po nim wrócić do tej chwili. Zgłoś to, zamiast czekać.',
  },
};

/**
 * Wynik ponowienia → zdanie dla człowieka.
 *
 * Cztery różne wiadomości, celowo NIE sklejone w mniej:
 *  • **sukces** — z numerem rewizji, bo „zapisano" nie odpowiada na pytanie, czy
 *    w arkuszu jest teraz coś nowego (`ANALIZA` ryzyko 2);
 *  • **odmowa** — stan świata, nie awaria. Ma powód i ma go pokazać dosłownie,
 *    bo administrator, który nie wie, czy to zasada czy usterka, sięga po `psql`;
 *  • **awaria arkuszy** — minie sama, ponowienie za chwilę ma sens;
 *  • **błąd nasz** — nie minie sam i panel nie ma prawa obiecywać, że minie.
 */
export function retryMessage(
  outcome: ExportOutcomeDto | null,
  revisionBefore: number | null,
  failure: ExportFailureDto | null,
): RetryMessage {
  if (outcome == null) {
    // `failure` jedzie zawsze razem z `outcome: null`; gdyby serwer go nie przysłał,
    // wolimy zdanie o nieznanej awarii niż fałszywe wskazanie na arkusze.
    const message =
      failure == null ? FAILURE_MESSAGE.unexpected : FAILURE_MESSAGE[failure];
    return { tone: 'danger', ...message };
  }

  if (!outcome.exported) {
    return {
      tone: 'warn',
      title: 'Karta nie powstała.',
      body: `${REFUSAL_LABEL[outcome.reason]}. Ponowienie nie omija bramek eksportu — najpierw musi zniknąć powód.`,
    };
  }

  return {
    tone: 'ok',
    title:
      revisionBefore == null
        ? `Karta ${outcome.tab} powstała po raz pierwszy — rewizja ${outcome.revision}.`
        : `Karta ${outcome.tab} zregenerowana — rewizja ${revisionBefore} → ${outcome.revision}.`,
    body:
      'Dziennik eksportu dostał NOWY wiersz (jest append-only), a treść karty została ' +
      'nadpisana — w exported_sheets jest zawsze jedna, bieżąca wersja.',
  };
}

/**
 * Napis na przycisku ponowienia. `retrying` dotyczy WIERSZA, nie tabeli.
 *
 * Wygląda na drobiazg do wpisania w `.tsx`, ale jest wyborem treści zależnym od danych —
 * a do 2026-08-01 stał w widoku i był karmiony `retry.isPending`, czyli stanem CAŁEJ
 * mutacji. Po kliknięciu „Ponów" na jednym dniu wszystkie dwieście wierszy pisało
 * „Ponawiam…", twierdząc o 199 dniach rzecz nieprawdziwą.
 */
export function retryLabel(retrying: boolean): string {
  return retrying ? 'Ponawiam…' : 'Ponów';
}
