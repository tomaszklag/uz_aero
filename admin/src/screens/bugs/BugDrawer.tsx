/**
 * UZ Aero - panel 2.0: karta ZGŁOSZENIA (`#/zgloszenia/:uuid`, issue #87).
 *
 * Trzy karty i jedna decyzja: co pilot napisał, co aplikacja dołączyła i co z tym
 * robimy. Szuflada jest SZEROKA (`wide`), bo kontekst to kilkanaście wierszy
 * klucz–wartość, a w wąskiej każdy z nich łamie się na dwie linie.
 *
 * ══ TREŚCI ZGŁOSZENIA NIE DA SIĘ ZMIENIĆ ══
 * I to nie jest brak funkcji. Opis jest cudzą relacją z tego, co się stało - poprawiony
 * przestałby nią być, a wtedy zniknęłaby jedyna rzecz, dla której ten moduł istnieje.
 * Zmienia się WYŁĄCZNIE status i komentarz obsługi.
 *
 * ══ CZEGO NIE MA ══
 * Kasowania i odpowiedzi do pilota. Pierwsze byłoby jedyną w panelu operacją niszczącą
 * dane, dla której nie ma powodu (odrzucenie z komentarzem niesie więcej). Drugie
 * byłoby komunikatorem, a testy trwają dwa tygodnie i klub ma telefony.
 */

import { useEffect, useRef, useState } from 'react';

import type { BugReportDto, BugStatusDto } from '../../api/dto';
import { useSetBugStatus } from '../../queries/useBugReports';
import { Banner, Button, Card, Drawer, Field, OptionButton, Pill } from '../../ui/components';
import { errorMessage } from '../common/apiMessage';
import { bugContextRows } from './bugRows';
import {
  BUG_STATUS_ORDER,
  bugSeverityLabel,
  bugSeverityTone,
  bugStatusBlocker,
  bugStatusDescription,
  bugStatusLabel,
  bugStatusTone,
} from './bugStatus';

interface BugDrawerProps {
  uuid: string;
  /** `null` = lista jeszcze nie przyszła; pusta tablica = przyszła i jest pusta. */
  reports: BugReportDto[] | null;
  listPending: boolean;
  onClose: () => void;
}

/** „4 września 2026, 09:41 UTC" byłoby dłuższe niż wiersz - zostaje ISO bez sekund. */
const stamp = (iso: string): string => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

export function BugDrawer({ uuid, reports, listPending, onClose }: BugDrawerProps) {
  const bug = reports?.find((item) => item.uuid === uuid) ?? null;

  const [status, setStatus] = useState<BugStatusDto>('new');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const save = useSetBugStatus();

  // Szkic przestawia się DOKŁADNIE wtedy, gdy zmienia się oglądane zgłoszenie - także
  // przy jego PIERWSZYM pojawieniu się, bo przy wejściu z linku szuflada montuje się
  // przed listą. Odświeżenie listy po zapisie tożsamości nie zmienia, więc nie kasuje
  // wpisanego komentarza (ten sam wzorzec, co w karcie samolotu).
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (bug == null || synced.current === bug.uuid) return;
    synced.current = bug.uuid;
    setStatus(bug.status);
    setNote(bug.statusNote ?? '');
    setDone(null);
    save.reset();
    // `save` jest stabilne między renderami tego samego hooka; dopisanie go tutaj
    // kasowałoby szkic przy każdej zmianie stanu mutacji.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bug]);

  if (bug == null) {
    return (
      <Drawer
        title="ZGŁOSZENIE"
        sub={uuid}
        onClose={onClose}
        footer={
          <Button variant="ghost" onClick={onClose}>
            Zamknij
          </Button>
        }
      >
        {listPending ? null : (
          <Banner tone="warn">
            Nie ma takiego zgłoszenia w bieżącym zawężeniu. Zmień filtr na „Wszystkie".
          </Banner>
        )}
      </Drawer>
    );
  }

  const blocker = bugStatusBlocker(bug.status, status, note, bug.statusNote);
  const context = bugContextRows(bug.context);

  return (
    <Drawer
      wide
      title={`ZGŁOSZENIE · ${bug.pilotCode ?? bug.pilotId}`}
      sub={
        <>
          {bug.screen} · {stamp(bug.createdAt)}
        </>
      }
      onClose={onClose}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Zamknij
        </Button>
      }
    >
      <Card
        title="Opis"
        actions={
          <>
            {bug.severity == null ? null : (
              <Pill tone={bugSeverityTone(bug.severity)}>{bugSeverityLabel(bug.severity)}</Pill>
            )}
            <Pill tone={bugStatusTone(bug.status)} dot>
              {bugStatusLabel(bug.status)}
            </Pill>
          </>
        }
      >
        <p className="bug-text">{bug.description}</p>
      </Card>

      <Card title="Obsługa">
        {bug.statusAt == null ? null : (
          <p className="hint">
            Ostatnia zmiana: <b>{bug.statusBy ?? '—'}</b>, {stamp(bug.statusAt)}.
          </p>
        )}

        {done == null ? null : <Banner tone="ok">{done}</Banner>}

        <div className="opt-list" role="radiogroup" aria-label="Status zgłoszenia">
          {BUG_STATUS_ORDER.map((option) => (
            <OptionButton
              key={option}
              name={bugStatusLabel(option)}
              desc={bugStatusDescription(option)}
              selected={status === option}
              onSelect={() => setStatus(option)}
            />
          ))}
        </div>

        <Field
          htmlFor="bug-note"
          label="Komentarz"
          hint="Co ustalono - zostaje przy zgłoszeniu i w dzienniku akcji."
        >
          <textarea
            id="bug-note"
            className="input area"
            value={note}
            placeholder="np. poprawione w 1.4.1; albo: nie umiem odtworzyć, poproszę o kroki"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {save.error == null ? null : (
          <Banner tone="danger" live>
            {errorMessage(save.error)}
          </Banner>
        )}

        <div className="confirm-actions">
          <Button
            variant="primary"
            size="sm"
            disabled={save.isPending || blocker != null}
            reason={blocker ?? undefined}
            onClick={() => {
              const trimmed = note.trim();
              save.mutate(
                { uuid: bug.uuid, status, note: trimmed === '' ? null : trimmed },
                { onSuccess: (row) => setDone(`Zapisano: ${bugStatusLabel(row.status)}.`) },
              );
            }}
          >
            Zapisz status
          </Button>
        </div>
      </Card>

      {/*
        KONTEKST WYPISANY W CAŁOŚCI - także pola, o których panel nie wie. To jest
        treść zgłoszenia („im więcej informacji tym lepiej"), a lista dozwolonych pól
        gubiłaby po cichu wszystko, co aplikacja dołoży w kolejnym tygodniu testów.
      */}
      <Card title="Kontekst okna">
        <div className="bug-context">
          {context.map((row) => (
            <div key={row.label} className="kv">
              <span className="kv-k">{row.label}</span>
              <span className="kv-v">{row.value}</span>
            </div>
          ))}
          <div className="kv">
            <span className="kv-k">Przyjęte przez serwer</span>
            <span className="kv-v">{stamp(bug.receivedAt)}</span>
          </div>
        </div>
      </Card>
    </Drawer>
  );
}
