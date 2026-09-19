/**
 * Ninerdeck - sonda stref czasowych (issue #157, zadanie A2).
 *
 * Kalendarz rezerwacji rysuje siatkę w strefie KLUBU, a nie w UTC ani w strefie telefonu
 * (`docs/rezerwacje.md` §6, decyzja P1). Żeby telefon umiał to policzyć sam, musi mieć
 * działające `Intl.DateTimeFormat` z opcją `timeZone` - a tego NIE WOLNO ZAŁOŻYĆ:
 * aplikacja nie używa dziś `Intl` ani razu (`packages/format` liczy wszystko na
 * milisekundach), a Hermes bywa budowany bez danych ICU.
 *
 * Od odpowiedzi zależy KONTRAKT TRASY kalendarza, nie wygląd ekranu:
 *  • działa  → telefon dostaje `timezone` klubu i liczy godziny lokalnie;
 *  • nie działa → serwer musi dosyłać offset strefy w minutach dla każdego dnia okna,
 *    bo reguł czasu letniego nie ma wtedy jak odtworzyć na urządzeniu.
 *
 * Dlatego to jest SONDA, a nie „sprawdzenie, czy się nie wywala": samo istnienie
 * `Intl.DateTimeFormat` niczego nie dowodzi. Hermes bez ICU przyjmuje opcję `timeZone`
 * i po cichu formatuje w UTC - czyli odpowiada, tylko źle. Sonda liczy więc ZNANE
 * odpowiedzi i porównuje je z tym, co wyszło.
 *
 * Moduł jest czysty (bez Reacta i bez RN), a formater wstrzykuje się parametrem -
 * dzięki temu ścieżkę awaryjną da się przetestować w Jest, gdzie Node ma pełne ICU
 * i nigdy nie zawiedzie sam z siebie.
 */

/** Strefa klubu w testach sondy - ta sama, która jest domyślna dla nowych klubów. */
export const PROBE_ZONE = 'Europe/Warsaw';

/** Strefa odległa: klub może stać gdziekolwiek, a dane ICU bywają przycinane do lokalnych. */
const FOREIGN_ZONE = 'America/New_York';

export type ProbeVerdict =
  /** `Intl` z `timeZone` liczy poprawnie - telefon policzy strefę klubu sam. */
  | 'ok'
  /** `Intl` jest, ale odpowiada źle (zwykle: brak ICU, formatowanie w UTC). */
  | 'broken'
  /** `Intl.DateTimeFormat` nie istnieje albo rzuca przy strefie. */
  | 'missing';

export interface ProbeCheck {
  /** Co sprawdzamy - zdaniem, nie nazwą funkcji: wynik czyta człowiek na telefonie. */
  name: string;
  passed: boolean;
  /** Czego oczekiwaliśmy i co wyszło - bez tego „nie działa" jest bezużyteczne. */
  expected: string;
  actual: string;
}

export interface ProbeResult {
  verdict: ProbeVerdict;
  checks: readonly ProbeCheck[];
  /** Strefa, którą zgłasza samo urządzenie (`resolvedOptions`) - albo `null`. */
  deviceZone: string | null;
  /** Jednozdaniowy wniosek dla ekranu - i dla zgłoszenia, gdyby ktoś je wysłał. */
  summary: string;
}

/** Fabryka formatera - wstrzykiwana, żeby dało się podstawić atrapę w teście. */
export type FormatterFactory = (zone: string) => {
  format: (date: Date) => string;
  resolvedOptions?: () => { timeZone?: string };
};

const defaultFactory: FormatterFactory = (zone) =>
  new Intl.DateTimeFormat('pl-PL', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/**
 * Przypadki z ZNANYMI odpowiedziami. Każdy pyta o coś innego:
 *  • lato i zima - czy w ogóle przesuwa i czy zna czas letni (bez ICU wyjdzie 10:00);
 *  • granica zmiany czasu - czy przesuwa we WŁAŚCIWEJ CHWILI, a nie stałym offsetem;
 *  • strefa odległa - czy dane nie są przycięte do jednej strefy.
 */
const CASES: readonly { name: string; zone: string; utc: string; expected: string }[] = [
  {
    name: 'Czas letni w strefie klubu (UTC+2)',
    zone: PROBE_ZONE,
    utc: '2026-06-15T10:00:00Z',
    expected: '12:00',
  },
  {
    name: 'Czas zimowy w strefie klubu (UTC+1)',
    zone: PROBE_ZONE,
    utc: '2026-01-15T10:00:00Z',
    expected: '11:00',
  },
  {
    name: 'Przed zmianą czasu (29 III, jeszcze zimowy)',
    zone: PROBE_ZONE,
    utc: '2026-03-29T00:30:00Z',
    expected: '01:30',
  },
  {
    name: 'Po zmianie czasu (29 III, już letni)',
    zone: PROBE_ZONE,
    utc: '2026-03-29T01:30:00Z',
    expected: '03:30',
  },
  {
    name: 'Strefa odległa (Nowy Jork, UTC-4 latem)',
    zone: FOREIGN_ZONE,
    utc: '2026-06-15T10:00:00Z',
    expected: '06:00',
  },
];

/** Godziny bywają formatowane ze spacją nierozdzielającą albo z kropką - normalizujemy. */
function normalize(text: string): string {
  return text.replace(/ | /g, ' ').replace(/\./g, ':').trim();
}

export function probeTimeZones(factory: FormatterFactory = defaultFactory): ProbeResult {
  const checks: ProbeCheck[] = [];
  let deviceZone: string | null = null;

  // Krok 0: czy formater w ogóle powstaje ze strefą. Brak `Intl` i wyjątek przy
  // `timeZone` to ten sam wniosek praktyczny - telefon nie policzy strefy sam.
  let probe: ReturnType<FormatterFactory>;
  try {
    probe = factory(PROBE_ZONE);
    deviceZone = probe.resolvedOptions?.().timeZone ?? null;
  } catch (err) {
    return {
      verdict: 'missing',
      deviceZone: null,
      checks: [
        {
          name: 'Formater ze strefą czasową',
          passed: false,
          expected: 'utworzony bez wyjątku',
          actual: err instanceof Error ? err.message : String(err),
        },
      ],
      summary:
        'Intl.DateTimeFormat nie przyjmuje strefy - offsety musi dosyłać serwer (plan awaryjny §6).',
    };
  }

  for (const probeCase of CASES) {
    try {
      const formatter = factory(probeCase.zone);
      const actual = normalize(formatter.format(new Date(probeCase.utc)));
      checks.push({
        name: probeCase.name,
        passed: actual === probeCase.expected,
        expected: probeCase.expected,
        actual,
      });
    } catch (err) {
      checks.push({
        name: probeCase.name,
        passed: false,
        expected: probeCase.expected,
        actual: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failed = checks.filter((c) => !c.passed);
  if (failed.length === 0) {
    return {
      verdict: 'ok',
      checks,
      deviceZone,
      summary: 'Strefy działają - telefon policzy godziny klubu sam, bez offsetów z serwera.',
    };
  }

  return {
    verdict: 'broken',
    checks,
    deviceZone,
    summary: `Strefy odpowiadają BŁĘDNIE (${failed.length} z ${checks.length} prób) - offsety musi dosyłać serwer (plan awaryjny §6).`,
  };
}
