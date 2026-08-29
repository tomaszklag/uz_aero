/**
 * UZ Aero - panel: RÓŻNICE projekcji jako wiersze tabeli (moduł CZYSTY, Node).
 *
 * Raport serwera jest zagnieżdżony (sesja → lista pól), a mockup `A11` pokazuje tabelę
 * PŁASKĄ: jeden wiersz na każde rozjechane pole, z uuid-em sesji powtórzonym w kolumnie.
 * Spłaszczenie jest decyzją o treści - administrator porównuje wartości kolumnami,
 * a nie rozwija sesji - więc mieszka tutaj i ma test.
 *
 * ══ TEN PLIK NICZEGO NIE LICZY ══
 * Obie wartości („w `sessions`" i „z przeliczenia") są PRZEPISANE z odpowiedzi. Jedyne,
 * co robi z nimi panel, to format: `blockMs` w milisekundach jest nieczytelne, a `05:41`
 * jest tą samą liczbą zapisaną tak, jak widzi ją pilot na ekranie 10 i skarbnik w karcie
 * arkusza - funkcją z `@uzaero/format`, nie własną arytmetyką.
 */

import { dateUtcShort, hhmm, plural, timeUtc } from '@uzaero/format';

import type { ProjectionRowDiffDto, RebuildReportDto } from '../../api/dto';
// To samo skracanie uuid-a, co na `A03`, `A05` i karcie dnia - druga kopia dałaby dwa
// różne skróty tego samego identyfikatora na sąsiednich ekranach.
import { shortUuid } from '../flags/flagRows';

export interface DiffRow {
  key: string;
  sessionUuid: string;
  sessionShort: string;
  aircraftId: string;
  /** Dzień karty w zapisie skrzynki („24 JUN 2026"); „-" = sesja bez claimu. */
  day: string;
  field: string;
  stored: string;
  computed: string;
  /** `true` = wiersza projekcji NIE MA w ogóle; wtedy nie ma też pól do porównania. */
  missing: boolean;
  /** Przejście „Do dnia" z mockupu - karta dnia (`A02a`). */
  dayHref: string;
}

/**
 * Pola PROJEKCJI liczone w milisekundach. Lista jest jawna, a nie zgadywana z sufiksu
 * („kończy się na `Ms`"), bo zgadywanie po nazwie zaczyna kłamać przy pierwszym polu,
 * które nazwą pasuje, a znaczeniem nie - i objawia się dopiero na ekranie.
 */
const DURATION_FIELDS = new Set(['blockMs', 'flightMs']);

/** Pola PROJEKCJI będące stemplem czasu (epoch ms UTC). */
const INSTANT_FIELDS = new Set(['claimTime', 'closeTime']);

/**
 * Wartość pola projekcji → napis.
 *
 * `null` to „-", nigdy „0" ani „null": zero jest twierdzeniem o świecie („nie było ani
 * jednego lotu"), a brak wartości nim nie jest. Wartość nieliczbowa tam, gdzie panel
 * spodziewa się liczby, jedzie DOSŁOWNIE - rejestr diagnostyczny, który wywraca się na
 * własnej zawartości, przestaje być narzędziem dokładnie wtedy, gdy jest potrzebny.
 */
export function fieldValue(field: string, value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (DURATION_FIELDS.has(field)) return hhmm(value);
    // Zapis lotniczy („24 JUN 2026 08:00"), a nie ISO-podobny `dateTimeUtc`: ten drugi
    // istnieje dla POLA KOREKTY, które musi dać się odczytać maszynowo. Tutaj wartość
    // się czyta i porównuje wzrokiem z sąsiednią kolumną - tak samo jak na `A05`.
    if (INSTANT_FIELDS.has(field)) return `${dateUtcShort(value)} ${timeUtc(value)}`;
    return String(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? String(value);
}

/** „2026-06-24" → „24 JUN 2026"; `null` (sesja bez claimu) → „-". */
function dayLabel(day: string | null): string {
  if (day == null) return '-';
  const at = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isNaN(at) ? day : dateUtcShort(at);
}

/**
 * Ile WIERSZY tabeli wypisujemy najwyżej.
 *
 * Serwer ogranicza raport po SESJACH (`PROJECTION_DIFF_LIMIT`), a ta tabela jest
 * spłaszczeniem: jedna sesja daje tyle wierszy, ile ma rozjechanych pól. Przy zmianie
 * reguły liczenia rozjeżdża się kilka pól naraz w każdej sesji, więc limit serwera
 * przekłada się na wielokrotność siebie w DOM-ie. To jest drugi bezpiecznik, w tej
 * samej sprawie i na tej samej zasadzie: wolno przyciąć, nie wolno przyciąć po cichu
 * (`diffNotice`).
 */
export const DIFF_ROW_LIMIT = 200;

/**
 * Raport → płaskie wiersze tabeli, W KOLEJNOŚCI SERWERA, najwyżej `DIFF_ROW_LIMIT`.
 *
 * Sesja BEZ wiersza projekcji daje JEDEN wiersz z adnotacją zamiast listy pól: nie ma
 * czego z czym porównywać, a wypisanie wszystkich pól jako „- → wartość" sugerowałoby,
 * że rozjechało się kilkanaście rzeczy naraz, zamiast jednej: braku wiersza.
 */
export function diffRows(report: RebuildReportDto | undefined): DiffRow[] {
  if (report == null) return [];
  return report.diffs.flatMap((diff) => rowsFor(diff)).slice(0, DIFF_ROW_LIMIT);
}

/** Ile wierszy dałby raport BEZ obcięcia - potrzebne, żeby powiedzieć, ilu nie widać. */
function builtRows(report: RebuildReportDto): number {
  return report.diffs.reduce((sum, diff) => sum + (diff.missing ? 1 : diff.fields.length), 0);
}

/**
 * Podpis tabeli. Po ZAPISIE ta sama tabela opisuje co innego: nie „co się różni", tylko
 * „co zostało nadpisane i z czego na co". Wiersze już się nie różnią, więc nagłówek
 * mówiący, że się różnią, byłby fałszem o bazie sprzed kilku sekund.
 */
export function diffCaption(report: RebuildReportDto | undefined): string {
  return report?.mode === 'write'
    ? 'Wiersze nadpisane w tym przebiegu - wartość sprzed zapisu i wartość zapisana'
    : 'Różnice między projekcją sessions a przeliczeniem ze strumienia zdarzeń';
}

/** Nagłówki dwóch kolumn wartości - z tego samego powodu, co podpis wyżej. */
export function diffValueHeaders(report: RebuildReportDto | undefined): {
  stored: string;
  computed: string;
} {
  return report?.mode === 'write'
    ? { stored: 'Przed zapisem', computed: 'Zapisano' }
    : { stored: 'W sessions', computed: 'Z przeliczenia' };
}

/**
 * Zdanie „ta lista jest przycięta" - `null`, gdy nie jest.
 *
 * Dwa niezależne obcięcia, każde z własnym powodem, i oba muszą być widoczne:
 *  • SESJE poza raportem (`report.remaining`) - bezpiecznik serwera; przy zapisie
 *    znaczy dodatkowo „tyle sesji nadal się różni", ale to mówi już werdykt, więc
 *    tutaj zostaje sama objętość;
 *  • WIERSZE poza tabelą (`DIFF_ROW_LIMIT`) - bezpiecznik DOM-u.
 *
 * Liczby nad tabelą opisują CAŁY rejestr (serwer liczy je poza limitem), więc zdanie
 * mówi dokładnie tyle, ile trzeba: ile widać, ilu nie widać i co z tym zrobić. Lista
 * przycięta po cichu jest najgorszym trybem awarii narzędzia nadzoru - wygląda na
 * komplet. Ta sama reguła i to samo zdanie, co `truncationNotice` na `A05`.
 */
export function diffNotice(report: RebuildReportDto | undefined): string | null {
  if (report == null) return null;

  const total = builtRows(report);
  const shown = Math.min(total, DIFF_ROW_LIMIT);
  const hiddenRows = total - shown;
  if (report.remaining === 0 && hiddenRows === 0) return null;

  const parts: string[] = [];
  if (report.remaining > 0) {
    parts.push(
      `Raport opisuje ${report.diffs.length} z ${report.rowsDiffering} rozjechanych sesji - ` +
        `${report.remaining} ${plural(report.remaining, 'sesja nie mieści', 'sesje nie mieszczą', 'sesji nie mieści')} się w jednej odpowiedzi.`,
    );
  }
  if (hiddenRows > 0) {
    parts.push(
      `Tabela pokazuje pierwsze ${shown} z ${total} ${plural(total, 'wiersza', 'wierszy', 'wierszy')} tego raportu.`,
    );
  }
  parts.push(
    'Liczby nad tabelą opisują CAŁY rejestr, więc mówią także o tym, czego tu nie widać. ' +
      'Przebudowę domyka się kolejnymi uruchomieniami - limit jest bezpiecznikiem, nie awarią.',
  );
  return parts.join(' ');
}

function rowsFor(diff: ProjectionRowDiffDto): DiffRow[] {
  const base = {
    sessionUuid: diff.sessionUuid,
    sessionShort: shortUuid(diff.sessionUuid),
    aircraftId: diff.aircraftId,
    day: dayLabel(diff.day),
    dayHref: `/dni/${diff.sessionUuid}`,
    missing: diff.missing,
  };

  if (diff.missing) {
    return [
      {
        ...base,
        key: `${diff.sessionUuid}:missing`,
        field: 'CAŁY WIERSZ',
        stored: 'brak w sessions',
        computed: 'do odtworzenia ze strumienia',
      },
    ];
  }

  return diff.fields.map((field) => ({
    ...base,
    key: `${diff.sessionUuid}:${field.field}`,
    field: field.field,
    stored: fieldValue(field.field, field.stored),
    computed: fieldValue(field.field, field.computed),
  }));
}
