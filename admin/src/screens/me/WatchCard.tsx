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
 * Nazwiska rozwiązuje SŁOWNIK klubu (`useDirectory`) - jak kalendarz i kolejka decyzji:
 * odpowiedź listy niesie identyfikatory, nie napisy. Nie lista modułu Piloci: ta stoi na
 * „Podglądzie klubu", a kartę widzi każdy z `fleet.watch` - zestaw Akceptujący ma ją bez
 * podglądu, dostawał więc 403 i zdania o maszynach traciły nazwiska bez słowa.
 *
 * Powiadomienia i tak przychodzą na telefon - panel niesie samą listę, a podpis pod
 * kartą to mówi.
 */

import { useMemo, useState } from 'react';

import { useSessionState } from '../../auth/sessionContext';
import { useDirectory } from '../../queries/useDirectory';
import { useMyWatches, useSetWatch } from '../../queries/useWatches';
import { Banner, Card, Loadable, OptionButton } from '../../ui/components';
import { personLookup } from '../calendar/directoryLookups';
import { errorMessage, loadErrorMessage } from '../common/apiMessage';
import { watchRows, type WatchRow } from './watchRows';

export function WatchCard() {
  const { session } = useSessionState();
  const watches = useMyWatches();
  const directory = useDirectory();
  const set = useSetWatch();
  // Przygasa WYŁĄCZNIE wiersz, który właśnie się zapisuje - reszta listy działa dalej.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const person = useMemo(() => personLookup(directory.data), [directory.data]);

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
      {/* Zdanie o nieudanym odczycie stoi PRZED listą, nie zamiast niej: lista sprzed
          nieudanego odświeżenia zostaje (przełączniki dalej działają), a bez danych
          `Loadable` nie rysuje nic - pod zdaniem nie staje „nie ma żadnej maszyny". */}
      {watches.error == null ? null : (
        <span className="hint danger">{loadErrorMessage(watches.error)}</span>
      )}
      {/* Czeka też na słownik: zdanie o maszynie bez nazwiska doskoczyłoby do pełnego
          chwilę później - ta sama reguła, co w kolejce decyzji. Słownik, który PADŁ,
          nie zabiera jednak listy: przełączniki działają i bez nazwisk. */}
      <Loadable
        pending={watches.isPending || directory.isPending}
        loaded={watches.data != null}
        skeleton={<span className="skeleton" style={{ width: '100%', height: 46 }} />}
      >
        {rows.length === 0 ? (
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
        Zmiana zapisuje się od razu. Powiadomienia o obserwowanych maszynach zobaczysz
        w aplikacji i pod dzwonkiem w panelu.
      </span>
    </Card>
  );
}
