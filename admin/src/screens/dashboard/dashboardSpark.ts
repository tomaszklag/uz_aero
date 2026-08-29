/**
 * UZ Aero - panel: WYKRES „NAPŁYW ZDARZEŃ 12 H" (moduł CZYSTY).
 *
 * ══ PANEL NIE LICZY HISTOGRAMU ══
 * Wiadra przychodzą POLICZONE z serwera (`GET /admin/api/dashboard`, agregat po
 * `events.received_at`). Ten moduł zamienia je na wysokości słupków i podpisy osi -
 * czyli robi arytmetykę PREZENTACJI, i dlatego jest `.ts` z testem, a nie wyrażeniem
 * w JSX-ie (`admin/test/architecture.test.ts` zakazuje `Math.round` w `.tsx`).
 *
 * Liczenie histogramu w przeglądarce wymagałoby ściągnięcia listy zdarzeń, której
 * pulpit nie potrzebuje - i byłoby dokładnie tym rodzajem arytmetyki, którego zakazuje
 * `docs/architektura-panelu-frontend.md` §2.2.
 *
 * ══ SŁUPEK ZEROWY JEST OSOBNĄ KLASĄ, NIE SŁUPKIEM O WYSOKOŚCI ZERO ══
 * Cytat z `SZABLON.html`: „cisza w rejestrze wymaga podpisu: nie znaczy »nikt nie
 * latał«, tylko »nic nie dotarło«". Zero rysujemy więc jako pustą ramkę (`.zero`)
 * o widocznej wysokości, a nie jako brak słupka - żeby przerwa w napływie była
 * WIDOCZNA, a nie niewidoczna.
 */

import { timeUtc } from '@uzaero/format';

import type { DashboardInflowDto } from '../../api/dto';

export interface SparkBar {
  key: string;
  /** Wysokość w procentach, gotowa do `style` - np. `"64%"`. */
  height: string;
  /** Pełna klasa słupka: `i`, `i.zero` albo `i.now`. Nigdy sklejana w `.tsx`. */
  className: string;
  /** Liczba zdarzeń w tym wiadrze - do etykiety dostępnościowej. */
  count: number;
  /** Początek wiadra (epoch ms UTC). */
  fromMs: number;
}

export interface SparkView {
  bars: SparkBar[];
  /** Trzy podpisy osi: początek, środek, koniec okna (z dopiskiem UTC). */
  axis: [string, string, string];
  /** Suma zdarzeń w oknie - potrzebna do zdania pod wykresem. */
  total: number;
  /** Ile wiader jest pustych - „cisza" ma być policzona, a nie oceniona na oko. */
  zeros: number;
}

/** Minimalna wysokość pustego słupka (%) - patrz nagłówek: zero ma być widoczne. */
const ZERO_HEIGHT = 4;
/** Maksymalna wysokość słupka (%) - najwyższy wypełnia wykres. */
const MAX_HEIGHT = 100;

export function sparkView(inflow: DashboardInflowDto): SparkView {
  const peak = Math.max(...inflow.buckets, 0);
  const last = inflow.buckets.length - 1;

  const bars = inflow.buckets.map((count, index) => ({
    key: `b${index}`,
    height: `${heightPct(count, peak)}%`,
    className: barClass(count, index === last),
    count,
    fromMs: inflow.fromMs + index * inflow.bucketMs,
  }));

  return {
    bars,
    axis: axisOf(inflow),
    total: inflow.buckets.reduce((sum, n) => sum + n, 0),
    zeros: inflow.buckets.filter((n) => n === 0).length,
  };
}

/**
 * Skala LINIOWA względem najwyższego słupka, nie względem stałej.
 *
 * Wykres odpowiada na pytanie „czy napływ się urwał", a nie „ile dokładnie przyszło" -
 * więc kształt ma być czytelny i przy dwóch zdarzeniach na godzinę, i przy dwustu.
 * Oś nie ma podziałki i to jest świadome: liczba stoi w karcie „Dziś w liczbach".
 */
function heightPct(count: number, peak: number): number {
  if (count === 0 || peak === 0) return ZERO_HEIGHT;
  return Math.max(ZERO_HEIGHT, Math.round((count / peak) * MAX_HEIGHT));
}

/**
 * Pełne literały klas - reguła „nazwa klasy nie powstaje przez sklejenie".
 * `now` wygrywa nad `zero`, bo bieżące wiadro jest NIEPEŁNE: właśnie się wypełnia,
 * więc jego pustka nie znaczy tego samego, co pustka wiadra domkniętego.
 */
function barClass(count: number, isLast: boolean): string {
  if (isLast) return 'now';
  return count === 0 ? 'zero' : '';
}

/** Trzy podpisy osi z mockupu: brzeg lewy, środek i brzeg prawy z dopiskiem UTC. */
function axisOf(inflow: DashboardInflowDto): [string, string, string] {
  const middle = inflow.fromMs + (inflow.toMs - inflow.fromMs) / 2;
  return [timeUtc(inflow.fromMs), timeUtc(middle), `${timeUtc(inflow.toMs)} UTC`];
}

/**
 * Zdanie pod wykresem. Wykres pokazuje, ŻE nic nie przyszło - nigdy dlaczego, i ekran
 * ma to powiedzieć wprost, bo to jedyna różnica między wariantem `A01` i `A01a`,
 * której nie widać na samych słupkach.
 */
export function sparkNote(view: SparkView): string {
  if (view.total === 0) {
    return 'Płasko przez całe okno - 0 zdarzeń w 12 h. Wykres pokazuje, że nic nie przyszło, nigdy dlaczego: cisza w rejestrze nie znaczy, że nikt nie lata. Odpowiedź jest w kartach obok.';
  }
  if (view.zeros > 0) {
    return `${view.total} zdarzeń w 12 h, w tym ${view.zeros} ${view.zeros === 1 ? 'godzina' : 'godzin'} bez ani jednego. Pusty słupek to nie awaria - telefon poza zasięgiem dośle zaległą paczkę, a ta trafi do słupka GODZINY PRZYJĘCIA, nie godziny lotu.`;
  }
  return `${view.total} zdarzeń w 12 h, napływ bez przerw. Oś to czas PRZYJĘCIA przez serwer, nie czas zdarzenia.`;
}
