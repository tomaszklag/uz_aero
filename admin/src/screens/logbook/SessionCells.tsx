/**
 * Ninerdeck - panel 3.2: komórki gridu operacji WSPÓLNE dla obu osi poziomu 2.
 *
 * Grid maszyny i grid pilota to JEDEN kształt (`docs/panel-3.2.md` §4.3, issue #42):
 * nagłówek doby, para godzin biegu z sygnaturą pod spodem, te same odczyty. Różnią się
 * dokładnie jedną kolumną (Pilot ↔ Samolot), więc reszta stoi tu, a nie w dwóch kopiach.
 */

import { Link } from 'react-router-dom';

import { Pill } from '../../ui/components';
import { flagPath } from '../attention/attentionPaths';
import type { DayGroup } from './dayGroups';
import type { CellPair, SessionRow } from './sessionRows';

const NO_FLAG_FILTER = { resolved: false, kind: null };

/**
 * Para wartości w jednej komórce - strzałka wygaszona, druga linia ją kwalifikuje.
 * `warn` to podpis bursztynem z ROZJAZDU (3.2.0, §6: „przekazano 92 L" pod paliwem) -
 * stoi pod zwykłą drugą linią, bo mówi o innej rzeczy niż ona.
 */
export function Pair({ value, warn = null }: { value: CellPair; warn?: string | null }) {
  return (
    <>
      <span className="cell-pair">
        {value.from}
        <span className="cell-arrow" aria-hidden="true">
          →
        </span>
        {value.to}
      </span>
      {value.note == null ? null : <span className="cell-sub">{value.note}</span>}
      {warn == null ? null : <span className="cell-sub warn">{warn}</span>}
    </>
  );
}

/**
 * Pierwsza komórka: para godzin BIEGU SILNIKA + sygnatura pod spodem - dokładnie jak
 * wiersz operacji na telefonie. Plakietki stoją przy parze: „Ręcznie" (wpis po fakcie)
 * i „Drugi pilot" (oś pilota, prawy fotel). Wpis unieważniony nie ma sygnatury
 * (numer w dobie dostają wyłącznie operacje ważne), więc jego druga linia to stan.
 */
export function OperationCell({ row, asDualRow = false }: { row: SessionRow; asDualRow?: boolean }) {
  return (
    <>
      <span className="cell-pair">
        {row.engine.from}
        <span className="cell-arrow" aria-hidden="true">
          →
        </span>
        {row.engine.to}
      </span>
      {row.manual ? (
        <>
          {' '}
          <Pill tone="dim">Ręcznie</Pill>
        </>
      ) : null}
      {asDualRow ? (
        <>
          {' '}
          <Pill tone="blue">Drugi pilot</Pill>
        </>
      ) : null}
      {/* OTWARTY ROZJAZD stoi PRZY operacji (3.2.0, §6) i prowadzi do sprawy - flaga
          opisuje operację, więc nie mieszka wyłącznie w skrzynce. Link w klasach
          plakietki, jak w makiecie. */}
      {row.flags.map((flag) => (
        <span key={flag.id}>
          {' '}
          <Link className="pill amber" to={flagPath(flag.id, NO_FLAG_FILTER)} title="Otwarty rozjazd - przejdź do skrzynki">
            {flag.label}
          </Link>
        </span>
      ))}
      {row.signature != null ? (
        <span className="cell-sub mono">{row.signature}</span>
      ) : row.voided ? (
        <span className="cell-sub">unieważniona</span>
      ) : null}
    </>
  );
}

/** Nagłówek doby: data z dniem tygodnia po lewej, sumy z serwera po prawej. */
export function DayHeader({ group }: { group: DayGroup }) {
  return (
    <span className="day-row-in">
      <span>
        {group.date}
        {group.weekday === '' ? null : (
          <>
            {' '}
            <span className="day-dow">{group.weekday}</span>
          </>
        )}
      </span>
      {group.sums.length === 0 ? null : (
        <span className="day-sums">
          {group.sums.map((sum, index) => (
            // Indeks w kluczu, bo etykieta „lot" pada dwa razy: liczba lotów i czas lotu.
            <span key={index}>
              {sum.aside ? '· ' : null}
              {sum.strong ? <b>{sum.value}</b> : sum.value} {sum.label}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
