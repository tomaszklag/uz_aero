/**
 * UZ Aero — panel: CISZA SPODZIEWANA CZY PODEJRZANA (`A01a`, moduł CZYSTY).
 *
 * ══ DLACZEGO TEN PLIK W OGÓLE ISTNIEJE ══
 * Pulpit, który zawsze coś krzyczy, przestaje być czytany — a wtedy przestaje działać
 * także wtedy, gdy naprawdę krzyczy. Wariant „cisza" nie jest więc stanem pustym na
 * doczepkę: ma wyglądać jak POTWIERDZENIE, że jest dobrze, i musi odróżnić dwie rzeczy,
 * które w bazie offline-first zapisują się IDENTYCZNIE — jako nic:
 *
 *   • „dziś nikt nie lata"      → cisza SPODZIEWANA, zielono,
 *   • „nic do nas nie dociera"  → cisza PODEJRZANA, bursztyn.
 *
 * Sam brak wierszy nie rozstrzyga niczego. Rozstrzyga to, **czym skończył się ostatni
 * strumień**: domknięty dzień to cisza, urwany claim to alarm — nawet jeśli licznik
 * w obu przypadkach pokazuje zero.
 *
 * ══ DLACZEGO WERDYKT LICZY PANEL, A NIE SERWER ══
 * Bo jest wyłącznie KOLOREM BANERA: nie wystawia flagi, nie zmienia żadnej liczby
 * i nie ma konsumenta poza tym ekranem. Wszystkie FAKTY, z których wynika, przychodzą
 * z serwera i mają tam testy; tutaj powstaje z nich jedno zdanie. Gdyby werdykt kiedyś
 * miał skutek (powiadomienie, wpis w dzienniku), jego miejsce jest po stronie serwera —
 * i wtedy ten plik znika, a nie rozrasta się o drugą regułę.
 */

import { dateUtcShort, relativeAge, timeUtc } from '@uzaero/format';

import type { DashboardDto } from '../../api/dto';

/**
 * Po ilu godzinach bez ANI JEDNEGO zdarzenia cisza staje się podejrzana.
 *
 * Próg z mockupu `A01a` („Próg podejrzenia: 48 godz."), wypisany na ekranie razem
 * z werdyktem — administrator ma widzieć, wobec czego panel go wydał. Jest to próg
 * PREZENTACJI: nie wystawia flagi i nie zmienia żadnej liczby.
 */
export const SUSPICIOUS_AFTER_MS = 48 * 60 * 60 * 1000;

export type CiszaVerdict = 'expected' | 'suspicious' | 'unknown';

export interface CiszaReason {
  key: string;
  text: string;
}

export interface CiszaView {
  verdict: CiszaVerdict;
  /** Krótka plakietka do topbara i nagłówka karty. */
  label: string;
  /** Zdanie banera — pierwsze, co administrator czyta na pustym pulpicie. */
  headline: string;
  /**
   * Powody, dla których cisza JEST podejrzana. Pusta lista przy `expected` — i to
   * jest cała jej treść: werdykt zielony znaczy „sprawdziliśmy cztery rzeczy i żadna
   * nie pękła", a nie „nie mamy nic do powiedzenia".
   */
  reasons: CiszaReason[];
  /** Wiersze klucz–wartość karty „Cisza spodziewana czy podejrzana". */
  facts: { key: string; label: string; value: string; tone?: 'green' | 'amber' | 'red' }[];
}

/**
 * Czy pulpit jest w ogóle W CISZY.
 *
 * Warunek jest twardy: ani jednego otwartego claimu i ani jednego otwartego dnia.
 * Dopóki cokolwiek lata, pytanie „czy to cisza spodziewana" nie ma sensu — pulpit
 * pokazuje wtedy ruch.
 */
export function isQuiet(data: DashboardDto): boolean {
  return data.counts.aircraftClaimed === 0 && data.counts.openDays === 0;
}

export function ciszaView(data: DashboardDto): CiszaView {
  const nowMs = Date.parse(data.at);
  const lastEvent = data.recent[0] ?? null;
  const lastMs = lastEvent == null ? null : Date.parse(lastEvent.receivedAt);
  const reasons = ciszaReasons(data, nowMs, lastMs);

  const verdict: CiszaVerdict =
    lastMs == null && data.counts.exports.total === 0
      ? // Pusty rejestr to nie jest cisza po dniu lotnym — to stan sprzed pierwszego
        // synchronizowania. Nazwanie go „spodziewanym" byłoby uspokajaniem w sprawie,
        // o której nic nie wiemy.
        'unknown'
      : reasons.length > 0
        ? 'suspicious'
        : 'expected';

  return {
    verdict,
    label: LABEL[verdict],
    headline: headlineOf(verdict, data, nowMs, lastMs, lastEvent?.type ?? null),
    reasons,
    facts: factsOf(data, nowMs, lastMs),
  };
}

const LABEL: Record<CiszaVerdict, string> = {
  expected: 'Cisza spodziewana',
  suspicious: 'Cisza podejrzana',
  unknown: 'Rejestr pusty',
};

/**
 * Cztery warunki z mockupu `A01a`. Pęknięcie choćby jednego zmienia werdykt na bursztyn
 * i NAZYWA stan wprost — bo „coś jest nie tak" bez powiedzenia czego jest gorsze od
 * milczenia.
 */
function ciszaReasons(
  data: DashboardDto,
  nowMs: number,
  lastMs: number | null,
): CiszaReason[] {
  const out: CiszaReason[] = [];

  // 1. Claim otwarty, a od niego zero zdarzeń.
  const stranded = data.fleet.filter((row) => row.engine != null && row.engine.eventCount === 0);
  if (stranded.length > 0) {
    out.push({
      key: 'claim-bez-zdarzen',
      text: `Otwarty claim bez ani jednego zdarzenia: ${stranded.map((r) => r.aircraft.reg).join(' · ')}. Ktoś zajął samolot, a z telefonu nie dotarło nic.`,
    });
  }

  // 2. Sesja bez `day_close` starsza niż okno korekty.
  if (data.attention.staleOpenDays.length > 0) {
    out.push({
      key: 'dzien-bez-zamkniecia',
      text: `${data.attention.staleOpenDays.length} dzień lotny bez \`day_close\` stoi otwarty dłużej niż doba — karta arkusza nie powstanie, dopóki się nie zamknie.`,
    });
  }

  // 3. Ostatnie zdarzenie starsze niż próg podejrzenia.
  if (lastMs != null && nowMs - lastMs > SUSPICIOUS_AFTER_MS) {
    out.push({
      key: 'stary-rejestr',
      text: `Ostatnie zdarzenie przyjęliśmy ${relativeAge(nowMs - lastMs)} temu, czyli dłużej niż próg podejrzenia (48 godz.). To już nie jest przerwa w lataniu.`,
    });
  }

  // 4. Karta dnia niewyeksportowana.
  const { missing, blocked } = data.counts.exports;
  if (missing > 0) {
    out.push({
      key: 'karta-bez-arkusza',
      text: `${missing} zamkniętych dni nie ma karty w arkuszu — eksport odbił się awarią i nie zostawił po sobie śladu w żadnej tabeli.`,
    });
  }
  if (blocked > 0) {
    out.push({
      key: 'karta-zablokowana',
      text: `${blocked} kart dnia trzyma poza arkuszem otwarta flaga. Rozstrzygnięcie jej odblokuje eksport.`,
    });
  }

  return out;
}

function headlineOf(
  verdict: CiszaVerdict,
  data: DashboardDto,
  nowMs: number,
  lastMs: number | null,
  lastType: string | null,
): string {
  if (verdict === 'unknown') {
    return 'Rejestr jest pusty. Serwer nie przyjął jeszcze ani jednego zdarzenia, więc nie ma czego nazwać ciszą — to stan sprzed pierwszego synchronizowania telefonu.';
  }

  const since =
    lastMs == null
      ? 'Nie przyjęliśmy jeszcze żadnego zdarzenia'
      : `Ostatnie zdarzenie przyjęliśmy ${relativeAge(Math.max(0, nowMs - lastMs))} temu${lastType == null ? '' : ` — \`${lastType}\``}`;

  if (verdict === 'suspicious') {
    return `${since}. Ta pustka NIE jest zgodna z projektem: coś z ostatniego dnia lotnego zostało niedomknięte, więc milczenie telefonów nie tłumaczy się samo.`;
  }

  return `${since}. Każda sesja z ostatniego dnia lotnego jest domknięta, żaden samolot nie ma otwartego claimu, a karty dnia są w arkuszu. Rejestr milczy, bo nie ma czego zapisywać — nie dlatego, że coś przestało działać. Aplikacja pracuje offline-first i nie melduje się „na wszelki wypadek".`;
}

/**
 * Liczby, obok których pusty pulpit da się w ogóle przeczytać. Każda jest FAKTEM
 * z serwera; żadna nie jest oceną.
 */
function factsOf(
  data: DashboardDto,
  nowMs: number,
  lastMs: number | null,
): CiszaView['facts'] {
  const last = data.recent[0] ?? null;
  const { exports } = data.counts;

  return [
    {
      key: 'ostatnie-zdarzenie',
      label: 'Ostatnie zdarzenie',
      value:
        lastMs == null || last == null
          ? 'brak — rejestr pusty'
          : `${relativeAge(Math.max(0, nowMs - lastMs))} temu · ${dateUtcShort(lastMs)} ${timeUtc(lastMs)} · ${last.type} ${last.reg ?? last.aircraftId}`,
      tone: lastMs == null ? 'amber' : nowMs - lastMs > SUSPICIOUS_AFTER_MS ? 'amber' : 'green',
    },
    {
      key: 'ostatni-dzien',
      label: 'Ostatni dzień lotny',
      value:
        data.lastFlyingDay == null
          ? 'żaden dzień lotny jeszcze nie powstał'
          : `${data.lastFlyingDay.day} · ${data.lastFlyingDay.aircraft} ${data.lastFlyingDay.aircraft === 1 ? 'samolot' : 'samoloty'} · ${data.lastFlyingDay.flights} lotów`,
    },
    {
      key: 'bez-day-close',
      label: 'Sesje bez `day_close`',
      value: String(data.counts.openDays),
      tone: data.counts.openDays === 0 ? 'green' : 'amber',
    },
    {
      key: 'claimy',
      label: 'Otwarte claimy',
      value: `${data.counts.aircraftClaimed} z ${data.counts.aircraftTotal} samolotów`,
      tone: data.counts.aircraftClaimed === 0 ? 'green' : 'amber',
    },
    {
      key: 'karty',
      label: 'Karty dnia w arkuszu',
      value: `${exports.current} / ${exports.total}`,
      tone: exports.missing > 0 || exports.blocked > 0 ? 'amber' : 'green',
    },
    {
      key: 'prog',
      label: 'Próg podejrzenia',
      value: '48 godz. bez ani jednego zdarzenia',
    },
  ];
}
