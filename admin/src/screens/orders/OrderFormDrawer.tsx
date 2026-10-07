/**
 * Ninerdeck - panel: NOWE ZLECENIE (makieta `zlecenia-nowe`, ZL2, ZL2a-c; 4.0.0,
 * epik Z-D #248; `docs/zlecenia.md` §4, §14.4).
 *
 * Te same pytania, co 31 → 31A → 31B w telefonie, w trzech krokach: termin i maszyna,
 * zadanie, potem fotele i adresaci. Kroki 1 i 2 to kroki własnej rezerwacji K7 - wspólne
 * komponenty (`TermCard`, `OperationCard`, `PlanCard`), bo zlecenie JEST rezerwacją, która
 * szuka załogi, i o termin konkuruje tak samo. Treść kroku 3 liczy `orderForm.ts`.
 *
 * ══ SZUFLADA NIE MA ADRESU ══
 * Jak własna rezerwacja (decyzja 2026-10-07): opisuje byt, który dopiero powstanie, a dwa
 * wejścia - lista zleceń i kalendarz z maszyną i dniem komórki - niosą stan, nie adres.
 * Zamknięcie z niepustym szkicem pyta o rezygnację potwierdzeniem w miejscu.
 *
 * ══ ODMOWA „TERMIN ZAJĘTY" WRACA NA KROK 1 ══
 * Tam stoją kontrolki, którymi da się ją naprawić (ZL2c); szkic kroków 2 i 3 zostaje.
 * Po wysłaniu szuflada przechodzi do karty nowego zlecenia - tam prowadzący wybiera
 * spośród zgłoszonych.
 */

import { useState } from 'react';

import type { DirectoryMemberDto, GroupDto, SeatDto } from '../../api/dto';
import { useCreateOrder } from '../../queries/useOrders';
import { useGroups } from '../../queries/useGroups';
import { Button, Card, Drawer, Field, OptionButton, Pill, TextInput } from '../../ui/components';
import { SearchIcon } from '../../ui/components/icons';
import { bookingRefusal } from '../calendar/bookingRefusal';
import { dayLongLabel, operationLabel, type PersonLookup } from '../calendar/bookingLabels';
import type { CalendarAircraft } from '../calendar/calendarGrid';
import { clubNoon } from '../calendar/clubClock';
import { draftSlot, ownStep1Blocker, planNote, singleField, slotLength } from '../calendar/ownBookingForm';
import { OperationCard, PlanCard } from '../calendar/TaskCards';
import { TermCard } from '../calendar/TermCard';
import {
  addressOptions,
  audienceContext,
  audienceNote,
  emptyOrderForm,
  GROUP_HINT,
  ORDER_PLAN_WORDS,
  orderCreateBody,
  orderFormDirty,
  orderStep2Blocker,
  orderStep3Blocker,
  personChoices,
  seatHint,
  seatsOf,
  seatStates,
  sharedHint,
  toggleEntry,
  withMode,
  withPerson,
  withSeatState,
  withShared,
  type AddressOptionVm,
  type AudienceContext,
  type FormAircraft,
  type OrderFormDraft,
  type OrderSeed,
} from './orderForm';
import { SEAT_GENITIVE, SEAT_LABEL, routeLabel } from './orderLabels';
import { orderErrorMessage } from './orderRefusal';

interface Props {
  aircraft: readonly CalendarAircraft[];
  members: readonly DirectoryMemberDto[];
  /** Zalogowany - zlecający; nie jest adresatem nawet przez grupę (§6.2). */
  viewerId: string;
  person: PersonLookup;
  /** Strefa klubu - godziny wpisuje się i czyta w czasie klubu. */
  timezone: string;
  /** Maszyna i dzień z komórki kalendarza; z listy zleceń - pusto. */
  seed: OrderSeed;
  onClose: () => void;
  /** Zlecenie wysłane - szuflada przechodzi do jego karty. */
  onSent: (orderId: string) => void;
}

type Step = 1 | 2 | 3;

const STEPS: readonly { step: Step; label: string }[] = [
  { step: 1, label: '1 · Termin i maszyna' },
  { step: 2, label: '2 · Zadanie' },
  { step: 3, label: '3 · Załoga i adresaci' },
];

export function OrderFormDrawer({ aircraft, members, viewerId, person, timezone: tz, seed, onClose, onSent }: Props) {
  const [draft, setDraft] = useState(() => emptyOrderForm(seed));
  const [step, setStep] = useState<Step>(1);
  const [asking, setAsking] = useState(false);
  // Uuid nadaje KLIENT i to on jest idempotencją zapisu: drugie kliknięcie przy wolnym
  // łączu wraca tym samym zleceniem, nie drugim terminem.
  const [id] = useState(() => crypto.randomUUID());

  const create = useCreateOrder();
  const groups = useGroups();

  const chosen = aircraft.find((a) => a.id === draft.aircraftId) ?? null;
  const machine: FormAircraft | null = chosen == null ? null : { reg: chosen.reg, dualRequired: chosen.dualRequired };
  const ctx = audienceContext(viewerId, members, groups.data?.groups ?? null);
  const slot = draftSlot(draft, tz);
  const noon = draft.date === '' ? null : clubNoon(draft.date, tz);

  const blocker1 = ownStep1Blocker(draft, tz, Date.now());
  const blocker2 = orderStep2Blocker(draft);
  const blocker3 = orderStep3Blocker(draft, machine);
  const plan = planNote(draft, tz, ORDER_PLAN_WORDS);
  const note = audienceNote(draft, machine, ctx);
  const taken = bookingRefusal(create.error) === 'slot_taken';

  const change = (next: Partial<OrderFormDraft>): void => setDraft((d) => ({ ...d, ...next }));
  const close = (): void => {
    if (orderFormDirty(draft) && !asking) setAsking(true);
    else onClose();
  };

  const submit = (): void => {
    const body = orderCreateBody(draft, id, tz, machine);
    if (body == null) return;
    create.mutate(body, {
      onSuccess: () => onSent(id),
      // Odmowa terminu WRACA NA KROK 1 - tam stoją kontrolki, którymi da się ją naprawić.
      onError: (err) => {
        if (bookingRefusal(err) === 'slot_taken') setStep(1);
      },
    });
  };

  const head = [chosen?.reg ?? '', noon == null ? '' : dayLongLabel(new Date(noon), tz)].filter((p) => p !== '');
  const hours = draft.from === '' || draft.to === '' ? '' : `${draft.from} → ${draft.to}`;
  const task = [draft.operation === '' ? null : operationLabel(draft.operation).toLowerCase(), routeLabel(draft.fromIcao || null, singleField(draft.operation) ? null : draft.toIcao || null)]
    .filter((p): p is string => p != null)
    .join(' ');
  const sub =
    step === 1
      ? [...head, 'godziny w czasie klubu'].join(' · ')
      : step === 2
        ? [...head, hours, slotLength(slot) ?? ''].filter((p) => p !== '').join(' · ')
        : [...head, hours === '' ? '' : `${hours} czasu klubu`, task].filter((p) => p !== '').join(' · ');

  const footer =
    step === 1 ? (
      <>
        <Button variant="ghost" onClick={close}>
          Anuluj
        </Button>
        <Button variant="primary" disabled={blocker1 != null} onClick={() => setStep(2)}>
          Dalej
        </Button>
      </>
    ) : step === 2 ? (
      <>
        <Button variant="ghost" onClick={() => setStep(1)}>
          Wstecz
        </Button>
        <Button variant="primary" disabled={blocker2 != null} onClick={() => setStep(3)}>
          Dalej
        </Button>
      </>
    ) : (
      <>
        {note == null ? null : <span className="drawer-note">{note}</span>}
        <Button variant="ghost" onClick={() => setStep(2)}>
          Wstecz
        </Button>
        <Button
          variant="primary"
          disabled={blocker3 != null || create.isPending}
          reason={blocker3 != null && blocker3 !== 'incomplete' ? blocker3.reason : undefined}
          onClick={submit}
        >
          Wyślij zlecenie
        </Button>
      </>
    );

  const one = singleField(draft.operation);

  return (
    <Drawer title="Nowe zlecenie" sub={sub} wide onClose={close} footer={footer}>
      <ol className="steps" aria-label="Kroki zlecenia">
        {STEPS.map((s) => (
          <li
            key={s.step}
            className={s.step === step ? 'step on' : s.step < step ? 'step done' : 'step'}
            aria-current={s.step === step ? 'step' : undefined}
          >
            {s.label}
          </li>
        ))}
      </ol>

      {asking ? (
        <div className="confirm">
          <span className="confirm-q">Porzucić zlecenie? Wpisane zadanie, fotele i adresaci przepadną.</span>
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
          idPrefix="order"
          term={draft}
          onChange={change}
          aircraft={aircraft}
          tz={tz}
          person={person}
          viewerId={viewerId}
          exceptId={null}
          draft="order"
          error={create.error}
          blocker={blocker1}
        />
      ) : step === 2 ? (
        <>
          <OperationCard value={draft.operation} onSelect={(operation) => change({ operation })} />

          {/* Skoki mają JEDNO lotnisko (issue #13) - pola „Lądowanie" nie ma, a nie jest wyszarzone. */}
          <Card title={one ? 'Lotnisko' : 'Trasa'}>
            <div className="field-row">
              <Field htmlFor="order-from-icao" label={one ? 'Start i lądowanie' : 'Start'}>
                <TextInput
                  id="order-from-icao"
                  mono
                  maxLength={8}
                  placeholder="Kod ICAO"
                  value={draft.fromIcao}
                  onChange={(e) => change({ fromIcao: e.target.value.toUpperCase() })}
                />
              </Field>
              {one ? null : (
                <Field htmlFor="order-to-icao" label="Lądowanie">
                  <TextInput
                    id="order-to-icao"
                    mono
                    maxLength={8}
                    placeholder="Kod ICAO"
                    value={draft.toIcao}
                    onChange={(e) => change({ toIcao: e.target.value.toUpperCase() })}
                  />
                </Field>
              )}
            </div>
          </Card>

          <PlanCard idPrefix="order" air={draft.plannedAir} fuel={draft.plannedFuel} onChange={change} note={plan} />

          <Card
            title={
              <>
                Opis <span className="spacer" />
                <Pill tone="dim">opcjonalne</Pill>
              </>
            }
          >
            <textarea
              id="order-note"
              className="input area"
              rows={2}
              maxLength={500}
              aria-label="Opis"
              placeholder="Np. dla kogo, ile wylotów, na co uważać…"
              value={draft.note}
              onChange={(e) => change({ note: e.target.value })}
            />
          </Card>

          {blocker2 != null && blocker2 !== 'incomplete' ? <p className="card-note danger">{blocker2.reason}</p> : null}
        </>
      ) : (
        <>
          <OptionButton
            multiple
            name="Wspólna lista · fotele przydzielę po odpowiedziach"
            desc="Adresaci potwierdzają termin, a Ty decydujesz, kto siedzi na którym fotelu."
            selected={draft.shared}
            onSelect={() => setDraft((d) => withShared(d, !d.shared, machine))}
          />

          {(['pic', 'dual'] as const).map((seat) => (
            <SeatCard
              key={seat}
              seat={seat}
              draft={draft}
              setDraft={setDraft}
              machine={machine}
              members={members}
              groups={groups.data?.groups ?? []}
              ctx={ctx}
              viewerId={viewerId}
            />
          ))}

          {draft.shared ? (
            <Card title="Adresaci">
              <AddressLists target="shared" draft={draft} setDraft={setDraft} machine={machine} members={members} groups={groups.data?.groups ?? []} ctx={ctx} label="wspólna lista" />
              <p className="hint">{sharedHint(seatsOf(draft, machine))}</p>
            </Card>
          ) : null}
        </>
      )}

      {create.error == null || taken ? null : <p className="card-note danger">{orderErrorMessage(create.error, tz, person)}</p>}
    </Drawer>
  );
}

interface SeatCardProps {
  seat: SeatDto;
  draft: OrderFormDraft;
  setDraft: (update: (d: OrderFormDraft) => OrderFormDraft) => void;
  machine: FormAircraft | null;
  members: readonly DirectoryMemberDto[];
  groups: readonly GroupDto[];
  ctx: AudienceContext;
  viewerId: string;
}

/** Karta fotela: stan („Ja / Szukam / Brak"), a pod szukanym - do kogo idzie (ZL2). */
function SeatCard({ seat, draft, setDraft, machine, members, groups, ctx, viewerId }: SeatCardProps) {
  const seats = seatsOf(draft, machine);
  const address = draft[seat];
  const asks = seats[seat] === 'sought' && !draft.shared;
  const hint = asks ? seatHint(draft, seat, machine, ctx, (id) => groups.find((g) => g.id === id)?.name ?? '') : null;
  const selectId = `order-${seat}-person`;

  return (
    <Card
      title={
        seat === 'dual' && machine?.dualRequired === true ? (
          <>
            {SEAT_LABEL[seat]} <span className="spacer" />
            <Pill tone="amber">wymagany · załoga 2-os.</Pill>
          </>
        ) : (
          SEAT_LABEL[seat]
        )
      }
    >
      <div className="seat-states" role="radiogroup" aria-label={`Fotel ${SEAT_GENITIVE[seat]}`}>
        {seatStates(draft, seat, machine).map((s) => (
          <OptionButton
            key={s.state}
            name={s.name}
            desc={s.desc}
            selected={s.selected}
            disabled={s.disabled}
            onSelect={() => setDraft((d) => withSeatState(d, seat, s.state, machine))}
          />
        ))}
      </div>

      {!asks ? null : (
        <>
          <div className="field">
            <span className="label">Do kogo</span>
            <div className="field-pair" role="radiogroup" aria-label={`Do kogo idzie fotel ${SEAT_GENITIVE[seat]}`}>
              <OptionButton
                name="Osoba"
                desc={'Imiennie - jej „Przyjmuję" od razu obsadza fotel'}
                selected={address.mode === 'person'}
                onSelect={() => setDraft((d) => withMode(d, seat, 'person'))}
              />
              <OptionButton
                name="Grupa"
                desc="Lub kilka osób - zbierasz zgłoszenia i wybierasz osobę"
                selected={address.mode === 'group'}
                onSelect={() => setDraft((d) => withMode(d, seat, 'group'))}
              />
            </div>
          </div>

          {address.mode === 'person' ? (
            <>
              <Field htmlFor={selectId} label="Osoba">
                <select
                  id={selectId}
                  className="input"
                  value={address.person ?? ''}
                  onChange={(e) => setDraft((d) => withPerson(d, seat, e.target.value))}
                >
                  <option value="">Wybierz osobę</option>
                  {personChoices(members, viewerId).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              {hint == null ? null : (
                <p className="hint info">
                  {hint.map((part, i) => (part.strong ? <b key={i}>{part.text}</b> : <span key={i}>{part.text}</span>))}
                </p>
              )}
            </>
          ) : (
            <>
              <AddressLists target={seat} draft={draft} setDraft={setDraft} machine={machine} members={members} groups={groups} ctx={ctx} label={SEAT_LABEL[seat].toLowerCase()} />
              <p className="hint">{GROUP_HINT}</p>
            </>
          )}
        </>
      )}
    </Card>
  );
}

interface AddressListsProps {
  target: SeatDto | 'shared';
  draft: OrderFormDraft;
  setDraft: (update: (d: OrderFormDraft) => OrderFormDraft) => void;
  machine: FormAircraft | null;
  members: readonly DirectoryMemberDto[];
  groups: readonly GroupDto[];
  ctx: AudienceContext;
  /** „drugi pilot", „wspólna lista" - nazwa list dla czytnika ekranu. */
  label: string;
}

/**
 * Wyszukiwarka i dwie listy kart wielokrotnego wyboru - grupy nad osobami. Wybór zostaje
 * listą kart, bo jest WIELOKROTNY: `<select>` nie pokazałby, kogo zaznaczono.
 */
function AddressLists({ target, draft, setDraft, machine, members, groups, ctx, label }: AddressListsProps) {
  const [query, setQuery] = useState('');
  const options = addressOptions({ draft, target, aircraft: machine, members, groups, ctx, query });
  const toggle = (o: AddressOptionVm): void =>
    setDraft((d) => toggleEntry(d, target, { kind: o.kind === 'group' ? 'group' : 'person', id: o.id }, machine));

  return (
    <>
      <label className="search">
        <SearchIcon size={13} />
        <input
          value={query}
          placeholder="Szukaj osoby albo grupy"
          aria-label={`Szukaj adresata - ${label}`}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {options.groups.length === 0 ? null : (
        <div className="field">
          <span className="label">Grupy</span>
          <div className="opt-list" role="group" aria-label={`Grupy - ${label}`}>
            {options.groups.map((o) => (
              <OptionButton key={o.id} multiple name={o.name} desc={o.desc} selected={o.selected} onSelect={() => toggle(o)} />
            ))}
          </div>
        </div>
      )}
      {options.people.length === 0 ? null : (
        <div className="field">
          <span className="label">Osoby</span>
          <div className="opt-list" role="group" aria-label={`Osoby - ${label}`}>
            {options.people.map((o) => (
              <OptionButton
                key={o.id}
                multiple
                name={o.name}
                desc={o.desc}
                selected={o.selected}
                disabled={o.disabled}
                onSelect={() => toggle(o)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
