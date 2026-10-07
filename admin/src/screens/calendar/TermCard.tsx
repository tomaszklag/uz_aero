/**
 * Ninerdeck - panel: KROK TERMINU - „Kiedy i czym" (makiety K7 i ZL2a; issue #233,
 * epik Z-D #248).
 *
 * Wspólny dla własnej rezerwacji i zlecenia, bo zlecenie JEST rezerwacją, która szuka
 * załogi (`docs/zlecenia.md` §2.1) i o termin konkuruje tak samo - ta sama zasada, co
 * `TermStep` w telefonie. Maszyna `<select>`, dzień, pasek zajętości doby lotnej, sugestie
 * slotów liczone przez domenę i para godzin czasem klubu. Różnią się dwie rzeczy i obie
 * przychodzą propsami: kolor szkicu na pasku (zieleń własnego terminu albo błękit
 * zlecenia) i to, co stoi nad kartą (baner poprawki).
 *
 * Zajętość i sugestie pobiera SAM komponent: reguły panelu nie pozwalają na hook poza
 * `queries/` (moduł czysty w `screens/` nie zna Reacta), a dwie szuflady powtarzające te
 * same pytania o serwer byłyby dwiema kopiami tego samego kroku.
 *
 * ══ ODMOWA „TERMIN ZAJĘTY" WRACA TUTAJ ══
 * `slot_taken` stawia baner nad kartą (K7b, ZL2c): co stoi w tym czasie, od kiedy, a akcją
 * jest najbliższe wolne pasmo tej samej długości. Kolizja widoczna na pasku nie blokuje
 * „Dalej" - o terminie rozstrzyga serwer.
 */

import { useMemo, type ReactNode } from 'react';

import { useDayOccupancy, useSuggestions } from '../../queries/useCalendar';
import { Banner, Button, Card, Field, Pill, TextInput } from '../../ui/components';
import type { Blocker } from './blockForm';
import { onWeekday, type PersonLookup } from './bookingLabels';
import type { CalendarAircraft } from './calendarGrid';
import { clubNoon, clubToday } from './clubClock';
import { buildDayTrack, slotNote } from './dayTrack';
import { draftSlot, lengthLabel, suggestionMinutes, type TermFields } from './ownBookingForm';
import { takenBanner } from './ownBookingRefusal';
import { buildSlotTiles, nearestTile } from './slotTiles';

interface Props {
  /** Przedrostek identyfikatorów pól - dwie szuflady nie mają prawa dzielić `id`. */
  idPrefix: string;
  term: TermFields;
  onChange: (next: Partial<TermFields>) => void;
  aircraft: readonly CalendarAircraft[];
  tz: string;
  person: PersonLookup;
  viewerId: string | null;
  /** Poprawiana zajętość nie jest zajętością dla samej siebie - to jest szkic. */
  exceptId: string | null;
  /** Czyj szkic stoi na pasku: własny termin (zieleń) albo zlecenie (błękit). */
  draft: 'own' | 'order';
  /** Ostatnia odmowa zapisu - `slot_taken` dostaje tu baner z najbliższym wolnym pasmem. */
  error: unknown;
  blocker: Blocker;
  /** Baner nad kartą (skutek poprawki terminu). */
  notice?: ReactNode;
  /** Podpis pod wyborem maszyny (inna maszyna w poprawce rezerwacji). */
  aircraftHint?: ReactNode;
}

export function TermCard({
  idPrefix,
  term,
  onChange,
  aircraft,
  tz,
  person,
  viewerId,
  exceptId,
  draft,
  error,
  blocker,
  notice,
  aircraftHint,
}: Props) {
  const reg = aircraft.find((a) => a.id === term.aircraftId)?.reg ?? '';
  const slot = draftSlot(term, tz);
  const noon = term.date === '' ? null : clubNoon(term.date, tz);
  const minutes = suggestionMinutes(slot);

  const occupancy = useDayOccupancy(
    noon == null || term.aircraftId === ''
      ? null
      : { from: new Date(noon).toISOString(), to: new Date(noon + 1).toISOString(), aircraftId: term.aircraftId },
  );
  const suggestions = useSuggestions(
    noon == null || term.aircraftId === '' ? null : { aircraftId: term.aircraftId, day: new Date(noon).toISOString(), minutes },
  );

  const busy = useMemo(
    () => (occupancy.data?.bookings ?? []).filter((b) => b.id !== exceptId),
    [occupancy.data, exceptId],
  );
  const day = occupancy.data?.days[0];
  const window = suggestions.data?.window;

  const track = useMemo(
    () =>
      day == null || window == null
        ? null
        : buildDayTrack({
            day: { startsAt: Date.parse(day.startsAt), endsAt: Date.parse(day.endsAt) },
            window: { from: Date.parse(window.from), to: Date.parse(window.to) },
            busy,
            slot,
            free: suggestions.data?.free ?? null,
            tz,
            person,
            draft,
          }),
    [day, window, busy, slot, suggestions.data, tz, person, draft],
  );

  const tiles = useMemo(
    () =>
      window == null
        ? []
        : buildSlotTiles({
            suggestions: suggestions.data?.suggestions ?? [],
            busy,
            window: { from: Date.parse(window.from), to: Date.parse(window.to) },
            slot,
            tz,
            person,
          }),
    [window, suggestions.data, busy, slot, tz, person],
  );

  const note = slotNote(slot, busy, reg, tz, person);
  const taken = error == null ? null : takenBanner(error, { reg, tz, now: Date.now(), viewerId, person });
  const fix = taken == null ? null : nearestTile(tiles, slot);
  const dayAt = noon == null ? null : new Date(noon);
  const id = (field: string): string => `${idPrefix}-${field}`;

  return (
    <>
      {taken == null ? null : (
        <Banner
          tone="warn"
          live
          action={
            fix == null ? null : (
              <Button variant="ghost" size="sm" onClick={() => onChange({ from: fix.from, to: fix.to })}>
                Weź {fix.hours}
              </Button>
            )
          }
        >
          <b>{taken.lead}</b> {taken.body}
        </Banner>
      )}

      {notice ?? null}

      <Card title="Kiedy i czym">
        <div className="field-row">
          <Field htmlFor={id('aircraft')} label="Samolot">
            <select
              id={id('aircraft')}
              className="input"
              value={term.aircraftId}
              onChange={(e) => onChange({ aircraftId: e.target.value })}
            >
              <option value="">Wybierz maszynę</option>
              {aircraft.map((a) => (
                // Maszyna poza służbą stoi na liście, ale nie da się jej wybrać:
                // serwer i tak odmówiłby (`aircraft_disabled`).
                <option key={a.id} value={a.id} disabled={!a.inService}>
                  {a.reg} · {a.type}
                  {a.inService ? '' : ' · poza służbą'}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor={id('day')} label="Dzień">
            <TextInput
              id={id('day')}
              type="date"
              mono
              min={clubToday(Date.now(), tz)}
              value={term.date}
              onChange={(e) => onChange({ date: e.target.value })}
            />
          </Field>
        </div>
        {aircraftHint ?? null}

        {track == null || dayAt == null ? null : (
          <div className="field">
            <span className="label">
              Zajętość {reg} {onWeekday(dayAt, tz)}
            </span>
            <div className="daytrack">
              <div className="daytrack-bar" role="img" aria-label={track.aria}>
                {track.segments.map((s, i) => (
                  <span
                    key={i}
                    className={s.tone === 'busy' ? 'daytrack-busy' : `daytrack-busy ${s.tone}`}
                    style={{ left: `${s.left}%`, width: `${s.width}%`, opacity: s.clash ? 0.7 : undefined }}
                    title={s.title}
                  />
                ))}
              </div>
              <div className="daytrack-scale">
                {track.scale.map((label, i) => (
                  <span key={i}>{label}</span>
                ))}
              </div>
              {track.free == null ? null : <span className="daytrack-free">{track.free}</span>}
            </div>
          </div>
        )}

        {window == null ? null : (
          <div className="field">
            <div className="label-row">
              <span className="label">Sugerowane godziny</span>
              <Pill tone="dim">{lengthLabel(minutes)}</Pill>
            </div>
            {tiles.length === 0 ? (
              <p className="hint">W tej dobie nie ma wolnego miejsca tej długości.</p>
            ) : (
              <div className="slots">
                {tiles.map((t) => (
                  <button
                    type="button"
                    key={t.startsAt}
                    className={t.on ? 'slot on' : 'slot'}
                    aria-pressed={t.on}
                    onClick={() => onChange({ from: t.from, to: t.to })}
                  >
                    <span className="slot-h">{t.hours}</span>
                    <span className="slot-why">{t.why}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="field-row">
          <Field htmlFor={id('from')} label="Od">
            <TextInput
              id={id('from')}
              type="time"
              step={300}
              mono
              value={term.from}
              onChange={(e) => onChange({ from: e.target.value })}
            />
          </Field>
          <Field htmlFor={id('to')} label="Do">
            <TextInput
              id={id('to')}
              type="time"
              step={300}
              mono
              value={term.to}
              onChange={(e) => onChange({ to: e.target.value })}
            />
          </Field>
        </div>
        {note == null ? null : note.clash == null ? (
          <p className="hint">
            {note.length} · {note.reg} wolna w tych godzinach
          </p>
        ) : (
          <p className="hint">
            {note.length} · <b>{note.clash.lead}</b> · {note.clash.who}
          </p>
        )}

        {/* Zdanie pada wyłącznie przy stanie, którego z kontrolek nie widać. */}
        {blocker != null && blocker !== 'incomplete' ? <p className="card-note danger">{blocker.reason}</p> : null}
      </Card>
    </>
  );
}
