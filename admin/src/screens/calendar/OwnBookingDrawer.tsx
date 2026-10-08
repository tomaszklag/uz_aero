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

import { useState } from 'react';

import type { BookingDto, DirectoryMemberDto } from '../../api/dto';
import {
  useCancelOwnBooking,
  useCreateOwnBooking,
  useMyApprovalPath,
  usePatchOwnBooking,
} from '../../queries/useCalendar';
import { Banner, Button, Card, Drawer, Field, Pill, TextInput } from '../../ui/components';
import { dayLongLabel, type PersonLookup } from './bookingLabels';
import { bookingRefusal } from './bookingRefusal';
import type { CalendarAircraft } from './calendarGrid';
import { clubNoon } from './clubClock';
import {
  aircraftChanged,
  confirmLabel,
  createBody,
  draftSlot,
  ownDraftDirty,
  ownStep1Blocker,
  ownStep2Blocker,
  patchBody,
  planNote,
  singleField,
  slotLength,
  type OwnDraft,
} from './ownBookingForm';
import { ownRefusalMessage } from './ownBookingRefusal';
import { OperationCard, PlanCard } from './TaskCards';
import { TermCard } from './TermCard';

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

  const blocker1 = ownStep1Blocker(draft, tz, Date.now());
  const blocker2 = ownStep2Blocker(draft, chosen?.dualRequired ?? false);
  const plan = planNote(draft, tz);
  const steps = path.data?.steps ?? [];

  const error = create.error ?? patch.error ?? cancelOld.error;
  const taken = bookingRefusal(error) === 'slot_taken';
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
      : [...head, `${draft.from} → ${draft.to}`, slotLength(slot) ?? ''].filter((p) => p !== '').join(' · ');

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
        <TermCard
          idPrefix="own"
          term={draft}
          onChange={change}
          aircraft={aircraft}
          tz={tz}
          person={person}
          viewerId={viewer.id}
          exceptId={editing?.id ?? null}
          draft="own"
          error={error}
          blocker={blocker1}
          notice={
            // Poprawka terminu w klubie ze ścieżką czyści zgody - mówimy to PRZED
            // kliknięciem, nie po. Zadanie, trasa i notatka zgód nie ruszają.
            editingNow && steps.length > 0 ? (
              <Banner tone="warn">
                <b>Zmiana terminu wyczyści dotychczasowe zgody.</b> Ścieżka akceptacji zacznie od
                nowa - zgoda dotyczyła konkretnego terminu.
              </Banner>
            ) : null
          }
          aircraftHint={
            editing != null && aircraftChanged(draft, editing) ? (
              <p className="hint">
                <b>Inna maszyna to nowa rezerwacja.</b> Zapis założy nowy termin na {reg} i odwoła ten na{' '}
                {aircraft.find((a) => a.id === editing.aircraftId)?.reg ?? 'poprzedniej maszynie'} - w tej kolejności.
              </p>
            ) : null
          }
        />
      ) : (
        <>
          <OperationCard value={draft.operation} onSelect={(operation) => change({ operation })} />

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

          <PlanCard
            idPrefix="own"
            air={draft.plannedAir}
            fuel={draft.plannedFuel}
            onChange={change}
            note={plan}
          />

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
          {error == null || taken ? null : (
            <p className="card-note danger">{ownRefusalMessage(error, tz, person)}</p>
          )}
        </>
      )}
    </Drawer>
  );
}
