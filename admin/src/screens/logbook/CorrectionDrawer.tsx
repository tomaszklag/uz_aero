/**
 * Ninerdeck - panel 3.2: SZUFLADA KOREKTY zdarzenia (`docs/panel-3.2.md` §5; makieta
 * `dziennik-edycja`, wzorzec 10E/10F/10G z telefonu).
 *
 * ══ TRZY FORMULARZE, JEDNA SZUFLADA ══
 * Rodzaj rozstrzyga typ zdarzenia (`editTargetOf`): czas dla faktów operacyjnych,
 * odczyty dla przejęcia i zdania, czas + skład dla zrzutu. Kosz „tego zdarzenia nie
 * było" stoi W LINII TYTUŁU - intencją wchodzącego jest poprawka, unieważnienie ma być
 * dostępne, nie eksponowane.
 *
 * ══ SKUTEK LICZY SERWER ══
 * Karta „przed → po" to podwójna projekcja z `/corrections/preview`; panel formatuje
 * pary i nic nie liczy. Odmowa reguły (cel niekorygowalny, czas z przyszłości) przychodzi
 * w TREŚCI podglądu i blokuje zapis; kolizja z pilotem jest banerem nad formularzem
 * i zapisu NIE wstrzymuje - administrator nie jest blokowany nigdy (§5.2).
 */

import { dateTimeUtcShort, parseLitres, parseMotoHours, timeUtcSeconds } from '@ninerdeck/format';
import type { SessionState } from '@ninerdeck/domain';
import { useMemo, useState } from 'react';

import type {
  AmendFieldsDto,
  CorrectionShapeDto,
  DirectoryMemberDto,
  SessionListItemDto,
  TimelineEntryDto,
} from '../../api/dto';
import { useCorrectionPreview } from '../../queries/useLog';
import { useCorrectEvent } from '../../queries/useLogCommands';
import { Banner, Button, Card, Drawer, Field, Select, TextInput } from '../../ui/components';
import { TrashIcon } from '../../ui/components/icons';
import { errorMessage, ruleViolationMessage } from '../common/apiMessage';
import { litres, motoHours, NONE, oilLitres } from '../common/values';
import { EffectRows } from './EffectRows';
import {
  authorLabel,
  correctedMessage,
  eventAt,
  flightOf,
  historyOf,
  readingEffectRows,
  sheetRevisionRow,
  shiftHint,
  timeEffectRows,
  timeFieldOf,
  timeOnDay,
  voidLabelOf,
  type EditTarget,
} from './sessionEdit';

interface Props {
  session: SessionListItemDto;
  state: SessionState;
  timeline: TimelineEntryDto[];
  target: EditTarget;
  members: readonly DirectoryMemberDto[];
  person: (id: string) => { name: string; code: string } | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Skład zrzutu z payloadu jako trzy pola tekstowe; brak składu = puste pola. */
function jumpersOf(entry: TimelineEntryDto): { tandem: string; aff: string; solo: string } {
  const data = (entry.event.payload ?? {}) as Record<string, unknown>;
  const jumpers = data.jumpers as Record<string, unknown> | null | undefined;
  const text = (key: string): string =>
    jumpers != null && typeof jumpers[key] === 'number' ? String(jumpers[key]) : '';
  return { tandem: text('tandem'), aff: text('aff'), solo: text('solo') };
}

/** Odczyty z payloadu przejęcia (`reading`) albo zdania (`finalReading`). */
function readingOf(entry: TimelineEntryDto): {
  fuel: string;
  mh: string;
  oil: string;
  notes: string;
  dual: string;
} {
  const data = (entry.event.payload ?? {}) as Record<string, unknown>;
  const reading = (data.reading ?? data.finalReading ?? {}) as Record<string, unknown>;
  const num = (v: unknown): string => (typeof v === 'number' ? String(v) : '');
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    fuel: num(reading.fuelL),
    mh: num(reading.mh),
    oil: num(data.oilL),
    notes: text(data.notes),
    dual: text(data.dualId),
  };
}

export function CorrectionDrawer({
  session,
  state,
  timeline,
  target,
  members,
  person,
  onClose,
  onSaved,
}: Props) {
  const { entry, kind } = target;
  const original = eventAt(entry.event);
  const isPreflight = entry.event.type === 'preflight_confirm';

  const [timeField, setTimeField] = useState(timeFieldOf(original));
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [jumpers, setJumpers] = useState(() => jumpersOf(entry));
  const [reading, setReading] = useState(() => readingOf(entry));
  const correct = useCorrectEvent();

  const newTime = timeOnDay(original, timeField);
  const retime: CorrectionShapeDto | null =
    target.canRetime && newTime != null && newTime !== original
      ? { targetUuid: entry.event.uuid, action: 'retime', newTime }
      : null;

  const amend: CorrectionShapeDto | null = useMemo(() => {
    const fields: AmendFieldsDto = {};
    if (kind === 'reading') {
      const start = readingOf(entry);
      const fuel = parseLitres(reading.fuel);
      const mh = parseMotoHours(reading.mh);
      if (reading.fuel !== start.fuel && fuel != null) fields.fuelL = fuel;
      if (reading.mh !== start.mh && mh != null) fields.mh = mh;
      if (isPreflight) {
        const oil = parseLitres(reading.oil);
        if (reading.oil !== start.oil && oil != null) fields.oilL = oil;
        if (reading.notes !== start.notes) fields.notes = reading.notes === '' ? null : reading.notes;
        if (reading.dual !== start.dual) fields.dualId = reading.dual === '' ? null : reading.dual;
      }
    }
    if (kind === 'drop') {
      const start = jumpersOf(entry);
      const changed =
        jumpers.tandem !== start.tandem || jumpers.aff !== start.aff || jumpers.solo !== start.solo;
      const counts = [jumpers.tandem, jumpers.aff, jumpers.solo].map((t) => Number(t === '' ? '0' : t));
      if (changed && counts.every((n) => Number.isInteger(n) && n >= 0)) {
        fields.jumpers = { tandem: counts[0]!, aff: counts[1]!, solo: counts[2]! };
      }
    }
    return Object.keys(fields).length === 0
      ? null
      : { targetUuid: entry.event.uuid, action: 'amend', fields };
  }, [entry, isPreflight, jumpers, kind, reading]);

  const voidShape: CorrectionShapeDto = { targetUuid: entry.event.uuid, action: 'void' };
  const shape = voiding ? voidShape : (retime ?? amend);
  const preview = useCorrectionPreview(session.sessionUuid, shape);

  const violations = preview.data?.violations ?? [];
  const warnings = preview.data?.warnings ?? [];
  const blocked =
    shape == null || reason.trim() === '' || violations.length > 0 || correct.isPending;

  const flight = flightOf(entry.event.uuid, state);
  const effect =
    preview.data == null
      ? []
      : kind === 'reading' && !voiding
        ? readingEffectRows(preview.data.before, preview.data.after, session.mhFormat)
        : timeEffectRows(preview.data.before, preview.data.after, flight);

  const failure =
    correct.error == null
      ? null
      : (ruleViolationMessage(correct.error) ?? errorMessage(correct.error));

  const history = historyOf(timeline, entry.event.uuid);

  const save = (): void => {
    if (shape == null) return;
    const done = (action: CorrectionShapeDto['action']) => (result: { reexport: { exported: boolean; revision?: number } | null }) =>
      onSaved(correctedMessage(target.title, action, result.reexport));
    const trimmed = reason.trim();
    if (voiding || retime == null || amend == null) {
      correct.mutate(
        { uuid: session.sessionUuid, shape, reason: trimmed },
        { onSuccess: done(shape.action) },
      );
      return;
    }
    // Czas I skład naraz to DWIE korekty tego samego celu - rejestr nie ma jednego
    // zdarzenia na obie, więc idą po sobie; druga dopiero po udanej pierwszej.
    correct.mutate(
      { uuid: session.sessionUuid, shape: retime, reason: trimmed },
      {
        onSuccess: () =>
          correct.mutate(
            { uuid: session.sessionUuid, shape: amend, reason: trimmed },
            { onSuccess: done('amend') },
          ),
      },
    );
  };

  const deviceNote =
    entry.event.gpsTime != null && entry.event.gpsTime !== entry.event.deviceTime
      ? `zegar telefonu ${timeUtcSeconds(entry.event.deviceTime)}`
      : null;
  const hint = [shiftHint(original, newTime ?? original), deviceNote].filter((p) => p != null).join(' · ');

  const dualOptions = [
    { value: '', label: 'Bez drugiego pilota' },
    ...members.map((m) => ({ value: m.id, label: `${m.name} · ${m.code}` })),
  ];

  return (
    <Drawer
      title={target.title}
      sub={target.sub}
      actions={
        target.canVoid && !voiding && !entry.voided ? (
          <button
            type="button"
            className="x-btn"
            aria-label={voidLabelOf(entry.event.type)}
            title={voidLabelOf(entry.event.type)}
            onClick={() => setVoiding(true)}
          >
            <TrashIcon size={15} />
          </button>
        ) : null
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Anuluj
          </Button>
          <Button variant={voiding ? 'danger' : 'primary'} disabled={blocked} onClick={save}>
            {voiding ? voidLabelOf(entry.event.type) : 'Zapisz korektę'}
          </Button>
        </>
      }
    >
      {warnings.map((w) => (
        <Banner tone="warn" key={w.code}>
          <b>{w.message}</b> Twoja korekta zapisze się mimo to.
        </Banner>
      ))}

      {voiding ? (
        <Card title={voidLabelOf(entry.event.type)} tone="danger">
          <p className="card-note">
            Wiersz zostanie przekreślony, a liczby operacji policzone bez niego. Sam zapis
            zostaje - widać, że był i że go wycofano.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setVoiding(false)}>
            Wróć do poprawki
          </Button>
        </Card>
      ) : null}

      {!voiding && (kind === 'time' || kind === 'drop') && target.canRetime ? (
        <Card title="Czas zdarzenia">
          <Field htmlFor="c-time" label="Godzina (UTC)" hint={hint === '' ? undefined : hint}>
            <label className="daterange">
              <input
                type="time"
                step={1}
                id="c-time"
                value={timeField}
                onChange={(e) => setTimeField(e.target.value)}
              />
            </label>
          </Field>
        </Card>
      ) : null}

      {!voiding && kind === 'drop' ? (
        <Card title="Skład - ilu wyskoczyło">
          <div className="field-pair">
            <Field htmlFor="c-tandem" label="Tandem">
              <TextInput
                id="c-tandem"
                mono
                inputMode="numeric"
                value={jumpers.tandem}
                onChange={(e) => setJumpers({ ...jumpers, tandem: e.target.value })}
              />
            </Field>
            <Field htmlFor="c-aff" label="AFF">
              <TextInput
                id="c-aff"
                mono
                inputMode="numeric"
                value={jumpers.aff}
                onChange={(e) => setJumpers({ ...jumpers, aff: e.target.value })}
              />
            </Field>
          </div>
          <Field htmlFor="c-solo" label="Solo">
            <TextInput
              id="c-solo"
              mono
              inputMode="numeric"
              value={jumpers.solo}
              onChange={(e) => setJumpers({ ...jumpers, solo: e.target.value })}
            />
          </Field>
        </Card>
      ) : null}

      {!voiding && kind === 'reading' ? (
        <Card title={isPreflight ? 'Odczyty przy przejęciu' : 'Odczyty przy zdaniu'}>
          <div className="field-pair">
            <Field htmlFor="c-fuel" label="Paliwo (L)">
              <TextInput
                id="c-fuel"
                mono
                inputMode="decimal"
                value={reading.fuel}
                onChange={(e) => setReading({ ...reading, fuel: e.target.value })}
              />
            </Field>
            <Field htmlFor="c-mh" label="Licznik motogodzin">
              <TextInput
                id="c-mh"
                mono
                inputMode="decimal"
                value={reading.mh}
                onChange={(e) => setReading({ ...reading, mh: e.target.value })}
              />
            </Field>
          </div>
          {isPreflight ? (
            <>
              <Field htmlFor="c-oil" label="Olej (L)">
                <TextInput
                  id="c-oil"
                  mono
                  inputMode="decimal"
                  value={reading.oil}
                  onChange={(e) => setReading({ ...reading, oil: e.target.value })}
                />
              </Field>
              <Field htmlFor="c-dual" label="Drugi pilot">
                <Select
                  id="c-dual"
                  value={reading.dual}
                  options={dualOptions}
                  onChange={(value) => setReading({ ...reading, dual: value })}
                />
              </Field>
              <Field htmlFor="c-notes" label="Notatka">
                <textarea
                  id="c-notes"
                  className="input area"
                  rows={2}
                  value={reading.notes}
                  onChange={(e) => setReading({ ...reading, notes: e.target.value })}
                />
              </Field>
            </>
          ) : null}
        </Card>
      ) : null}

      {shape == null ? null : (
        <Card title="Skutek · przed → po">
          {preview.isPending ? (
            <span className="skeleton cell" style={{ width: 220 }} />
          ) : (
            <EffectRows rows={[...effect, sheetRevisionRow(session.exportRevision)]} />
          )}
        </Card>
      )}

      {violations.length === 0 ? null : (
        <Banner tone="danger">{violations.map((v) => v.message).join(' ')}</Banner>
      )}

      <Card title="Powód">
        <Field
          htmlFor="c-reason"
          label={voiding ? 'Powód unieważnienia' : 'Powód korekty'}
          hint="Zobaczy go pilot w historii zmian; zostaje w dzienniku."
        >
          <textarea
            id="c-reason"
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

      {history.length === 0 ? null : (
        <Card title="Historia zmian">
          <div className="hist">
            {history.map((item) => (
              <div className="hist-item" key={item.at}>
                <div className="hist-rail">
                  <span className={item.action === 'void' ? 'hist-dot void' : 'hist-dot'} />
                </div>
                <div className="hist-body">
                  <span className="hist-when">{dateTimeUtcShort(item.at)} UTC</span>
                  {item.change == null ? (
                    <span className={item.action === 'void' ? 'hist-verdict void' : 'hist-verdict'}>
                      {item.action === 'void'
                        ? 'unieważnione'
                        : `poprawiono: ${item.fields ?? 'wartości'}`}
                    </span>
                  ) : (
                    <span className="hist-change">
                      <span className="hist-from">{item.change.from}</span>
                      <span className="hist-arrow">→</span>
                      <span>{item.change.to}</span>
                    </span>
                  )}
                  <span className="hist-who">{authorLabel(item.adminAuthorId, person)}</span>
                  <span className={item.reason == null ? 'hist-reason none' : 'hist-reason'}>
                    {item.reason ?? 'bez powodu'}
                  </span>
                </div>
              </div>
            ))}
            <div className="hist-item">
              <div className="hist-rail">
                <span className="hist-dot origin" />
              </div>
              <div className="hist-body">
                <span className="hist-when">{dateTimeUtcShort(original)} UTC</span>
                <span className="hist-verdict">zapis pierwotny</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {kind === 'reading' ? (
        <p className="hint">
          Teraz w rejestrze:{' '}
          {isPreflight
            ? `paliwo ${litres(state.fuel.startL)} · licznik ${motoHours(state.mh.start, session.mhFormat)} · olej ${oilLitres(state.oil.levelL)}`
            : `paliwo ${litres(state.fuel.endL)} · licznik ${motoHours(state.mh.end, session.mhFormat)}`}
          {state.fuel.startL == null && state.fuel.endL == null ? ` · ${NONE}` : ''}
        </p>
      ) : null}
    </Drawer>
  );
}
