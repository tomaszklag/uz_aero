/**
 * Ninerdeck - panel 3.2: SZUFLADA ROZSTRZYGNIĘCIA sprawy (`#/do-sprawdzenia/rozjazdy/:id`;
 * makieta `sprawdzenie-rozjazdy`).
 *
 * Tytuł nazywa ROZJAZD i maszynę, podtytuł - od kiedy i numer sprawy (mono, do wklejenia
 * w rozmowie). Karta „Co się nie zgadza" pokazuje liczby policzone przy przyjęciu zapisu;
 * „Operacje" prowadzi na poziom 3 obu ogniw; „Co z tym zrobić" mówi, którym narzędziem
 * się to naprawia - i NIC o tym, jak liczy się łańcuch odczytów. Notatka WYMAGANA, jak
 * powód korekty: rozstrzyga się cudzą sprawę, a notatka zostaje w dzienniku akcji.
 *
 * Dla flagi trzymającej kartę baner o re-eksporcie stoi PRZED przyciskiem, a przycisk
 * nazywa oba skutki („Zamknij sprawę i wyślij kartę") - skutek dla dokumentu klubu mówi
 * się zanim ktoś kliknie, nie potwierdzeniem po. Bez zdolności `flags.resolve` stopka
 * jest pusta, nie wyszarzona (§3.3: brak uprawnień = brak przycisku).
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { FlagDto } from '../../api/dto';
import { isHttpError } from '../../api/httpClient';
import { can } from '../../auth/can';
import { useResolveFlag } from '../../queries/useAttention';
import { useSession } from '../../queries/useSession';
import { Banner, Button, Card, Drawer, Field } from '../../ui/components';
import type { PersonLookup } from '../calendar/bookingLabels';
import { errorMessage } from '../common/apiMessage';
import { NONE } from '../common/values';
import { alreadyResolvedText, resolveNotice, type Notice } from './exportRows';
import { flagAdvice, flagFacts, flagLabel } from './flagLabels';
import { flagOpenedLabel, flagRow, sessionPilot, sessionRoleLabels } from './flagRows';

interface FlagDrawerProps {
  id: number;
  /** `null` = lista jeszcze nie przyszła; pusta tablica = przyszła i jest pusta. */
  flags: FlagDto[] | null;
  listPending: boolean;
  person: PersonLookup;
  onClose: () => void;
}

/** Odmowa 409 niesie AKTUALNY stan sprawy - kto i kiedy ją zamknął. */
function alreadyResolved(error: unknown, person: PersonLookup): string | null {
  if (!isHttpError(error) || error.status !== 409) return null;
  const flag = (error.body as { flag?: { resolvedBy: string | null; resolvedAt: string | null } }).flag;
  const by = flag?.resolvedBy == null ? null : (person(flag.resolvedBy)?.name ?? flag.resolvedBy);
  return alreadyResolvedText(by, flag?.resolvedAt ?? null);
}

export function FlagDrawer({ id, flags, listPending, person, onClose }: FlagDrawerProps) {
  const flag = flags?.find((item) => item.id === id) ?? null;
  const me = useSession();
  const allowed = can(me.data?.capabilities, 'flags.resolve');

  const [note, setNote] = useState('');
  const [done, setDone] = useState<Notice | null>(null);
  const resolve = useResolveFlag();

  // Szkic przestawia się DOKŁADNIE wtedy, gdy zmienia się oglądana sprawa (także przy jej
  // pierwszym pojawieniu się - przy wejściu z linku szuflada montuje się przed listą).
  const synced = useRef<number | null>(null);
  useEffect(() => {
    if (flag == null || synced.current === flag.id) return;
    synced.current = flag.id;
    setNote('');
    setDone(null);
    resolve.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag]);

  if (flag == null) {
    return (
      <Drawer
        title="Sprawa"
        sub={`#${id}`}
        onClose={onClose}
        footer={
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
        }
      >
        {listPending ? null : (
          <Banner tone="warn">Nie ma takiej sprawy w bieżącym zawężeniu. Zmień chip stanu albo rodzaju.</Banner>
        )}
      </Drawer>
    );
  }

  const row = flagRow(flag, Date.now(), Number.POSITIVE_INFINITY, person);
  const roles = sessionRoleLabels(flag);
  const holds = flag.status === 'open' && flag.blocksExport;
  const hanging = flag.sessions.find((session) => session.status === 'active');
  const heldTab = flag.sessions.find((session) => session.tab != null)?.tab ?? null;
  const conflict = alreadyResolved(resolve.error, person);
  const closed = flag.status === 'resolved' || done != null;

  const submit = (): void => {
    resolve.mutate(
      { id: flag.id, note: note.trim() },
      { onSuccess: (result) => setDone(resolveNotice(result)) },
    );
  };

  return (
    <Drawer
      title={`${flagLabel(flag.type)} · ${row.reg}`}
      sub={
        <>
          {flagOpenedLabel(flag)} · sprawa <span className="mono">#{flag.id}</span>
        </>
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {closed ? 'Zamknij' : 'Anuluj'}
          </Button>
          {closed || !allowed ? null : (
            <Button variant="primary" onClick={submit} disabled={note.trim() === '' || resolve.isPending}>
              {holds ? 'Zamknij sprawę i wyślij kartę' : 'Zamknij sprawę'}
            </Button>
          )}
        </>
      }
    >
      {done == null ? null : (
        <Banner tone={done.tone} live>
          {done.text}
        </Banner>
      )}

      <Card title="Co się nie zgadza">
        {flagFacts(flag).map((fact) => (
          <div className="kv" key={fact.label}>
            <span className="kv-k">{fact.label}</span>
            <span className={fact.tone == null ? 'kv-v' : `kv-v ${fact.tone}`}>{fact.value}</span>
          </div>
        ))}
      </Card>

      <Card title="Operacje">
        {row.sessions.length === 0 ? (
          <p className="hint">Operacje tej sprawy nie są już w dzienniku.</p>
        ) : (
          row.sessions.map((session, index) => (
            <div className="kv" key={session.uuid}>
              <span className="kv-k">{roles[index] ?? 'Operacja'}</span>
              <span className="kv-v">
                <Link className="cell-link" to={session.to}>
                  {session.name}
                </Link>{' '}
                <small>{sessionPilot(flag.sessions[index]!)}</small>
              </span>
            </div>
          ))
        )}
      </Card>

      <Card title="Co z tym zrobić">
        <p className="card-note">{flagAdvice(flag)}</p>
      </Card>

      {closed ? (
        <Card title="Rozstrzygnięcie">
          <div className="kv">
            <span className="kv-k">Rozstrzygnięte</span>
            <span className="kv-v">
              {row.resolvedBy ?? NONE}
              {row.resolvedAt == null ? null : <small> · {row.resolvedAt}</small>}
            </span>
          </div>
          {row.note == null ? null : <p className="card-note">„{row.note}"</p>}
        </Card>
      ) : (
        <Card title="Rozstrzygnięcie">
          {holds ? (
            <>
              <Banner tone="warn">
                <b>Zamknięcie tej sprawy wyśle kartę do arkusza.</b>{' '}
                {heldTab == null ? 'Karta doby' : `Karta ${heldTab}`} powstanie od nowa z obiema operacjami
                {hanging == null
                  ? '.'
                  : ` - jeśli operacja ${sessionPilot(hanging)} nadal będzie w toku, karta pójdzie bez niej z adnotacją „niekompletna".`}
              </Banner>
              {hanging == null ? null : (
                <div className="kv">
                  <span className="kv-k">Operacja w toku</span>
                  <span className="kv-v">
                    <Link className="cell-link" to={row.sessions.find((s) => s.uuid === hanging.sessionUuid)?.to ?? '#'}>
                      {hanging.signature ?? row.reg}
                    </Link>{' '}
                    <small>zakończ w dzienniku</small>
                  </span>
                </div>
              )}
            </>
          ) : null}

          {allowed ? (
            <Field htmlFor="flag-note" label="Notatka" hint="Zostaje w dzienniku akcji przy tej sprawie.">
              <textarea
                id="flag-note"
                className="input area"
                rows={3}
                value={note}
                placeholder="np. tankowanie z kanistrów dopisane do operacji; odczyt prawidłowy"
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          ) : (
            <p className="hint">Sprawę zamyka administrator klubu.</p>
          )}

          {conflict != null ? (
            <Banner tone="danger" live>
              {conflict}
            </Banner>
          ) : resolve.error == null ? null : (
            <Banner tone="danger" live>
              {errorMessage(resolve.error)}
            </Banner>
          )}
        </Card>
      )}
    </Drawer>
  );
}
