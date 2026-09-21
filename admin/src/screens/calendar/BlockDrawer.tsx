/**
 * Ninerdeck - panel: WYŁĄCZENIE MASZYNY Z UŻYTKU i REZERWACJA ZA PILOTA
 * (issue #160, D4 i D5).
 *
 * Jedna szuflada na dwa formularze, bo różnią się dokładnie dwoma polami: wyłączenie ma
 * powód z katalogu, rezerwacja - pilota i zadanie. Reszta (maszyna, zakres, komentarz)
 * jest wspólna, a dwie kopie tego samego układu rozjechałyby się przy pierwszej poprawce.
 *
 * ══ KOLIZJE MÓWIĄ O SOBIE, ZANIM ADMINISTRATOR TAPNIE ══
 * Rezerwacje stojące w wybranym oknie liczą się Z DANYCH, KTÓRE EKRAN JUŻ MA - kalendarz
 * pobrał je do siatki. Administrator ma zobaczyć, w co wchodzi, PRZED zapisem, a nie
 * dostać odmowę `slot_taken` po tapnięciu. Wyłączenie z użytku i tak się o nie odbije
 * (ograniczenie bazy), więc informacja „skróć zakres albo odwołaj te rezerwacje" jest
 * jedyną, która prowadzi dalej.
 *
 * Szuflada NIE MA ADRESU i to jest decyzja: opisuje byt, który dopiero powstanie,
 * a wklejony link do formularza nie prowadziłby do niczego, co istnieje.
 */

import { useMemo, useState } from 'react';

import type { BookingDto } from '../../api/dto';
import { useCreateBlock, useCreateBooking } from '../../queries/useCalendar';
import { usePilots } from '../../queries/usePilots';
import { Button, Card, Drawer, Field, OptionButton, TextInput } from '../../ui/components';
import { bookingErrorMessage } from './bookingRefusal';
import type { CalendarAircraft } from './calendarGrid';
import {
  BLOCK_REASONS,
  blockBlocker,
  bookingBlocker,
  emptyBlockDraft,
  emptyBookingDraft,
  toInstant,
  type Blocker,
} from './blockForm';
import { operationLabel, stempel, type PersonLookup } from './bookingLabels';

const OPERATIONS = [
  { value: 'skoki', name: 'Skoki', desc: 'Dzień skokowy' },
  { value: 'ferry', name: 'Przelot', desc: 'Lot z lotniska na lotnisko' },
  { value: 'egzamin', name: 'Egzamin', desc: 'Lot egzaminacyjny albo sprawdzian' },
  { value: 'techniczny', name: 'Lot techniczny', desc: 'Oblot, próba po obsłudze' },
  { value: 'inne', name: 'Inne', desc: 'Pozostałe' },
] as const;

interface Props {
  mode: 'block' | 'booking';
  aircraft: readonly CalendarAircraft[];
  bookings: readonly BookingDto[];
  person: PersonLookup;
  /** Strefa klubu - godziny kolizji czyta się tak samo, jak resztę kalendarza. */
  timezone: string;
  onClose: () => void;
}

export function BlockDrawer({ mode, aircraft, bookings, person, timezone, onClose }: Props) {
  const isBlock = mode === 'block';
  const [block, setBlock] = useState(emptyBlockDraft);
  const [booking, setBooking] = useState(emptyBookingDraft);
  const pilots = usePilots({});

  const createBlock = useCreateBlock();
  const createBooking = useCreateBooking();
  const pending = createBlock.isPending || createBooking.isPending;
  const error = createBlock.error ?? createBooking.error;

  const draft = isBlock ? block : booking;
  const blocker: Blocker = isBlock ? blockBlocker(block, Date.now()) : bookingBlocker(booking, Date.now());

  const clash = useMemo(
    () => collidingBookings(bookings, draft.aircraftId, draft.from, draft.to),
    [bookings, draft.aircraftId, draft.from, draft.to],
  );

  const patch = (change: Partial<typeof block & typeof booking>): void => {
    if (isBlock) setBlock((d) => ({ ...d, ...change }));
    else setBooking((d) => ({ ...d, ...change }));
  };

  const submit = (): void => {
    const from = toInstant(draft.from);
    const to = toInstant(draft.to);
    if (from == null || to == null) return;

    // Uuid nadaje KLIENT i to on jest całą idempotencją zapisu: powtórzone tapnięcie
    // przy wolnym łączu ma wrócić tym samym wierszem, a nie drugim terminem.
    const id = crypto.randomUUID();
    const common = {
      id,
      aircraftId: draft.aircraftId,
      startsAt: new Date(from).toISOString(),
      endsAt: new Date(to).toISOString(),
      note: draft.note.trim() === '' ? null : draft.note.trim(),
    };

    if (isBlock) {
      createBlock.mutate({ ...common, blockReason: block.reason }, { onSuccess: onClose });
    } else {
      createBooking.mutate(
        { ...common, pilotId: booking.pilotId, operation: booking.operation },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Drawer
      title={isBlock ? 'Wyłącz maszynę z użytku' : 'Zarezerwuj za pilota'}
      sub={
        isBlock
          ? 'Maszyna zniknie pilotom z kalendarza na wybrany czas'
          : 'Rezerwacja stanie na koncie pilota, tak jakby założył ją sam'
      }
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Anuluj
          </Button>
          <Button disabled={blocker != null || pending} onClick={submit}>
            {isBlock ? 'Wyłącz z użytku' : 'Zarezerwuj'}
          </Button>
        </>
      }
    >
      <Card title="Zakres">
        <Field htmlFor="cal-aircraft" label="Samolot">
          <select
            id="cal-aircraft"
            className="input"
            value={draft.aircraftId}
            onChange={(e) => patch({ aircraftId: e.target.value })}
          >
            <option value="">Wybierz maszynę</option>
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>
                {a.reg} · {a.type}
                {a.inService ? '' : ' (poza służbą)'}
              </option>
            ))}
          </select>
        </Field>

        <div className="field-row">
          <Field htmlFor="cal-from" label="Od">
            <TextInput
              id="cal-from"
              type="datetime-local"
              value={draft.from}
              onChange={(e) => patch({ from: e.target.value })}
            />
          </Field>
          <Field htmlFor="cal-to" label="Do">
            <TextInput
              id="cal-to"
              type="datetime-local"
              value={draft.to}
              onChange={(e) => patch({ to: e.target.value })}
            />
          </Field>
        </div>

        {/* Zdanie pada wyłącznie przy stanie, którego z kontrolek nie widać: koniec
            przed początkiem albo termin miniony. Brakujące pole zdania nie dostaje -
            widać je z formularza (reguła z issue #55). */}
        {blocker != null && blocker !== 'incomplete' ? (
          <p className="card-note danger">{blocker.reason}</p>
        ) : null}
      </Card>

      {isBlock ? (
        <Card title="Powód">
          <div className="opt-list">
            {BLOCK_REASONS.map((option) => (
              <OptionButton
                key={option.value}
                name={option.name}
                desc={option.desc}
                selected={block.reason === option.value}
                onSelect={() => setBlock((d) => ({ ...d, reason: option.value }))}
              />
            ))}
          </div>
        </Card>
      ) : (
        <Card title="Kto i po co">
          <Field htmlFor="cal-pilot" label="Pilot">
            <select
              id="cal-pilot"
              className="input"
              value={booking.pilotId}
              onChange={(e) => setBooking((d) => ({ ...d, pilotId: e.target.value }))}
            >
              <option value="">Wybierz pilota</option>
              {(pilots.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.code}
                </option>
              ))}
            </select>
          </Field>
          <div className="opt-list">
            {OPERATIONS.map((option) => (
              <OptionButton
                key={option.value}
                name={option.name}
                desc={option.desc}
                selected={booking.operation === option.value}
                onSelect={() => setBooking((d) => ({ ...d, operation: option.value }))}
              />
            ))}
          </div>
        </Card>
      )}

      <Card title="Komentarz">
        <Field htmlFor="cal-note" label="Notatka">
          <TextInput
            id="cal-note"
            value={draft.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder={isBlock ? 'Np. przegląd 100 h w Jasionce' : 'Np. lot po części zamienne'}
          />
        </Field>
      </Card>

      {clash.length === 0 ? null : (
        <Card title="Co już stoi w tym oknie" tone="warn">
            {clash.map((b) => (
              <div className="kv" key={b.id}>
                <span className="kv-k">{stempel(new Date(b.startsAt), timezone)}</span>
                <span className="kv-v">
                  {b.kind === 'block'
                    ? 'wyłączenie z użytku'
                    : (b.pilotId == null ? '—' : (person(b.pilotId)?.name ?? '—'))}
                  {b.operation == null ? '' : ` · ${operationLabel(b.operation)}`}
                </span>
              </div>
            ))}
          <p className="card-note">
            {isBlock
              ? 'Wyłączenie tego nie odwoła. Zdejmij to z kalendarza albo skróć zakres.'
              : 'Ten termin jest zajęty. Wybierz inny albo zdejmij to, co tam stoi.'}
          </p>
        </Card>
      )}

      {error == null ? null : <p className="card-note danger">{bookingErrorMessage(error, timezone, person)}</p>}
    </Drawer>
  );
}

/**
 * Zajętości TEJ maszyny nakładające się na wybrane okno - liczone z danych, które ekran
 * już ma. Granice półotwarte, jak wszędzie w rezerwacjach: zetknięcie co do minuty nie
 * jest kolizją.
 */
function collidingBookings(
  bookings: readonly BookingDto[],
  aircraftId: string,
  from: string,
  to: string,
): BookingDto[] {
  const start = toInstant(from);
  const end = toInstant(to);
  if (aircraftId === '' || start == null || end == null || end <= start) return [];

  return bookings
    .filter((b) => b.aircraftId === aircraftId)
    .filter((b) => Date.parse(b.startsAt) < end && Date.parse(b.endsAt) > start)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

