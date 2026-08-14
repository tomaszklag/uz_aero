/**
 * UZ Aero — panel: FORMULARZ KOREKTY, decyzje o treści (moduł CZYSTY).
 *
 * Wzorzec z `screens/flags/flagResolve.ts`: ekran jest `.tsx` bez decyzji o treści,
 * a każda walidacja i każdy napis rozstrzygają się tutaj i mają test w Node.
 *
 * ══ CZAS PARSUJEMY JAWNIE W UTC ══
 * Pole nowego czasu zamienia napis na znacznik przez `parseDateTimeUtc`
 * (`@uzaero/format`), a nie przez `new Date(napis)`. Ten drugi rozumie
 * `2026-07-30 13:01:33` jako czas LOKALNY, więc w Warszawie latem przesunąłby wartość
 * o dwie godziny — bez błędu, bez ostrzeżenia i z napisem, który dalej wygląda dobrze.
 * Byłaby to najgorsza możliwa awaria tego ekranu: korekta czasu, która sama zmienia
 * czas. Dlatego parser mieszka w pakiecie formatów, ma tam testy, a komponent ekranu
 * nie dotyka dat w ogóle.
 */

import { dateTimeUtc, durationLong, parseDateTimeUtc, timeUtcSeconds } from '@uzaero/format';

import type { CorrectionDraftDto, TimelineEntryDto } from '../../api/dto';

/** Lustro `correctionBase` z `server/src/http/routes/admin/corrections.ts`. */
export const REASON_MAX_LENGTH = 2000;

export type CorrectionActionId = CorrectionDraftDto['action'];

export interface ActionOption {
  id: CorrectionActionId;
  name: string;
  /** Druga linia karty — payload i skutek dla projekcji, dosłownie jak w `A02b`. */
  desc: string;
}

/**
 * Dokładnie TRZY akcje — te same, które zna domena (`EventCorrectionPayload`) i które
 * pokazuje mockup. Lista kart, nigdy natywny `<select>` (`CLAUDE.md`).
 */
export const ACTION_OPTIONS: ActionOption[] = [
  {
    id: 'retime',
    name: 'retime — zdarzenie zaszło, ale o innej godzinie',
    desc: "payload: { action: 'retime', targetUuid, newTime } · projekcja policzy dzień z nowym czasem",
  },
  {
    id: 'void',
    name: 'void — zdarzenia nie było',
    desc: "payload: { action: 'void', targetUuid } · zdarzenie wypada z wyliczeń, wiersz zostaje w rejestrze przekreślony",
  },
  {
    id: 'amend',
    name: 'amend — zdarzenie zaszło, ale niesie złą wartość',
    desc: "payload: { action: 'amend', targetUuid, fields } · odczyt paliwa i MH przy przejęciu/zdaniu, skład zrzutu. Czasu nie rusza",
  },
];

/**
 * Pola `amend` dopuszczone dla danego typu celu — LUSTRO białej listy z domeny
 * (`AMEND_ALLOWED` w `rules/sessionRules.ts`).
 *
 * Panel powtarza ją nie po to, żeby walidować (od tego jest domena i robi to przy
 * zapisie), tylko po to, żeby nie POKAZYWAĆ pola, którego reguła i tak odrzuci:
 * formularz z polem „skoczkowie" przy `engine_stop` obiecuje zmianę, która skończy się
 * `CORRECTION_FIELD_NOT_ALLOWED`. Rozjazd tej listy z domeną kosztuje jeden odrzucony
 * zapis z czytelnym powodem, a nie cichy błąd — dlatego kopia jest tu dopuszczalna.
 */
export const AMEND_FIELDS: Record<string, readonly AmendFieldId[]> = {
  preflight_confirm: ['fuelL', 'mh', 'notes'],
  day_close: ['fuelL', 'mh'],
  drop: ['jumpers'],
  manual_log_entry: ['notes'],
};

export type AmendFieldId = 'fuelL' | 'mh' | 'jumpers' | 'notes';

/** Czy `amend` ma dla tego typu celu cokolwiek do zmienienia. */
export function amendFieldsFor(type: string): readonly AmendFieldId[] {
  return AMEND_FIELDS[type] ?? [];
}

export interface AmendState {
  /** Pola gotowe do wysłania; `null` = nic czytelnego nie wpisano. */
  fields: { fuelL?: number; mh?: number; jumpers?: null } | null;
  /** Zawsze widoczny tekst pod polami — powód odmowy albo opis skutku. */
  message: string;
  invalid: boolean;
}

/**
 * Stan pól wartości.
 *
 * Puste pole znaczy „nie ruszaj tej wartości", a nie „wpisz zero" — administrator
 * poprawia zwykle JEDNĄ liczbę i nie ma przepisywać drugiej tylko dlatego, że formularz
 * ją pokazuje. Wpis nieczytelny (litery w litrach) blokuje zapis z podanym powodem.
 */
export function amendState(fuelText: string, mhText: string): AmendState {
  const fuel = numberOrNull(fuelText);
  const mh = numberOrNull(mhText);

  if (fuel === 'invalid' || mh === 'invalid') {
    return {
      fields: null,
      message: 'Nieczytelna wartość — podaj liczbę, na przykład 168 albo 3907.8.',
      invalid: true,
    };
  }
  if (fuel == null && mh == null) {
    return {
      fields: null,
      message: 'Wpisz nową wartość paliwa albo motogodzin. Puste pole zostawia liczbę bez zmian.',
      invalid: false,
    };
  }

  const fields: { fuelL?: number; mh?: number } = {};
  if (fuel != null) fields.fuelL = fuel;
  if (mh != null) fields.mh = mh;
  return {
    fields,
    message:
      'Zmiana wchodzi w PAYLOAD zdarzenia; oryginalne wartości zostają w rejestrze. ' +
      'Odczyt przy zdaniu jest ogniwem łańcucha MH — serwer przeliczy zużycie sesji.',
    invalid: false,
  };
}

/** `''` → `null` (bez zmiany), liczba → wartość, śmieci → `'invalid'`. */
function numberOrNull(text: string): number | null | 'invalid' {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 'invalid';
}

/**
 * Czas ODNIESIENIA korekty — ten, którym projekcja liczy dzień DZIŚ.
 *
 * `correctedTime` (adnotacja serwera, gdy zdarzenie ma już wcześniejszą korektę) przed
 * czasem zapisanym, a w zapisanym GPS przed zegarem telefonu — dokładnie ta sama
 * konwencja, co w domenie. Adnotację liczy serwer (`applyCorrections`), więc panel
 * jej nie odtwarza; wybiera tylko, którą z dwóch podanych liczb pokazać.
 */
export function referenceTime(entry: TimelineEntryDto): number {
  return entry.correctedTime ?? entry.event.gpsTime ?? entry.event.deviceTime;
}

/**
 * Wartość początkowa pola czasu.
 *
 * Nie „teraz" i nie pusty napis — administrator poprawia KONKRETNY odczyt, więc
 * zaczyna od niego i zmienia to, co trzeba. Pusty formularz kazałby mu przepisać całą
 * datę z osi zdarzeń, czyli dołożyłby okazję do literówki tam, gdzie chodzi o minuty.
 */
export function initialTimeText(entry: TimelineEntryDto): string {
  return dateTimeUtc(referenceTime(entry));
}

export interface TimeFieldState {
  /** Znacznik UTC do wysłania; `null` = wpis nieczytelny albo pusty. */
  value: number | null;
  ok: boolean;
  /** Zawsze widoczny tekst pod polem: albo powód odmowy, albo skala zmiany. */
  message: string;
  /** `true` = pole ma się podświetlić jako błędne (dopiero po wpisaniu czegokolwiek). */
  invalid: boolean;
}

/**
 * Stan pola „Nowy czas zdarzenia (UTC)".
 *
 * Komunikat przy poprawnym wpisie podaje SKALĘ ZMIANY („wcześniej o 00:12:00"), bo to
 * jest liczba, którą człowiek weryfikuje wzrokiem przed zapisem — 12 minut z flagi
 * `CLOCK_DRIFT` musi się zgodzić z tym, co widać. To odjęcie DWÓCH ZNACZNIKÓW podanych
 * przez serwer, formatowane funkcją pakietu, a nie druga wersja liczby dnia (ta sama
 * kategoria, co `dutyTile` na karcie dnia).
 */
export function timeFieldState(text: string, reference: number | null): TimeFieldState {
  const trimmed = text.trim();
  if (trimmed === '') {
    return {
      value: null,
      ok: false,
      message: 'Podaj nowy czas zdarzenia w UTC, w zapisie RRRR-MM-DD GG:MM:SS.',
      invalid: false,
    };
  }

  const value = parseDateTimeUtc(trimmed);
  if (value == null) {
    return {
      value: null,
      ok: false,
      message:
        'Nieczytelny zapis czasu. Oczekiwany format to RRRR-MM-DD GG:MM:SS w UTC, ' +
        'na przykład 2026-07-30 13:01:33. Sekundy można pominąć.',
      invalid: true,
    };
  }

  return { value, ok: true, message: shiftMessage(value, reference), invalid: false };
}

function shiftMessage(value: number, reference: number | null): string {
  const tail =
    'Wartość wchodzi w `gps_time` zdarzenia — `device_time` zostaje nietknięty jako ślad ' +
    'chwili pierwotnego zapisu.';
  if (reference == null) return `Nowy czas: ${timeUtcSeconds(value)} UTC. ${tail}`;

  const delta = value - reference;
  if (delta === 0) {
    return `Ten sam czas, co zapisany (${timeUtcSeconds(reference)} UTC) — korekta niczego nie zmieni. ${tail}`;
  }
  const direction = delta < 0 ? 'wcześniej' : 'później';
  return (
    `Zmiana o ${durationLong(delta < 0 ? -delta : delta)} ${direction} ` +
    `względem odczytu ${timeUtcSeconds(reference)} UTC. ${tail}`
  );
}

export interface ReasonState {
  ok: boolean;
  /** Powód odmowy — WIDOCZNY tekst przy przycisku, nigdy tooltip. */
  reason: string | null;
}

/**
 * Uzasadnienie jest WYMAGANE i odrzucamy je tutaj, zanim poleci żądanie.
 *
 * Serwer sprawdza to samo (`.trim().min(1)`), więc to nie jest zabezpieczenie — to
 * różnica między „przycisk mówi, czego brakuje" a „serwer odbija 400 bez wyjaśnienia".
 * Same spacje nie liczą się za uzasadnienie: za rok powód z audytu jest JEDYNĄ rzeczą,
 * która wyjaśni, dlaczego liczby dnia różnią się od tego, co zapisał telefon.
 */
export function reasonState(text: string): ReasonState {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      reason: 'Powód jest wymagany — bez niego korekta zostaje w rejestrze bez wyjaśnienia.',
    };
  }
  if (text.length > REASON_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Powód ma najwyżej ${REASON_MAX_LENGTH} znaków; serwer odrzuci dłuższy.`,
    };
  }
  return { ok: true, reason: null };
}

/**
 * Szkic korekty gotowy do wysłania; `null` = jeszcze niekompletny.
 *
 * Ten sam obiekt jedzie do PODGLĄDU i do ZAPISU — stąd brak `reason`, który należy
 * wyłącznie do zapisu i wyłącznie do audytu. Gdyby podgląd składał własny kształt,
 * karta „przed → po" opisywałaby inną operację niż ta, którą panel wysyła sekundę później.
 */
export function correctionDraft(
  action: CorrectionActionId,
  targetUuid: string,
  time: TimeFieldState,
  amend?: AmendState,
): CorrectionDraftDto | null {
  if (targetUuid === '') return null;
  if (action === 'void') return { targetUuid, action: 'void' };
  if (action === 'amend') {
    return amend?.fields == null ? null : { targetUuid, action: 'amend', fields: amend.fields };
  }
  return time.value == null ? null : { targetUuid, action: 'retime', newTime: time.value };
}
