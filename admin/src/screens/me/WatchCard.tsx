/**
 * Ninerdeck - panel: karta „Obserwowane samoloty" na `#/konto` (3.2.0, issue #205,
 * decyzja 12; makieta `konto`; `docs/obserwowanie-samolotu.md` §6.6, §7.2).
 *
 * Cała flota klubu sesji jako przełączniki `.opt` z rolą checkbox - ten sam komponent,
 * którym karta członka nadaje zdolności; zaznaczony = obserwuję. Zapis OD RAZU, bez
 * szkicu i bez „Zapisz": to decyzja osoby o sobie, jak motyw, więc nie ma czego zbierać
 * w formularz. Karta istnieje WYŁĄCZNIE przy zdolności `fleet.watch` i w sesji klubu -
 * rozstrzyga o tym wołający (`AccountScreen`), a ten komponent zakłada, że wolno pytać.
 *
 * Nazwiska rozwiązuje lista członków, którą panel i tak ma (`usePilots`) - jak
 * kalendarz: odpowiedź listy niesie identyfikatory, nie napisy.
 *
 * Powiadomienia i tak przychodzą na telefon - panel niesie samą listę, a podpis pod
 * kartą to mówi.
 */

import { useMemo, useState } from 'react';

import { useSessionState } from '../../auth/sessionContext';
import { usePilots } from '../../queries/usePilots';
import { useMyWatches, useSetWatch } from '../../queries/useWatches';
import { Banner, Card, Loadable, OptionButton } from '../../ui/components';
import type { Person } from '../calendar/bookingLabels';
import { errorMessage } from '../common/apiMessage';
import { watchRows, type WatchRow } from './watchRows';

export function WatchCard() {
  const { session } = useSessionState();
  const watches = useMyWatches();
  const pilots = usePilots({});
  const set = useSetWatch();
  // Przygasa WYŁĄCZNIE wiersz, który właśnie się zapisuje - reszta listy działa dalej.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const person = useMemo(() => {
    const byId = new Map<string, Person>(
      (pilots.data?.items ?? []).map((p) => [p.id, { name: p.name, code: p.code }]),
    );
    return (pilotId: string): Person | null => byId.get(pilotId) ?? null;
  }, [pilots.data?.items]);

  const me = session?.pilot.id ?? '';
  const rows = useMemo(
    // „Teraz" liczy się przy każdej nowej odpowiedzi listy, nie przy każdym renderze:
    // to od niej zależy „dziś" i „jutro", a lista i tak czyta się na nowo po zapisie.
    () => (watches.data == null ? [] : watchRows(watches.data, { person, me, now: Date.now() })),
    [watches.data, person, me],
  );

  const toggle = (row: WatchRow): void => {
    setPendingId(row.aircraftId);
    set.mutate({ aircraftId: row.aircraftId, on: !row.on }, { onSettled: () => setPendingId(null) });
  };

  return (
    <Card title="Obserwowane samoloty" span2>
      {set.error == null ? null : (
        <Banner tone="warn" live>
          {errorMessage(set.error)}
        </Banner>
      )}
      <Loadable
        pending={watches.isPending}
        skeleton={<span className="skeleton" style={{ width: '100%', height: 46 }} />}
      >
        {watches.isError ? (
          <span className="hint danger">{errorMessage(watches.error)}</span>
        ) : rows.length === 0 ? (
          <span className="cell-sub">W klubie nie ma jeszcze żadnej maszyny.</span>
        ) : (
          <div className="opt-list" role="group" aria-label="Obserwowane samoloty w tym klubie">
            {rows.map((row) => (
              <OptionButton
                key={row.aircraftId}
                multiple
                name={row.name}
                desc={row.desc}
                selected={row.on}
                disabled={pendingId === row.aircraftId}
                onSelect={() => toggle(row)}
              />
            ))}
          </div>
        )}
      </Loadable>
      <span className="hint">
        Zmiana zapisuje się od razu. Powiadomienia o obserwowanych maszynach przychodzą na
        telefon - w skrzynce aplikacji.
      </span>
    </Card>
  );
}
