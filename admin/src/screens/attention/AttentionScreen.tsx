/**
 * Ninerdeck - panel 3.2: „DO SPRAWDZENIA" - lista spraw z trzech źródeł (`#/do-sprawdzenia`;
 * `docs/panel-3.2.md` §9; makieta `sprawdzenie-lista`).
 *
 * Pulpit 1.0 miał osiem kafli z licznikami i panel 2.0 wyrzucił go świadomie. Wraca jego
 * jedyna użyteczna część: JEDNO pytanie („co wymaga mojej reakcji") i trzy odpowiedzi -
 * rozjazdy, karty bez arkusza, operacje wiszące. Liczniki są PODPISAMI tytułów, nie
 * kaflami; każdy wiersz jest LINKIEM do miejsca, w którym da się z tym coś zrobić; karta
 * bez spraw znika; stan pusty jest dobrą wiadomością i tak wygląda.
 *
 * NIE JEST ekranem startowym - Dziennik zostaje pierwszy (§3).
 */

import { Link } from 'react-router-dom';

import { useAttention } from '../../queries/useAttention';
import { Banner, Card, EmptyState, LinkButton, Loadable, PageHead } from '../../ui/components';
import { ChecklistIcon, ClockIcon, FlagIcon, SheetIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { attentionCards, type TodoCard } from './attentionRows';

const ICONS: Record<TodoCard['key'], (props: { size?: number }) => React.ReactNode> = {
  flags: FlagIcon,
  exports: SheetIcon,
  stale: ClockIcon,
};

export function AttentionScreen() {
  const attention = useAttention();
  const cards = attention.data == null ? [] : attentionCards(attention.data);

  return (
    <>
      <PageHead title="Do sprawdzenia" />

      {attention.error == null ? null : <Banner tone="danger">{errorMessage(attention.error)}</Banner>}

      <Loadable
        pending={attention.isPending}
        skeleton={
          <Card title="Rozjazdy">
            {[0, 1, 2].map((row) => (
              <span key={row} className="skeleton cell" style={{ width: 420, marginBottom: 12 }} />
            ))}
          </Card>
        }
      >
        {attention.data == null ? null : cards.length === 0 ? (
          <EmptyState
            icon={<ChecklistIcon />}
            title="Nic nie czeka"
            note="Rozjazdy wyjaśnione, każda zamknięta doba ma kartę w arkuszu, żadna operacja nie wisi."
          />
        ) : (
          cards.map((card) => <TodoCardView key={card.key} card={card} />)
        )}
      </Loadable>
    </>
  );
}

function TodoCardView({ card }: { card: TodoCard }) {
  const Icon = ICONS[card.key];
  return (
    <Card
      title={
        <>
          {card.title} <span className="card-count">· {card.count}</span>
        </>
      }
      actions={
        card.link == null ? undefined : (
          <Link className="cell-link" to={card.link.to}>
            {card.link.label}
          </Link>
        )
      }
    >
      <div className="todo-list">
        {card.rows.map((row) => (
          <Link key={row.key} className="todo-row" to={row.to}>
            <span className={row.tone === 'red' ? 'todo-icon red' : 'todo-icon'} aria-hidden="true">
              <Icon size={15} />
            </span>
            <span className="todo-body">
              <span className="todo-title">{row.title}</span>
              <span className="todo-meta">{row.meta}</span>
            </span>
            <span className={row.old ? 'todo-age old' : 'todo-age'}>{row.age}</span>
            <span className="todo-go" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
      </div>
      {card.more == null ? null : (
        <div className="card-foot">
          <LinkButton to={card.more.to} variant="ghost" size="sm">
            {card.more.label}
          </LinkButton>
        </div>
      )}
    </Card>
  );
}
