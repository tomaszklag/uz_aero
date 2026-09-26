/**
 * Ninerdeck - panel 3.2: SZUFLADA DOPISANIA brakującego faktu (`docs/panel-3.2.md` §5.4;
 * makieta `dziennik-dopisanie`, wzorzec arkusza 10H z telefonu).
 *
 * Młodsza siostra korekty: ta sama zdolność, ten sam wymagany powód, ten sam podgląd
 * „przed → po" liczony przez serwer. Wąska siatka typów mówi o granicy sama - brak kafla
 * uruchomienia i wyłączenia silnika nie dostaje przypisu. Godzina startuje wypełniona
 * końcem biegu silnika, bo bez doby nie miałaby czego liczyć; podpis pod polem podaje
 * kopertę biegu jako instrukcję, a odmowa reguły (fakt po zdaniu, lądowanie bez startu)
 * wraca zdaniem domeny i blokuje zapis.
 */

import { parseLitres } from '@ninerdeck/format';
import type { SessionState } from '@ninerdeck/domain';
import { useState, type ReactNode } from 'react';

import type { AddedEventDto, SessionListItemDto } from '../../api/dto';
import { useAddEventPreview } from '../../queries/useLog';
import { useAddEvent } from '../../queries/useLogCommands';
import { Banner, Button, Card, Drawer, Field, TextInput } from '../../ui/components';
import { PlusIcon } from '../../ui/components/icons';
import { errorMessage, ruleViolationMessage } from '../common/apiMessage';
import { EffectRows } from './EffectRows';
import {
  addEffectRows,
  addableTypes,
  addedMessage,
  defaultAddAt,
  runBounds,
  runHint,
  sheetRevisionRow,
  timeFieldOf,
  timeOnDay,
  type AddableType,
} from './sessionEdit';

interface Props {
  session: SessionListItemDto;
  state: SessionState;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Ikony kafli - 1:1 z makiety; lokalne, bo poza tą siatką nikt ich nie rysuje. */
const ICONS: Record<AddableType, ReactNode> = {
  takeoff: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="6 11 12 5 18 11" />
    </svg>
  ),
  landing: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="18 13 12 19 6 13" />
    </svg>
  ),
  taxi: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </svg>
  ),
  refuel: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18" />
      <path d="M3 12h10" />
      <path d="M17 8h2a2 2 0 0 1 2 2v8a1 1 0 0 1-2 0v-5h-2" />
    </svg>
  ),
  drop: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 10a7 7 0 0 1 14 0" />
      <path d="M5 10v4l7 6 7-6v-4" />
      <path d="M12 20v-6" />
    </svg>
  ),
  boarding: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
      <path d="M17 11h5M19.5 8.5v5" />
    </svg>
  ),
  oil_add: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  ),
};

export function AddEventDrawer({ session, state, onClose, onSaved }: Props) {
  const anchor = defaultAddAt(state, session);
  const [type, setType] = useState<AddableType | null>(null);
  const [timeField, setTimeField] = useState(anchor == null ? '' : timeFieldOf(anchor));
  const [beforeL, setBeforeL] = useState('');
  const [addedL, setAddedL] = useState('');
  const [altitude, setAltitude] = useState('');
  const [jumpers, setJumpers] = useState({ tandem: '', aff: '', solo: '' });
  const [reason, setReason] = useState('');
  const add = useAddEvent();

  const at = anchor == null ? null : timeOnDay(anchor, timeField);
  const event = eventOf(type, at, { beforeL, addedL, altitude, jumpers });
  const preview = useAddEventPreview(session.sessionUuid, event);

  const violations = preview.data?.violations ?? [];
  const warnings = preview.data?.warnings ?? [];
  const blocked = event == null || reason.trim() === '' || violations.length > 0 || add.isPending;

  const failure =
    add.error == null ? null : (ruleViolationMessage(add.error) ?? errorMessage(add.error));

  const options = addableTypes(session.operation);

  return (
    <Drawer
      title="Dodaj wpis"
      sub={`${session.signature ?? session.reg ?? ''} · pilot zobaczy wpis na telefonie`}
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Anuluj
          </Button>
          <Button
            variant="primary"
            disabled={blocked}
            onClick={() => {
              if (event == null) return;
              add.mutate(
                { uuid: session.sessionUuid, event, reason: reason.trim() },
                { onSuccess: (result) => onSaved(addedMessage(event.type, event.at, result.reexport)) },
              );
            }}
          >
            <PlusIcon size={13} /> Dodaj wpis
          </Button>
        </>
      }
    >
      <Card title="Co się wydarzyło">
        <div className="type-grid" role="radiogroup" aria-label="Rodzaj zdarzenia">
          {options.map((option) => (
            <button
              type="button"
              key={option.type}
              className={type === option.type ? 'type-opt selected' : 'type-opt'}
              role="radio"
              aria-checked={type === option.type}
              onClick={() => setType(option.type)}
            >
              {ICONS[option.type]}
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Kiedy">
        <Field htmlFor="a-time" label="Godzina (UTC)" hint={runHint(runBounds(state)) ?? undefined}>
          <label className="daterange">
            <input
              type="time"
              step={1}
              id="a-time"
              value={timeField}
              onChange={(e) => setTimeField(e.target.value)}
            />
          </label>
        </Field>
      </Card>

      {type === 'refuel' ? (
        <Card title="Tankowanie">
          <div className="field-pair">
            <Field htmlFor="a-before" label="Stan przed (L)">
              <TextInput
                id="a-before"
                mono
                inputMode="decimal"
                value={beforeL}
                onChange={(e) => setBeforeL(e.target.value)}
              />
            </Field>
            <Field htmlFor="a-added" label="Dolano (L)">
              <TextInput
                id="a-added"
                mono
                inputMode="decimal"
                value={addedL}
                onChange={(e) => setAddedL(e.target.value)}
              />
            </Field>
          </div>
        </Card>
      ) : null}

      {type === 'oil_add' ? (
        <Card title="Dolewka oleju">
          <Field htmlFor="a-oil" label="Dolano (L)">
            <TextInput
              id="a-oil"
              mono
              inputMode="decimal"
              value={addedL}
              onChange={(e) => setAddedL(e.target.value)}
            />
          </Field>
        </Card>
      ) : null}

      {/* SKŁAD PIERWSZY (C12): treścią zrzutu jest to, KOGO wyniesiono - godzina stoi
          wyżej, bo jest wspólna dla każdego typu. Puste pola = skład niepodany, nie zero. */}
      {type === 'drop' ? (
        <Card title="Zrzut">
          <span className="label">Skład - ilu wyskoczyło</span>
          <div className="field-pair">
            <Field htmlFor="a-tandem" label="Tandem">
              <TextInput
                id="a-tandem"
                mono
                inputMode="numeric"
                value={jumpers.tandem}
                onChange={(e) => setJumpers({ ...jumpers, tandem: e.target.value })}
              />
            </Field>
            <Field htmlFor="a-aff" label="AFF">
              <TextInput
                id="a-aff"
                mono
                inputMode="numeric"
                value={jumpers.aff}
                onChange={(e) => setJumpers({ ...jumpers, aff: e.target.value })}
              />
            </Field>
          </div>
          <Field htmlFor="a-solo" label="Solo" hint="Opcjonalnie - puste pola znaczą skład niepodany.">
            <TextInput
              id="a-solo"
              mono
              inputMode="numeric"
              value={jumpers.solo}
              onChange={(e) => setJumpers({ ...jumpers, solo: e.target.value })}
            />
          </Field>
          <Field htmlFor="a-alt" label="Wysokość zrzutu (ft)" hint="Opcjonalnie - bez wpisu wysokość zostaje nieznana.">
            <TextInput
              id="a-alt"
              mono
              inputMode="numeric"
              value={altitude}
              onChange={(e) => setAltitude(e.target.value)}
            />
          </Field>
        </Card>
      ) : null}

      {warnings.map((w) => (
        <Banner tone="warn" key={w.code}>
          {w.message}
        </Banner>
      ))}

      {event == null ? null : (
        <Card title="Skutek · przed → po">
          {preview.data == null ? (
            <span className="skeleton cell" style={{ width: 220 }} />
          ) : (
            <EffectRows
              rows={[
                ...addEffectRows(preview.data.candidate, preview.data.before, preview.data.after, {
                  before: preview.data.consistency.before.length,
                  after: preview.data.consistency.after.length,
                }),
                sheetRevisionRow(session.exportRevision),
              ]}
            />
          )}
        </Card>
      )}

      {violations.length === 0 ? null : (
        <Banner tone="danger">{violations.map((v) => v.message).join(' ')}</Banner>
      )}

      <Card title="Powód">
        <Field
          htmlFor="a-reason"
          label="Powód dopisania"
          hint="Zobaczy go pilot w historii zmian; zostaje w dzienniku."
        >
          <textarea
            id="a-reason"
            className="input area"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </Card>

      {failure == null ? null : (
        <Banner tone="danger" live>
          {failure}
        </Banner>
      )}
    </Drawer>
  );
}

/** Kształt faktu z pól formularza; `null` = jeszcze nie ma czego pokazać ani zapisać. */
function eventOf(
  type: AddableType | null,
  at: number | null,
  fields: {
    beforeL: string;
    addedL: string;
    altitude: string;
    jumpers: { tandem: string; aff: string; solo: string };
  },
): AddedEventDto | null {
  if (type == null || at == null) return null;
  switch (type) {
    case 'takeoff':
    case 'landing':
    case 'taxi':
    case 'boarding':
      return { type, at };
    case 'refuel': {
      const before = parseLitres(fields.beforeL);
      const added = parseLitres(fields.addedL);
      if (before == null || added == null || added <= 0) return null;
      return { type, at, beforeL: before, addedL: added };
    }
    case 'oil_add': {
      const added = parseLitres(fields.addedL);
      if (added == null || added <= 0) return null;
      return { type, at, addedL: added };
    }
    case 'drop': {
      const altitude = fields.altitude.trim() === '' ? null : parseLitres(fields.altitude);
      if (fields.altitude.trim() !== '' && altitude == null) return null;
      const jumpers = jumpersOf(fields.jumpers);
      if (jumpers === undefined) return null;
      return { type, at, altitudeFt: altitude, jumpers };
    }
  }
}

/**
 * Skład z trzech pól: wszystkie puste = niepodany (`null`); wpisane = liczby całkowite,
 * puste pole obok wpisanego = zero; wpis nieczytelny = `undefined` (formularz czeka).
 */
function jumpersOf(fields: {
  tandem: string;
  aff: string;
  solo: string;
}): { tandem: number; aff: number; solo: number } | null | undefined {
  const texts = [fields.tandem, fields.aff, fields.solo].map((t) => t.trim());
  if (texts.every((t) => t === '')) return null;
  const counts = texts.map((t) => (t === '' ? 0 : Number(t)));
  if (counts.some((n) => !Number.isInteger(n) || n < 0)) return undefined;
  return { tandem: counts[0]!, aff: counts[1]!, solo: counts[2]! };
}
