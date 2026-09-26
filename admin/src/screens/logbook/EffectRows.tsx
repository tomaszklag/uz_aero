/**
 * Ninerdeck - panel 3.2: wiersze „przed → po" karty skutku (`.kv` z `.was`).
 *
 * Wartość sprzed zmiany wygaszona (`.was`), bo jest punktem odniesienia, nie liczbą do
 * zapamiętania; „bez zmian" mówi, że nic się nie przesunęło, zamiast powtarzać tę samą
 * liczbę dwa razy (makieta `dziennik-edycja`). Wiersz bez odniesienia (nowy fakt)
 * niesie samą wartość.
 */

import type { EffectRow } from './sessionEdit';

export function EffectRows({ rows }: { rows: readonly EffectRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <div className="kv" key={row.label}>
          <span className="kv-k">{row.label}</span>
          <span className="kv-v">
            {row.was == null ? (
              row.now
            ) : row.same ? (
              <>
                {row.now} <small>bez zmian</small>
              </>
            ) : (
              <>
                <span className="was">{row.was}</span> → {row.now}
              </>
            )}
          </span>
        </div>
      ))}
    </>
  );
}
