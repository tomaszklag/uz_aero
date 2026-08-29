/**
 * UZ Aero - panel: sprzątanie wygasłych refresh tokenów (moduł CZYSTY, Node).
 *
 * **Jedyna operacja panelu, która naprawdę kasuje dane** - stąd osobna strefa na ekranie
 * i potwierdzenie przez wpisanie słowa.
 *
 * ══ DWIE BRAMKI, DWIE RÓŻNE ROLE ══
 *  1. **Wpisane „USUŃ"** (ten plik) jest bramką dla CZŁOWIEKA: ma zamienić kliknięcie
 *     w decyzję. Nie jest zabezpieczeniem i nie udaje nim być.
 *  2. **Pole `confirm` w ciele żądania** (`api/maintenance.ts`) jest bramką dla MASZYNY:
 *     serwer odmawia bez niego, bo `POST` da się wysłać bez panelu. „Panel bramkuje"
 *     znaczyłoby „nie bramkuje nic".
 *
 * Rozdzielenie ich jest celowe: słowo jest polskie i należy do interfejsu, token jest
 * maszynowy i należy do kontraktu. Serwer nie zna języka interfejsu.
 */

import { dateUtcShort, plural, relativeAge, timeUtc } from '@uzaero/format';

import type { RefreshTokenScanDto, TokenPurgeReportDto } from '../../api/dto';
import type { BannerTone } from '../../ui/components/Banner';
import type { KeyValueTone } from '../../ui/components/KeyValue';

/** Słowo z mockupu. Wielkość liter i spacje wokół nie mają znaczenia - literówka ma. */
export const PURGE_WORD = 'USUŃ';

export function isPurgeConfirmed(typed: string): boolean {
  return typed.trim().toLocaleUpperCase('pl-PL') === PURGE_WORD;
}

export interface TokenFact {
  label: string;
  value: string;
  unit?: string;
  tone?: KeyValueTone;
}

const show = (value: number | undefined): string => (value === undefined ? '-' : String(value));

/**
 * Stempel + wiek („12 MAR 03:41 · 4 mies. temu") albo „-".
 *
 * Wiek jest tu równie ważny, co data: administrator ocenia, czy tabela zbiera śmieci
 * od miesięcy, czy od wczoraj. `nowMs` przychodzi z odpowiedzi serwera (`scan.at`),
 * a nie z `Date.now()` przeglądarki - porównujemy stemple bazy, więc zegar przeglądarki
 * byłby w tym równaniu trzecim i jedynym niesprawdzonym.
 */
function stamp(iso: string | null, nowMs: number): { value: string; unit?: string } {
  if (iso == null) return { value: '-' };
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return { value: '-', unit: 'stempel nieczytelny' };
  return { value: `${dateUtcShort(at)} ${timeUtc(at)}`, unit: `UTC · ${relativeAge(nowMs - at)} temu` };
}

/** Liczby i daty z karty „Wygasłe refresh tokeny" - dokładnie te z mockupu. */
export function tokenFacts(scan: RefreshTokenScanDto | undefined): TokenFact[] {
  const nowMs = scan == null ? 0 : Date.parse(scan.at);
  const oldest = stamp(scan?.oldestExpiredAt ?? null, nowMs);
  const newest = stamp(scan?.newestExpiredAt ?? null, nowMs);

  return [
    { label: 'Wierszy w tabeli', value: show(scan?.total) },
    {
      label: 'Wygasłych',
      value: show(scan?.expired),
      tone: scan != null && scan.expired > 0 ? 'red' : undefined,
    },
    { label: 'Ważnych - bez zmian', value: show(scan?.valid), tone: 'green' },
    { label: 'Najstarszy wygasł', value: oldest.value, unit: oldest.unit },
    { label: 'Najświeższy wygasł', value: newest.value, unit: newest.unit },
    {
      label: 'Czas życia tokenu',
      value: show(scan?.ttlDays),
      unit: scan == null ? undefined : plural(scan.ttlDays, 'dzień', 'dni', 'dni'),
    },
  ];
}

export interface PurgeGate {
  disabled: boolean;
  reason: string | null;
  label: string;
}

export interface PurgeGateInput {
  scan: RefreshTokenScanDto | undefined;
  /** Treść pola potwierdzenia. */
  typed: string;
  /** Czy konto ma zdolność `accounts.manage`. */
  mayPurge: boolean;
  pending: boolean;
}

/**
 * Bramka przycisku „Usuń N wygasłych tokenów".
 *
 * Etykieta niesie LICZBĘ, a nie samo „Usuń": przycisk kasujący dane ma powiedzieć, ile
 * ich skasuje, zanim zostanie kliknięty. Przy braku odpowiedzi serwera etykieta traci
 * liczbę zamiast pokazywać zero - zero byłoby obietnicą, że nic się nie stanie.
 */
export function purgeGate(input: PurgeGateInput): PurgeGate {
  const expired = input.scan?.expired;
  const label =
    expired === undefined
      ? 'Usuń wygasłe tokeny'
      : `Usuń ${expired} ${plural(expired, 'wygasły token', 'wygasłe tokeny', 'wygasłych tokenów')}`;

  if (!input.mayPurge) {
    return {
      disabled: true,
      reason: 'Wymaga roli: administrator - to jedyna operacja panelu, która kasuje dane',
      label,
    };
  }
  if (input.pending) return { disabled: true, reason: null, label: 'Kasuję…' };
  if (input.scan == null) return { disabled: true, reason: 'brak odczytu tabeli', label };
  if (input.scan.expired === 0) {
    return { disabled: true, reason: 'nie ma ani jednego wygasłego tokenu', label };
  }
  if (!isPurgeConfirmed(input.typed)) {
    // Powód NIE POWTARZA słowa `USUŃ` i to nie jest przeoczenie: `Button` dopisuje powód
    // do etykiety `toLowerCase()`, więc instrukcja „wpisz USUŃ" wyszłaby na ekran jako
    // „wpisz usuń" - czyli panel podawałby inne słowo, niż sam sprawdza. Słowo stoi
    // w etykiecie pola, gdzie jest napisane wielkimi literami i tam zostaje.
    return { disabled: true, reason: 'brak potwierdzenia - wpisz słowo z pola obok', label };
  }
  return { disabled: false, reason: null, label };
}

export interface PurgeMessage {
  tone: BannerTone;
  title: string;
  body: string;
}

/**
 * Zdanie po wykonaniu czyszczenia. Mówi obie liczby naraz - ile zniknęło i ile ŻYWYCH
 * zostało - bo to drugie jest odpowiedzią na jedyne pytanie, które się tu zadaje: czy
 * ktoś przez to wypadł z sesji.
 */
export function purgeMessage(report: TokenPurgeReportDto | undefined): PurgeMessage | null {
  if (report == null) return null;

  if (report.deleted === 0) {
    return {
      tone: 'status',
      title: 'Nie było czego kasować.',
      body: `Ani jeden wiersz nie miał daty wygaśnięcia w przeszłości. Tokenów ważnych: ${report.remainingValid} - nietkniętych.`,
    };
  }

  const range =
    report.oldestExpiredAt == null || report.newestExpiredAt == null
      ? ''
      : ` Zakres dat wygaśnięcia: ${dateUtcShort(Date.parse(report.oldestExpiredAt))} – ${dateUtcShort(Date.parse(report.newestExpiredAt))} UTC.`;

  return {
    tone: 'ok',
    title: `Skasowano ${report.deleted} ${plural(report.deleted, 'wygasły token', 'wygasłe tokeny', 'wygasłych tokenów')}.`,
    body: `Tokenów ważnych: ${report.remainingValid} - żaden z nich nie został ruszony, więc nikt nie stracił sesji.${range} Do dziennika audytu poszły te same liczby i ten sam zakres dat - nigdy same tokeny.`,
  };
}
