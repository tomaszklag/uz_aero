/**
 * UZ Aero - panel: kolejka zgłoszeń kodem klubu nad listą pilotów (mockup `piloci-lista`,
 * karta ZGŁOSZENIA; issue #101, E3).
 *
 * ══ STOI NAD LISTĄ I ZNIKA, GDY JEST PUSTA ══
 * Kolejka jest ZADANIEM do zrobienia, a lista - stanem, więc zadanie stoi wyżej. Pusta
 * kolejka nie dostaje karty z zerem: stan domyślny nie zajmuje ekranu (reguła SyncChipa
 * z issue #12). Liczba w tytule to `items.length`, a nie druga liczba z odpowiedzi -
 * dwie mogłyby się rozjechać.
 *
 * ══ WIDZI JĄ WYŁĄCZNIE `accounts.manage` ══
 * W wierszach stoją adresy e-mail ludzi, których w klubie NIE MA. Zdolność jest
 * atrybutem TRASY po stronie serwera; tutaj decyduje o tym, czy w ogóle pytamy.
 */

import type { MembershipQueueDto } from '../../api/dto';
import { Card, DataTable, LinkButton, type Column } from '../../ui/components';
import { requestRow, type RequestRow } from './requestRows';

export function PendingCard({ queue }: { queue: MembershipQueueDto | undefined }) {
  const rows = (queue?.items ?? []).map(requestRow);
  if (rows.length === 0) return null;

  const columns: Column<RequestRow>[] = [
    { key: 'name', header: 'Imię u Google', cellClass: 'cell-strong', render: (row) => row.name },
    { key: 'email', header: 'E-mail', cellClass: 'cell-sub', render: (row) => row.email },
    { key: 'waiting', header: 'Czeka od', cellClass: 'cell-sub', render: (row) => row.waiting },
    {
      key: 'actions',
      header: '',
      cellClass: 'row-actions',
      render: (row) => (
        // Akcja GŁÓWNA (`primary`), inaczej niż „Edytuj" na liście: to jest zadanie
        // do zrobienia, a nie jedno z wielu wejść w stan, który już jest.
        <LinkButton to={`/piloci/zgloszenia/${row.pilotId}`} size="sm" variant="primary">
          Rozpatrz
        </LinkButton>
      ),
    },
  ];

  return (
    <Card title={`Zgłoszenia kodem klubu · ${rows.length}`}>
      <DataTable
        caption="Zgłoszenia czekające na decyzję"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.pilotId}
      />
    </Card>
  );
}
