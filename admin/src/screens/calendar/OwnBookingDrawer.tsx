/**
 * Ninerdeck - panel: WŁASNA REZERWACJA Z KALENDARZA (makieta K7/K7a/K7b, issue #233).
 *
 * Od issue #216 kalendarz w panelu ma każdy członek klubu, a rezerwować mógł wyłącznie
 * w aplikacji. Ta szuflada zadaje TE SAME pytania, co 22/22A w telefonie, w tej samej
 * kolejności - termin i maszyna, potem zadanie - i zapisuje TĄ SAMĄ komendą serwera:
 * ścieżka akceptacji, wiadomości i czyszczenie zgód przy poprawce działają identycznie.
 *
 * ══ SZUFLADA NIE MA ADRESU ══
 * Jak wyłączenie z użytku: opisuje byt, który dopiero powstanie. Zamknięcie z niepustym
 * szkicem pyta o rezygnację potwierdzeniem w miejscu (`.confirm`), nie oknem przeglądarki.
 *
 * ══ TRYB POPRAWKI ══
 * „Przesuń i popraw" z szuflady zajętości (K2b) otwiera tę samą szufladę z wypełnionym
 * szkicem. Poprawka niesie SAMĄ różnicę; INNA MASZYNA jest nową rezerwacją i odwołaniem
 * starej PO jej potwierdzeniu - w tej kolejności, bo odwrotna oddawałaby slot, zanim
 * wiadomo, czy jest co wziąć w zamian (decyzja z 3.0.0).
 */

import { useMemo, useState } from 'react';

import type { BookingDto, DirectoryMemberDto } from '../../api/dto';
import {
  useCancelOwnBooking,
  useCreateOwnBooking,
  useDayOccupancy,
  useMyApprovalPath,
  usePatchOwnBooking,
  useSuggestions,
} from '../../queries/useCalendar';
import {
  Banner,
  Button,
  Card,
  Drawer,
  Field,
  OptionButton,
  Pill,
  TextInput,
} from '../../ui/components';
import { dayLongLabel, onWeekday, type PersonLookup } from './bookingLabels';
import { bookingRefusal } from './bookingRefusal';
import type { CalendarAircraft } from './calendarGrid';
import { clubNoon, clubToday } from './clubClock';
import { buildDayTrack, slotNote } from './dayTrack';
import {
  aircraftChanged,
  confirmLabel,
  createBody,
  draftSlot,
  lengthLabel,
  OWN_OPERATIONS,
  ownDraftDirty,
  ownStep1Blocker,
  ownStep2Blocker,
  patchBody,
  planNote,
  singleField,
  suggestionMinutes,
  type OwnDraft,
} from './ownBookingForm';
import { ownRefusalMessage, takenBanner } from './ownBookingRefusal';
import { buildSlotTiles, nearestTile } from './slotTiles';

interface Props {
  aircraft: readonly CalendarAircraft[];
  members: readonly DirectoryMemberDto[];
  /** Zalogowany - właściciel rezerwacji; wiersz „Pilot" w kroku 2 mówi o nim. */
  viewer: { id: string; name: string; code: string | null };
  person: PersonLookup;
  /** Strefa klubu - godziny wpisuje się i czyta w czasie klubu (`clubClock.ts`). */
  timezone: string;
  /** Szkic startowy: pusty, z komórki osi albo z rezerwacji w poprawce. */
  seed: OwnDraft;
  /** Rezerwacja poprawiana; `null` = nowa. */
  editing: BookingDto | null;
  onClose: () => void;
}

export function OwnBookingDrawer({
  aircraft,
  members,
  viewer,
  person,
  timezone: tz,
  seed,
  editing,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(seed);
  const [step, setStep] = useState<1 | 2>(1);
  const [asking, setAsking] = useState(false);
  // Uuid nadaje KLIENT i to on jest idempotencją zapisu: drugie kliknięcie przy wolnym
  // łączu wraca tym samym wierszem, nie drugim terminem.
  const [id] = useState(() => crypto.randomUUID());

  const create = useCreateOwnBooking();
  const patch = usePatchOwnBooking();
  const cancelOld = useCancelOwnBooking();
  const path = useMyApprovalPath(true);

  const editingNow = editing != null;
  const chosen = aircraft.find((a) => a.id === draft.aircraftId) ?? null;
  const reg = chosen?.reg ?? '';
  const slot = draftSlot(draft, tz);
  const noon = draft.date === '' ? null : clubNoon(draft.date, tz);
  const minutes = suggestionMinutes(slot);

  const occupancy = useDayOccupancy(
    noon == null || draft.aircraftId === ''
      ? null
      : { from: new Date(noon).toISOString(), to: new Date(noon + 1).toISOString(), aircraftId: draft.aircraftId },
  );
  const suggestions = useSuggestions(
    noon == null || draft.aircraftId === ''
      ? null
      : { aircraftId: draft.aircraftId, day: new Date(noon).toISOString(), minutes },
  );

  // Poprawiana rezerwacja nie jest zajętością dla samej siebie - to jest szkic.
  const busy = useMemo(
    () => (occupancy.data?.bookings ?? []).filter((b) => b.id !== editing?.id),
    [occupancy.data, editing],
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
          }),
    [day, window, busy, slot, suggestions.data, tz, person],
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
  const blocker1 = ownStep1Blocker(draft, tz, Date.now());
  const blocker2 = ownStep2Blocker(draft, chosen?.dualRequired ?? false);
  const plan = planNote(draft, tz);
  const steps = path.data?.steps ?? [];

  const error = create.error ?? patch.error ?? cancelOld.error;
  const taken =
    error == null ? null : takenBanner(error, { reg, tz, now: Date.now(), viewerId: viewer.id, person });
  const fix = taken == null ? null : nearestTile(tiles, slot);
  const pending = create.isPending || patch.isPending || cancelOld.isPending;

  const dirty = ownDraftDirty(draft, seed, editingNow);
  const change = (next: Partial<OwnDraft>): void => setDraft((d) => ({ ...d, ...next }));
  const close = (): void => {
    if (dirty && !asking) setAsking(true);
    else onClose();
  };

  // Odmowa `slot_taken` WRACA NA KROK 1 - tam stoją kontrolki, którymi da się ją
  // naprawić. Szkic kroku 2 zostaje: pilot poprawia godzinę, nie formularz od nowa.
  const onRefused = (err: unknown): void => {
    if (bookingRefusal(err) === 'slot_taken') setStep(1);
  };

  const submit = (): void => {
    if (editing == null) {
      const body = createBody(draft, id, tz);
      if (body != null) create.mutate(body, { onSuccess: onClose, onError: onRefused });
      return;
    }
    if (aircraftChanged(draft, editing)) {
      const body = createBody(draft, id, tz);
      if (body == null) return;
      create.mutate(body, {
        onError: onRefused,
        onSuccess: () => cancelOld.mutate(editing.id, { onSuccess: onClose }),
      });
      return;
    }
    const diff = patchBody(draft, editing, tz);
    if (diff == null) return;
    if (Object.keys(diff).length === 0) {
      onClose();
      return;
    }
    patch.mutate({ id: editing.id, patch: diff }, { onSuccess: onClose, onError: onRefused });
  };

  const dayAt = noon == null ? null : new Date(noon);
  const title = editingNow ? 'Przesuń rezerwację' : 'Nowa rezerwacja';
  const head = [reg, dayAt == null ? '' : dayLongLabel(dayAt, tz)].filter((p) => p !== '');
  const sub =
    step === 1
      ? [...head, 'godziny w czasie klubu'].join(' · ')
      : [...head, `${draft.from} → ${draft.to}`, note?.length ?? ''].filter((p) => p !== '').join(' · ');

  const duals = members.filter((m) => m.active && m.id !== viewer.id);
  const dualRequired = chosen?.dualRequired ?? false;
  const one = singleField(draft.operation);

  return (
    <Drawer
      title={title}
      sub={sub}
      wide
      onClose={close}
      footer={
        step === 1 ? (
          <>
            <Button variant="ghost" onClick={close}>
              Anuluj
            </Button>
            <Button variant="primary" disabled={blocker1 != null} onClick={() => setStep(2)}>
              Dalej
            </Button>
          </>
        ) : (
          <>
            {/* Ścieżka akceptacji mówi o sobie PRZED kliknięciem; klub bez ścieżki
                notatki nie dostaje - stan domyślny nie dostaje zdania. */}
            {steps.length === 0 ? null : (
              <span className="drawer-note">Zaczeka na zgodę: {steps.join(' → ')}</span>
            )}
            <Button variant="ghost" onClick={() => setStep(1)}>
              Wstecz
            </Button>
            <Button
              variant="primary"
              disabled={blocker2 != null || pending || (editingNow && !dirty)}
              onClick={submit}
            >
              {confirmLabel(draft, editingNow)}
            </Button>
          </>
        )
      }
    >
      <ol className="steps" aria-label="Kroki rezerwacji">
        <li className={step === 1 ? 'step on' : 'step done'} aria-current={step === 1 ? 'step' : undefined}>
          1 · Termin i maszyna
        </li>
        <li className={step === 2 ? 'step on' : 'step'} aria-current={step === 2 ? 'step' : undefined}>
          2 · Zadanie
        </li>
      </ol>

      {asking ? (
        <div className="confirm">
          <span className="confirm-q">
            {editingNow
              ? 'Porzucić zmiany? Rezerwacja zostanie taka, jaka była.'
              : 'Porzucić rezerwację? Wpisane zadanie i godziny przepadną.'}
          </span>
          <span className="confirm-actions">
            <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
              Wróć do formularza
            </Button>
            <Button variant="danger" size="sm" onClick={onClose}>
              Porzuć
            </Button>
          </span>
        </div>
      ) : null}

      {step === 1 ? (
        <>
          {taken == null ? null : (
            <Banner
              tone="warn"
              live
              action={
                fix == null ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => change({ from: fix.from, to: fix.to })}
                  >
                    Weź {fix.hours}
                  </Button>
                )
              }
            >
              <b>{taken.lead}</b> {taken.body}
            </Banner>
          )}

          {/* Poprawka terminu w klubie ze ścieżką czyści zgody - mówimy to PRZED
              kliknięciem, nie po. Zadanie, trasa i notatka zgód nie ruszają. */}
          {editingNow && steps.length > 0 ? (
            <Banner tone="warn">
              <b>Zmiana terminu wyczyści dotychczasowe zgody.</b> Ścieżka akceptacji zacznie od
              nowa - zgoda dotyczyła konkretnego terminu.
            </Banner>
          ) : null}

          <Card title="Kiedy i czym">
            <div className="field-row">
              <Field htmlFor="own-aircraft" label="Samolot">
                <select
                  id="own-aircraft"
                  className="input"
                  value={draft.aircraftId}
                  onChange={(e) => change({ aircraftId: e.target.value })}
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
              <Field htmlFor="own-day" label="Dzień">
                <TextInput
                  id="own-day"
                  type="date"
                  mono
                  min={clubToday(Date.now(), tz)}
                  value={draft.date}
                  onChange={(e) => change({ date: e.target.value })}
                />
              </Field>
            </div>
            {editing != null && aircraftChanged(draft, editing) ? (
              <p className="hint">
                <b>Inna maszyna to nowa rezerwacja.</b> Zapis założy nowy termin na {reg} i odwoła ten na{' '}
                {aircraft.find((a) => a.id === editing.aircraftId)?.reg ?? 'poprzedniej maszynie'} - w tej kolejności.
              </p>
            ) : null}

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
                        onClick={() => change({ from: t.from, to: t.to })}
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
              <Field htmlFor="own-from" label="Od">
                <TextInput
                  id="own-from"
                  type="time"
                  step={300}
                  mono
                  value={draft.from}
                  onChange={(e) => change({ from: e.target.value })}
                />
              </Field>
              <Field htmlFor="own-to" label="Do">
                <TextInput
                  id="own-to"
                  type="time"
                  step={300}
                  mono
                  value={draft.to}
                  onChange={(e) => change({ to: e.target.value })}
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
            {blocker1 != null && blocker1 !== 'incomplete' ? (
              <p className="card-note danger">{blocker1.reason}</p>
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <Card title="Rodzaj operacji">
            <div className="opt-list">
              {OWN_OPERATIONS.map((o) => (
                <OptionButton
                  key={o.value}
                  name={o.name}
                  desc={o.desc}
                  selected={draft.operation === o.value}
                  onSelect={() => change({ operation: o.value })}
                />
              ))}
            </div>
          </Card>

          <Card title="Trasa">
            <div className="field-row">
              <Field htmlFor="own-from-icao" label={one ? 'Lotnisko' : 'Start'}>
                <TextInput
                  id="own-from-icao"
                  mono
                  maxLength={8}
                  placeholder="Kod ICAO"
                  value={draft.fromIcao}
                  onChange={(e) => change({ fromIcao: e.target.value.toUpperCase() })}
                />
              </Field>
              {/* Skoki mają jedno lotnisko - pole lądowania ZNIKA, nie wyszarza się. */}
              {one ? null : (
                <Field htmlFor="own-to-icao" label="Lądowanie">
                  <TextInput
                    id="own-to-icao"
                    mono
                    maxLength={8}
                    placeholder="Kod ICAO"
                    value={draft.toIcao}
                    onChange={(e) => change({ toIcao: e.target.value.toUpperCase() })}
                  />
                </Field>
              )}
            </div>
            <p className="hint">Kod spoza katalogu lotnisk zapisze się sam, bez nazwy lotniska.</p>
          </Card>

          <Card title="Załoga">
            <div className="kv">
              <span className="kv-k">Pilot</span>
              <span className="kv-v">
                {viewer.name} {viewer.code == null ? null : <span className="cell-sub mono">{viewer.code}</span>}
              </span>
            </div>
            <Field
              htmlFor="own-dual"
              label="Drugi pilot"
              action={
                dualRequired ? <Pill tone="amber">wymagany · załoga 2-os.</Pill> : <Pill tone="dim">opcjonalne</Pill>
              }
            >
              <select
                id="own-dual"
                className="input"
                value={draft.dualId}
                onChange={(e) => change({ dualId: e.target.value })}
              >
                <option value="">{dualRequired ? 'Wybierz drugiego pilota' : 'Bez drugiego pilota'}</option>
                {duals.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.code}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card title="Plan lotu">
            <div className="field-row">
              <Field htmlFor="own-air" label="Czas lotu (h:mm)">
                <TextInput
                  id="own-air"
                  mono
                  inputMode="numeric"
                  placeholder="1:30"
                  value={draft.plannedAir}
                  onChange={(e) => change({ plannedAir: e.target.value })}
                />
              </Field>
              <Field htmlFor="own-fuel" label="Paliwo do zabrania (L)" action={<Pill tone="dim">opcjonalne</Pill>}>
                <TextInput
                  id="own-fuel"
                  mono
                  inputMode="decimal"
                  value={draft.plannedFuel}
                  onChange={(e) => change({ plannedFuel: e.target.value })}
                />
              </Field>
            </div>
            {plan == null ? null : plan.warn ? (
              <p className="hint">
                <b>{plan.text}</b>
              </p>
            ) : (
              <p className="hint">{plan.text}</p>
            )}
          </Card>

          <Card
            title={
              <>
                Notatka <span className="spacer" />
                <Pill tone="dim">opcjonalne</Pill>
              </>
            }
          >
            <textarea
              id="own-note"
              className="input area"
              rows={2}
              aria-label="Notatka"
              placeholder="Dla kogo, po co, na co uważać…"
              value={draft.note}
              onChange={(e) => change({ note: e.target.value })}
            />
          </Card>

          {blocker2 != null && blocker2 !== 'incomplete' ? (
            <p className="card-note danger">{blocker2.reason}</p>
          ) : null}
          {error == null || taken != null ? null : (
            <p className="card-note danger">{ownRefusalMessage(error, tz, person)}</p>
          )}
        </>
      )}
    </Drawer>
  );
}
