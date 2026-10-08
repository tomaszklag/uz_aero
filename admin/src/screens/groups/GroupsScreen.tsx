/**
 * Ninerdeck - panel: GRUPY KLUBU (`#/piloci/grupy`, szuflada `#/piloci/grupy/:id`;
 * makieta `piloci-grupy`, P5/P5a/P5b; 4.0.0, epik Z-D #248; `docs/zlecenia.md` §6.1).
 *
 * Druga połowa modułu Piloci - tytuł zostaje „Piloci", bo to ten sam moduł. Akcja główna
 * zależy od połowy: na członkach „Kod klubu", na grupach „Nowa grupa" - wyłącznie przy
 * „Kontach pilotów" (decyzja 22: skład grup zmienia tylko administrator klubu). Każdy
 * z „Podglądem klubu" widzi grupy do odczytu: „Otwórz" zamiast „Edytuj" i szuflada bez
 * pól. Brak uprawnienia znaczy brak przycisku, nie przycisk wyszarzony.
 *
 * Szuflada istniejącej grupy ma adres (`:id`), bo opisuje byt, który już jest; szuflada
 * NOWEJ grupy adresu nie ma - jak każdy formularz tworzący byt, którego jeszcze nie ma.
 *
 * Grupy nie mają tematu w kanale klubu: odświeżają się przy wejściu, jak cały moduł Piloci.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { can } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { useDirectory } from '../../queries/useDirectory';
import { useGroups } from '../../queries/useGroups';
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  LinkButton,
  Loadable,
  PageHead,
  TableSkeleton,
  type Column,
} from '../../ui/components';
import { PeopleIcon, PlusIcon } from '../../ui/components/icons';
import { PilotsSwitch } from '../accounts/PilotsSwitch';
import { loadErrorMessage } from '../common/apiMessage';
import { GroupDrawer } from './GroupDrawer';
import { groupRows, type GroupRowVm } from './groupRows';

const HEADERS = ['Grupa', 'Członkowie', 'Skład', ''];

export function GroupsScreen() {
  const { session } = useSessionState();
  const navigate = useNavigate();
  const { id } = useParams();
  const [creating, setCreating] = useState(false);
  const manages = can(session?.capabilities, 'accounts.manage');

  const groups = useGroups();
  const directory = useDirectory();
  const rows = groupRows(groups.data?.groups ?? [], directory.data);
  const opened = id == null ? null : (groups.data?.groups.find((g) => g.id === id) ?? null);
  const error = groups.error ?? directory.error;

  // Adres istniejącej grupy wygrywa z formularzem nowej: wejście w link grupy przy
  // otwartym „Nowa grupa" ma pokazać tę grupę, a nie pusty szkic sprzed chwili.
  useEffect(() => {
    if (id != null) setCreating(false);
  }, [id]);

  const close = (): void => {
    setCreating(false);
    if (id != null) void navigate('/piloci/grupy');
  };

  const startNew = (): void => {
    setCreating(true);
    if (id != null) void navigate('/piloci/grupy');
  };

  const columns: Column<GroupRowVm>[] = [
    { key: 'name', header: 'Grupa', cellClass: 'cell-strong', render: (row) => row.name },
    {
      key: 'count',
      header: 'Członkowie',
      align: 'num',
      render: (row) => (
        <>
          {row.count}
          {row.countSub == null ? null : <span className="cell-sub">{row.countSub}</span>}
        </>
      ),
    },
    { key: 'composition', header: 'Skład', render: (row) => <span className="cell-sub">{row.composition}</span> },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      render: (row) => (
        <LinkButton to={`/piloci/grupy/${row.id}`} variant="ghost" size="sm">
          {manages ? 'Edytuj' : 'Otwórz'}
        </LinkButton>
      ),
    },
  ];

  const newGroupButton = (size: 'md' | 'sm') => (
    <Button variant="primary" size={size} onClick={startNew}>
      {size === 'md' ? <PlusIcon size={13} /> : null}
      Nowa grupa
    </Button>
  );

  return (
    <>
      <PageHead title="Piloci" actions={manages ? newGroupButton('md') : undefined} />

      <PilotsSwitch half="groups" />

      {error == null ? null : <Banner tone="danger">{loadErrorMessage(error)}</Banner>}

      <Loadable
        pending={groups.isPending || directory.isPending}
        loaded={groups.data != null && directory.data != null}
        skeleton={<TableSkeleton headers={HEADERS} widths={[110, 30, 320, 54]} rows={3} />}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<PeopleIcon size={20} />}
            title="Klub nie ma jeszcze grup"
            note={
              manages
                ? 'Grupa to nazwana lista członków - zlecenie lotu trafia do niej jednym wyborem, bez wskazywania każdej osoby z osobna.'
                : 'Grupa to nazwana lista członków, do której trafia zlecenie lotu. Grupy zakłada administrator klubu.'
            }
            action={manages ? newGroupButton('sm') : undefined}
          />
        ) : (
          <DataTable
            caption="Grupy klubu"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowClass={(row) => (row.id === id ? 'opened' : undefined)}
            onRowClick={(row) => navigate(`/piloci/grupy/${row.id}`)}
          />
        )}
      </Loadable>

      {creating && id == null ? (
        <GroupDrawer key="new" group={null} directory={directory.data} manages={manages} onClose={close} />
      ) : opened != null ? (
        <GroupDrawer key={opened.id} group={opened} directory={directory.data} manages={manages} onClose={close} />
      ) : null}
    </>
  );
}
