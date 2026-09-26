/**
 * Ninerdeck - panel 2.0: ZAKRES DAT dziennika.
 *
 * ══ NATYWNE POLA DATY, BEZ WŁASNEGO KALENDARZA ══
 * Panel jest STRONĄ, więc kalendarz ma za darmo od przeglądarki - i wartość natywnego
 * pola to `YYYY-MM-DD`, czyli dokładnie format, którego chce serwer i adres. Aplikacja
 * pilota musiała zbudować własny (`CalendarGrid`, issue #58) wyłącznie dlatego, że
 * w React Native takiego pola nie ma. To ta sama zasada, która zdjęła z panelu makiety
 * HTML: korzystamy z tego, czym panel jest.
 *
 * ══ ZAKRES ODWROCONY JEST NIEOSIAGALNY, WIEC NIE MA O NIM KOMUNIKATU ══
 * `max` pola „od" to wartość pola „do", `min` pola „do" to wartość pola „od", a `max`
 * obu to dzisiaj. To jest ta sama reguła, którą serwer powiedziałby odmową `bad_range`
 * - tylko powiedziana wcześniej i bez odmowy.
 */

import { FilterChip } from '../../ui/components';
import {
  activeQuickRange,
  dayOf,
  LOGBOOK_QUICK,
  quickRangeLabel,
  rangeOf,
  type DayRange,
  type QuickRange,
} from './dateRanges';

interface DateRangeProps {
  range: DayRange;
  /**
   * „Dziś" z zegara SERWERA (`report.at`), nie z przeglądarki.
   *
   * Zegar przeglądarki jest trzecim, niesprawdzonym zegarem w systemie, a od tego,
   * co znaczy „dziś", zależy, które wiersze człowiek zobaczy - i czy uzna je za komplet.
   */
  now: number;
  /** Które chipy stoją na pasku - zestaw ekranu (`LOGBOOK_QUICK` domyślnie, `STATS_QUICK` w statystykach). */
  quick?: readonly QuickRange[];
  onChange: (range: DayRange) => void;
}

export function DateRange({ range, now, quick = LOGBOOK_QUICK, onChange }: DateRangeProps) {
  const today = dayOf(now);
  const active = activeQuickRange(range, now);

  return (
    <>
      <label className="daterange">
        <span className="visually-hidden">Od dnia</span>
        <input
          type="date"
          value={range.from}
          max={range.to < today ? range.to : today}
          onChange={(event) => onChange({ ...range, from: event.target.value })}
        />
      </label>
      <span className="daterange-sep" aria-hidden="true">
        →
      </span>
      <label className="daterange">
        <span className="visually-hidden">Do dnia</span>
        <input
          type="date"
          value={range.to}
          min={range.from}
          max={today}
          onChange={(event) => onChange({ ...range, to: event.target.value })}
        />
      </label>

      {quick.map((item) => (
        <FilterChip
          key={item}
          label={quickRangeLabel(item)}
          // Chip jest zapalony, gdy zakres RÓWNA SIĘ jego wartości - nie gdy go
          // kliknięto. Dzięki temu ręczna zmiana daty gasi go sama, a wpisanie tego
          // samego miesiąca z klawiatury zapala go z powrotem.
          on={active === item}
          onToggle={() => onChange(rangeOf(item, now))}
        />
      ))}
    </>
  );
}
