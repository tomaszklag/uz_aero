/**
 * Ninerdeck - panel: WIERSZ SKRZYNKI (`.inbox-row` z makiety `powiadomienia` PW2).
 *
 * Rysuje model z `inboxRows.ts` i nic nie liczy: ikona niesie rodzaj, ton - kolor ramki
 * ikony, podpis i treść składają się z kawałków (godziny krojem maszynowym, nazwiska
 * pogrubione, stara wartość przekreślona). Wiersz z adresem jest linkiem w CAŁOŚCI;
 * bez adresu - zwykłym blokiem, żeby nie udawać akcji, której nie ma.
 */

import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Pill } from '../../ui/components';
import {
  ChatIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  InfoIcon,
  PencilIcon,
  PersonCheckIcon,
  PersonXIcon,
  PlaneIcon,
  WarningIcon,
} from '../../ui/components/icons';
import type { InboxIcon, InboxRowVm, InboxTone, Segment } from './inboxRows';

const ICONS: Record<InboxIcon, (props: { size?: number }) => ReactNode> = {
  'person-check': PersonCheckIcon,
  'person-x': PersonXIcon,
  chat: ChatIcon,
  clock: ClockIcon,
  check: CheckIcon,
  pencil: PencilIcon,
  plane: PlaneIcon,
  warning: WarningIcon,
  cross: CloseIcon,
  info: InfoIcon,
};

const TONE: Record<InboxTone, string> = {
  ok: 'inbox-icon ok',
  ask: 'inbox-icon ask',
  warn: 'inbox-icon warn',
  no: 'inbox-icon no',
  plain: 'inbox-icon',
};

function Segments({ items }: { items: readonly Segment[] }) {
  return (
    <>
      {items.map((segment, index) => {
        if (segment.style === 'mono') return <span key={index} className="mono">{segment.text}</span>;
        if (segment.style === 'b') return <b key={index}>{segment.text}</b>;
        if (segment.style === 's') return <s key={index}>{segment.text}</s>;
        return <Fragment key={index}>{segment.text}</Fragment>;
      })}
    </>
  );
}

/**
 * Ikona, zdanie i godzina wiadomości - wspólne dla wiersza skrzynki i banera nowego
 * powiadomienia, bo oba mówią TO SAMO (makieta `powiadomienia` PW1 i PW2).
 */
export function InboxRowBody({ row }: { row: InboxRowVm }) {
  const Icon = ICONS[row.icon];
  return (
    <>
      <span className={TONE[row.tone]}>
        <Icon size={15} />
      </span>
      <span className="inbox-body">
        <span className="inbox-title">{row.title}</span>
        {row.sub.length === 0 ? null : (
          <span className="inbox-sub">
            <Segments items={row.sub} />
          </span>
        )}
        {row.text.length === 0 ? null : (
          <span className="inbox-text">
            <Segments items={row.text} />
          </span>
        )}
        {row.pill == null ? null : <Pill tone={row.pill.tone}>{row.pill.text}</Pill>}
      </span>
      <span className="inbox-when">{row.when}</span>
    </>
  );
}

interface InboxRowProps {
  row: InboxRowVm;
  /** Kliknięcie wiersza z adresem - szuflada zamyka się, a rzecz otwiera. */
  onOpen: () => void;
}

export function InboxRow({ row, onOpen }: InboxRowProps) {
  const className = row.isNew ? 'inbox-row new' : 'inbox-row';
  if (row.href == null) {
    return (
      <div className={className}>
        <InboxRowBody row={row} />
      </div>
    );
  }
  return (
    <Link className={className} to={row.href} onClick={onOpen}>
      <InboxRowBody row={row} />
    </Link>
  );
}
