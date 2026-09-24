/**
 * Ninerdeck - panel: SZUFLADA PODGLĄDU pilota albo samolotu nad kolejką decyzji
 * (3.1.0, issue #206; makieta `kalendarz-podglad.html`, K6 i K6a).
 *
 * Szuflada, nie osobny ekran, bo podgląd JEST dygresją: wraca się z niego do tej
 * samej sprawy, w tym samym miejscu listy. Decyzja zapada na KARCIE pod spodem -
 * szuflada odpowiada wyłącznie na pytanie „kogo/co ja właściwie zatwierdzam" i nie ma
 * ani jednej akcji na sprawie. Gdyby niosła własne „Zatwierdź", byłyby dwa miejsca
 * na jedną decyzję.
 *
 * Fakty liczy serwer, JEDNYM zapytaniem dla panelu i telefonu (`previewLabels.ts`
 * składa z nich same napisy).
 */

import { useMemo } from 'react';

import { useAircraftPreview, usePilotPreview } from '../../queries/useApprovals';
import { Banner, Button, Card, Drawer, LinkButton, Loadable } from '../../ui/components';
import { errorMessage } from '../common/apiMessage';
import type { PersonLookup } from './bookingLabels';
import {
  aircraftPreview,
  pilotPreview,
  type KvRow,
  type PreviewTarget,
  type PreviewView,
  type RecentTable,
} from './previewLabels';

interface PreviewDrawerProps {
  target: PreviewTarget;
  person: PersonLookup;
  reg: (aircraftId: string) => string;
  onClose: () => void;
}

export function PreviewDrawer({ target, person, reg, onClose }: PreviewDrawerProps) {
  const pilot = usePilotPreview(target.kind === 'pilot' ? target : null);
  const aircraft = useAircraftPreview(target.kind === 'aircraft' ? target.bookingId : null);
  const query = target.kind === 'pilot' ? pilot : aircraft;

  // „Teraz" liczy się RAZ na odpowiedź: „ostatni lot 6 dni temu" nie ma prawa zmienić
  // się w trakcie czytania szuflady.
  const view: PreviewView | null = useMemo(() => {
    const opts = { person, reg, now: Date.now() };
    if (target.kind === 'pilot') return pilot.data == null ? null : pilotPreview(pilot.data, opts);
    return aircraft.data == null ? null : aircraftPreview(aircraft.data, opts);
  }, [target.kind, pilot.data, aircraft.data, person, reg]);

  const footer = (
    <>
      {target.kind === 'aircraft' ? (
        <LinkButton to={`/dziennik/${encodeURIComponent(target.label)}`} variant="ghost">
          Pokaż w dzienniku
        </LinkButton>
      ) : (
        <LinkButton to={`/piloci/${encodeURIComponent(target.pilotId)}`} variant="ghost">
          Pokaż kartę pilota
        </LinkButton>
      )}
      <Button onClick={onClose}>Zamknij</Button>
    </>
  );

  return (
    <Drawer
      title={view?.heading.title ?? target.label}
      sub={view?.heading.sub ?? ''}
      footer={footer}
      onClose={onClose}
    >
      {query.error == null ? null : (
        <Banner tone="danger" live>
          {errorMessage(query.error)}
        </Banner>
      )}
      <Loadable pending={query.isPending} skeleton={<PreviewSkeleton />}>
        {view == null ? null : (
          <>
            {view.cards.map((card) => (
              <Card title={card.title} key={card.title}>
                <KvRows rows={card.rows} />
              </Card>
            ))}
            <RecentCard table={view.recent} />
            <Card title={view.upcoming.title}>
              {view.upcoming.rows.length === 0 ? (
                <p className="hint">Poza tą sprawą nic nie stoi w kalendarzu.</p>
              ) : (
                <KvRows rows={view.upcoming.rows} />
              )}
            </Card>
          </>
        )}
      </Loadable>
    </Drawer>
  );
}

function KvRows({ rows }: { rows: readonly KvRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <div className="kv" key={row.label}>
          <span className="kv-k">{row.label}</span>
          <span className={row.tone === 'amber' ? 'kv-v amber' : 'kv-v'}>
            {row.mono ? <span className="mono">{row.value}</span> : row.value}
            {row.sub == null ? null : (
              <>
                {' '}
                <span className={row.subMono ? 'cell-sub mono' : 'cell-sub'}>{row.sub}</span>
              </>
            )}
          </span>
        </div>
      ))}
    </>
  );
}

function RecentCard({ table }: { table: RecentTable }) {
  return (
    <Card title={table.title}>
      {table.rows.length === 0 ? (
        <p className="hint">{table.empty}</p>
      ) : (
        <div className="table-wrap plain">
          <table>
            <thead>
              <tr>
                <th>Kiedy</th>
                <th>{table.whoHeader}</th>
                <th>Zadanie</th>
                <th className="num">Blok</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.when}</td>
                  <td className={row.whoMono ? 'mono' : undefined}>{row.who}</td>
                  <td>{row.task}</td>
                  <td className="num mono">{row.block}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PreviewSkeleton() {
  return (
    <div aria-busy="true">
      {[0, 1].map((card) => (
        <div className="card" key={card}>
          <span className="skeleton cell" style={{ width: '32%' }} />
          {[0, 1, 2].map((row) => (
            <div className="kv" key={row}>
              <span className="skeleton cell" style={{ width: '90px' }} />
              <span className="skeleton cell" style={{ width: row % 2 === 0 ? '44%' : '26%' }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
