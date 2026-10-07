/**
 * Ninerdeck - panel: NOWE ZLECENIE, EDYCJA I POWIELENIE (makieta `zlecenia-nowe`, ZL2,
 * ZL2a-c; 4.0.0, epik Z-D #248; `docs/zlecenia.md` §4, §5.1, §5.2, §14.4).
 *
 * Te same pytania, co 31 → 31A → 31B w telefonie, w trzech krokach: termin i maszyna,
 * zadanie, potem fotele i adresaci. Kroki 1 i 2 to kroki własnej rezerwacji K7 - wspólne
 * komponenty (`TermCard`, `OperationCard`, `PlanCard`), bo zlecenie JEST rezerwacją, która
 * szuka załogi, i o termin konkuruje tak samo. Treść kroku 3 liczy `orderForm.ts`, a co
 * znaczy „zapisz" w edycji - `orderEdit.ts`.
 *
 * ══ SZUFLADA NIE MA ADRESU ══
 * Jak własna rezerwacja (decyzja 2026-10-07): opisuje byt, który dopiero powstanie albo
 * zaraz się zmieni, a wejścia - lista zleceń, kalendarz z maszyną i dniem komórki, „Edytuj"
 * i „Powiel" na karcie - niosą stan, nie adres. Zamknięcie z niepustym szkicem pyta
 * o rezygnację potwierdzeniem w miejscu.
 *
 * ══ EDYCJA = TEN SAM FORMULARZ ══
 * Szkic odtworzony z karty; zapis niesie samą różnicę. Wysłani stoją na listach zablokowani
 * („ma już zlecenie"), dopisani dostaną zlecenie, a zmiana terminu mówi PRZED zapisem, że
 * adresaci odpowiedzą od nowa (ZL2c). „Wspólna lista" jest zablokowana - innego sposobu
 * adresowania poprawka nie zna, to nowe zlecenie przez „Powiel".
 *
 * ══ ODMOWA „TERMIN ZAJĘTY" WRACA NA KROK 1 ══
 * Tam stoją kontrolki, którymi da się ją naprawić (ZL2c); szkic kroków 2 i 3 zostaje.
 * Po zapisie szuflada przechodzi do karty zlecenia.
 */

import { useState } from 'react';

import type { DirectoryMemberDto, GroupDto, OrderCardDto, SeatDto } from '../../api/dto';
import { useCreateOrder, useEditOrder } from '../../queries/useOrders';
import { useGroups } from '../../queries/useGroups';
import { Banner, Button, Card, Drawer, Field, OptionButton, Pill, TextInput } from '../../ui/components';
import { SearchIcon } from '../../ui/components/icons';
import { bookingRefusal } from '../calendar/bookingRefusal';
import { dayLongLabel, operationLabel, type PersonLookup } from '../calendar/bookingLabels';
import type { CalendarAircraft } from '../calendar/calendarGrid';
import { clubNoon } from '../calendar/clubClock';
import { draftSlot, ownStep1Blocker, planNote, singleField, slotLength } from '../calendar/ownBookingForm';
import { OperationCard, PlanCard } from '../calendar/TaskCards';
import { TermCard } from '../calendar/TermCard';
import { editNote, editStep3Blocker, orderPatchOf, seatLossNote, sentOf, termChanged, termShift } from './orderEdit';
import {
  addressOptions,
  audienceContext,
  audienceNote,
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
  type SentAddressees,
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
  /** Szkic startowy: pusty (z maszyną i dniem z komórki kalendarza), powielony albo z karty. */
  initial: OrderFormDraft;
  /** Zlecenie poprawiane; `null` = nowe (także powielone). */
  editing: OrderCardDto | null;
  onClose: () => void;
  /** Zlecenie zapisane - szuflada przechodzi do jego karty. */
  onSent: (orderId: string) => void;
}

type Step = 1 | 2 | 3;

const STEPS: readonly { step: Step; label: string }[] = [
  { step: 1, label: '1 · Termin i maszyna' },
  { step: 2, label: '2 · Zadanie' },
  { step: 3, label: '3 · Załoga i adresaci' },
];

const TERM_CHANGE_LEAD = 'Zmiana terminu zacznie odpowiedzi od nowa.';
const TERM_CHANGE_TEXT = 'Adresaci dostaną prośbę o ponowną odpowiedź, a osoby już w fotelach zostają i mogą zrezygnować.';

export function OrderFormDrawer({ aircraft, members, viewerId, person, timezone: tz, initial, editing, onClose, onSent }: Props) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState<Step>(1);
  const [asking, setAsking] = useState(false);
  // Uuid nadaje KLIENT i to on jest idempotencją zapisu: drugie kliknięcie przy wolnym
  // łączu wraca tym samym zleceniem, nie drugim terminem.
  const [id] = useState(() => crypto.randomUUID());

  const create = useCreateOrder();
  const edit = useEditOrder(editing?.order.id ?? '');
  const groups = useGroups();

  const chosen = aircraft.find((a) => a.id === draft.aircraftId) ?? null;
  const machine: FormAircraft | null = chosen == null ? null : { reg: chosen.reg, dualRequired: chosen.dualRequired };
  const ctx = audienceContext(viewerId, members, groups.data?.groups ?? null);
  const slot = draftSlot(draft, tz);
  const noon = draft.date === '' ? null : clubNoon(draft.date, tz);

  const patch = editing == null ? null : orderPatchOf(draft, initial, tz, machine);
  const blocker1 = ownStep1Blocker(draft, tz, Date.now());
  const blocker2 = orderStep2Blocker(draft);
  const blocker3 = editing == null ? orderStep3Blocker(draft, machine) : editStep3Blocker(draft, editing, machine);
  const plan = planNote(draft, tz, ORDER_PLAN_WORDS);
  const note = editing == null ? audienceNote(draft, machine, ctx) : editNote(patch, editing, ctx);
  const shift = editing == null ? null : termShift(draft, initial, tz);
  const error = create.error ?? edit.error;
  const taken = bookingRefusal(error) === 'slot_taken';
  const pending = create.isPending || edit.isPending;

  const change = (next: Partial<OrderFormDraft>): void => setDraft((d) => ({ ...d, ...next }));
  const close = (): void => {
    if (orderFormDirty(draft, initial) && !asking) setAsking(true);
    else onClose();
  };

  // Odmowa terminu WRACA NA KROK 1 - tam stoją kontrolki, którymi da się ją naprawić.
  const onRefused = (err: unknown): void => {
    if (bookingRefusal(err) === 'slot_taken') setStep(1);
  };

  const submit = (): void => {
    if (editing != null) {
      if (patch != null) edit.mutate(patch, { onSuccess: () => onSent(editing.order.id), onError: onRefused });
      return;
    }
    const body = orderCreateBody(draft, id, tz, machine);
    if (body != null) create.mutate(body, { onSuccess: () => onSent(id), onError: onRefused });
  };

  const head = [chosen?.reg ?? '', noon == null ? '' : dayLongLabel(new Date(noon), tz)].filter((p) => p !== '');
  const hours = draft.from === '' || draft.to === '' ? '' : `${draft.from} → ${draft.to}`;
  const task = [
    draft.operation === '' ? null : operationLabel(draft.operation).toLowerCase(),
    routeLabel(draft.fromIcao || null, singleField(draft.operation) ? null : draft.toIcao || null),
  ]
    .filter((p): p is string => p != null)
    .join(' ');
  const sub =
    step === 1
      ? [...head, 'godziny w czasie klubu'].join(' · ')
      : step === 2
        ? [...head, hours, slotLength(slot) ?? ''].filter((p) => p !== '').join(' · ')
        : [...head, hours === '' ? '' : `${hours} czasu klubu`, task].filter((p) => p !== '').join(' · ');

  const termBanner =
    editing != null && termChanged(draft, initial) ? (
      <Banner tone="warn">
        <b>{TERM_CHANGE_LEAD}</b> {TERM_CHANGE_TEXT}
      </Banner>
    ) : null;

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
          // Poprawka bez zmian nie ma czego zapisać - widać to z formularza, zdania nie ma.
          disabled={blocker3 != null || pending || (editing != null && patch == null)}
          reason={blocker3 != null && blocker3 !== 'incomplete' ? blocker3.reason : undefined}
          onClick={submit}
        >
          {editing == null ? 'Wyślij zlecenie' : 'Zapisz zmiany'}
        </Button>
      </>
    );

  const one = singleField(draft.operation);
  const groupList = groups.data?.groups ?? [];

  return (
    <Drawer title={editing == null ? 'Nowe zlecenie' : 'Edytuj zlecenie'} sub={sub} wide onClose={close} footer={footer}>
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
          <span className="confirm-q">
            {editing == null
              ? 'Porzucić zlecenie? Wpisane zadanie, fotele i adresaci przepadną.'
              : 'Porzucić zmiany? Zlecenie zostanie takie, jakie było.'}
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
          idPrefix="order"
          term={draft}
          onChange={change}
          aircraft={aircraft}
          tz={tz}
          person={person}
          viewerId={viewerId}
          // Poprawiany termin nie jest zajętością dla samego siebie.
          exceptId={editing?.booking.id ?? null}
          draft="order"
          error={error}
          blocker={blocker1}
          notice={termBanner}
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
          {/* Skutek zmiany terminu PRZED zapisem (ZL2c): baner i poprzednie godziny. */}
          {termBanner}
          {shift == null ? null : (
            <div className="kv">
              <span className="kv-k">Termin</span>
              <span className="kv-v">
                <span className="was">{shift.was}</span> → {shift.now}
              </span>
            </div>
          )}

          <OptionButton
            multiple
            name="Wspólna lista · fotele przydzielę po odpowiedziach"
            desc="Adresaci potwierdzają termin, a Ty decydujesz, kto siedzi na którym fotelu."
            selected={draft.shared}
            // Poprawka sposobu adresowania nie zmienia - to nowe zlecenie przez „Powiel".
            disabled={editing != null}
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
              groups={groupList}
              ctx={ctx}
              viewerId={viewerId}
              editing={editing}
            />
          ))}

          {draft.shared ? (
            <Card title="Adresaci">
              <AddressLists
                target="shared"
                draft={draft}
                setDraft={setDraft}
                machine={machine}
                members={members}
                groups={groupList}
                ctx={ctx}
                label="wspólna lista"
                sent={editing == null ? undefined : sentOf(editing, 'shared')}
              />
              <p className="hint">{sharedHint(seatsOf(draft, machine))}</p>
            </Card>
          ) : null}
        </>
      )}

      {error == null || taken ? null : <p className="card-note danger">{orderErrorMessage(error, tz, person)}</p>}
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
  editing: OrderCardDto | null;
}

/**
 * Karta fotela: stan („Ja / Szukam / Brak"), a pod szukanym - do kogo idzie (ZL2).
 * W edycji sposobu („Osoba / Grupa") nie ma: wysłani stoją na liście zablokowani, a lista
 * służy wyłącznie do dopisania.
 */
function SeatCard({ seat, draft, setDraft, machine, members, groups, ctx, viewerId, editing }: SeatCardProps) {
  const seats = seatsOf(draft, machine);
  const address = draft[seat];
  const asks = seats[seat] === 'sought' && !draft.shared;
  const hint = asks && editing == null ? seatHint(draft, seat, machine, ctx, (id) => groups.find((g) => g.id === id)?.name ?? '') : null;
  const loss = editing == null ? null : seatLossNote(editing, draft, seat, machine);
  const selectId = `order-${seat}-person`;
  const lists = (
    <AddressLists
      target={seat}
      draft={draft}
      setDraft={setDraft}
      machine={machine}
      members={members}
      groups={groups}
      ctx={ctx}
      label={SEAT_LABEL[seat].toLowerCase()}
      sent={editing == null ? undefined : sentOf(editing, seat)}
    />
  );

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
      {loss == null ? null : (
        <p className="hint">
          <b>{loss}</b>
        </p>
      )}

      {!asks ? null : editing != null ? (
        lists
      ) : (
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
              {lists}
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
  /** Edycja - wysłani stoją zaznaczeni i zablokowani. */
  sent?: SentAddressees;
}

/**
 * Wyszukiwarka i dwie listy kart wielokrotnego wyboru - grupy nad osobami. Wybór zostaje
 * listą kart, bo jest WIELOKROTNY: `<select>` nie pokazałby, kogo zaznaczono.
 */
function AddressLists({ target, draft, setDraft, machine, members, groups, ctx, label, sent }: AddressListsProps) {
  const [query, setQuery] = useState('');
  const options = addressOptions({ draft, target, aircraft: machine, members, groups, ctx, query, sent });
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
