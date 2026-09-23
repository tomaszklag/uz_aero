/**
 * Ninerdeck - panel: moduł Kalendarz (`#/kalendarz`, issue #160).
 *
 * Administrator odpowiada tu na dwa pytania: „co stoi w kalendarzu floty" i „ta maszyna
 * jest od wtorku na przeglądzie". Oś to MASZYNY × DNI - inaczej niż na telefonie, gdzie
 * osią jest jedna doba całej floty. Ta sama zajętość, dwa pytania, dwa kadry.
 *
 * ══ CZEGO TU NIE MA ══
 * **Sugestii slotów.** To narzędzie pilota szukającego miejsca dla siebie; administrator
 * patrzy na całość i wpisuje konkretny termin (§10). Podpowiadanie mu, gdzie „najlepiej"
 * wcisnąć przegląd, byłoby radą w sprawie, o której wie więcej niż algorytm.
 *
 * ══ MASZYNY WYŁĄCZONE ZE SŁUŻBY ZOSTAJĄ W SIATCE ══
 * Zwijamy to, czego administrator NIE SZUKA, wchodząc na ekran - a „czemu nie ma czym
 * latać" jest dokładnie tym, po co się tu wchodzi. Wiersz takiej maszyny jest wyciszony,
 * nie schowany.
 */

import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { can } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { useApprovalQueue } from '../../queries/useApprovals';
import { useCalendar } from '../../queries/useCalendar';
import { useFleet } from '../../queries/useFleet';
import { usePilots } from '../../queries/usePilots';
import {
  Banner,
  Button,
  EmptyState,
  FilterChip,
  LinkButton,
  Loadable,
  PageHead,
} from '../../ui/components';
import { CalendarIcon, PlaneIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { BlockDrawer } from './BlockDrawer';
import { BookingDrawer } from './BookingDrawer';
import type { Person } from './bookingLabels';
import { buildCalendarGrid, hasAnyItem, type CalendarAircraft } from './calendarGrid';
import { queueBanner } from './queueCards';
import {
  DEFAULT_RANGE,
  RANGE_OPTIONS,
  calendarQuery,
  rangeDays,
  type RangeKey,
} from './calendarRange';

/** Skróty dni po polsku - `Intl` dałby „pon.", a kolumna ma 88 px. */
const DOW = ['Nd', 'Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'] as const;

export function CalendarScreen() {
  const { session } = useSessionState();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<'block' | 'booking' | null>(null);

  const range = (params.get('zakres') as RangeKey | null) ?? DEFAULT_RANGE;
  const known = RANGE_OPTIONS.some((o) => o.key === range) ? range : DEFAULT_RANGE;

  // Okno liczy się RAZ na wejście w ekran, nie przy każdym renderze: `Date.now()`
  // w ciele komponentu dawałby nowy klucz zapytania co sekundę, czyli odpytywanie
  // serwera w kółko i migającą siatkę.
  const query = useMemo(() => calendarQuery(known, Date.now()), [known]);

  const calendar = useCalendar(query);
  const fleet = useFleet({});
  const pilots = usePilots({});

  const setRange = (key: RangeKey): void => {
    const next = new URLSearchParams(params);
    if (key === DEFAULT_RANGE) next.delete('zakres');
    else next.set('zakres', key);
    setParams(next, { replace: true });
  };

  const aircraft: CalendarAircraft[] = useMemo(
    () =>
      (fleet.data?.items ?? []).map((a) => ({
        id: a.id,
        reg: a.reg,
        type: a.type,
        inService: a.serviceStatus === 'active',
      })),
    [fleet.data?.items],
  );

  // Rozwiązanie identyfikatora na członka klubu z listy, którą ekran i tak pobiera.
  // Kalendarz nie dostaje nazwisk w DTO zajętości i nie ma ich dostawać: ta sama
  // reguła, przez którą dziennik rozwiązuje kody z `usePilots`, a nie z wiersza.
  const person = useMemo(() => {
    const byId = new Map<string, Person>(
      (pilots.data?.items ?? []).map((p) => [p.id, { name: p.name, code: p.code }]),
    );
    return (pilotId: string): Person | null => byId.get(pilotId) ?? null;
  }, [pilots.data?.items]);

  const rows = useMemo(
    () =>
      buildCalendarGrid({
        days: calendar.data?.days ?? [],
        aircraft,
        bookings: calendar.data?.bookings ?? [],
        person,
      }),
    [calendar.data, aircraft, person],
  );

  const open = id == null ? null : (calendar.data?.bookings ?? []).find((b) => b.id === id) ?? null;

  // Brak uprawnienia = BRAK przycisku, nie przycisk wyszarzony (`panel-2.0.md` §3.3).
  const canBlock = can(session?.capabilities, 'fleet.manage');
  const canManage = can(session?.capabilities, 'reservations.manage');
  // Ścieżkę układa się raz i zagląda do niej rzadko - konfiguracja idzie akcją WYCISZONĄ
  // (`accounts.manage`, bo to rozdanie władzy). Kolejkę pyta wyłącznie ten, kto w ogóle
  // akceptuje: bez zdolności odpowiedź byłaby 403 na ekranie, na którym nic nie zaszło.
  const canConfigure = can(session?.capabilities, 'accounts.manage');
  const canApprove = can(session?.capabilities, 'reservations.approve');
  const queue = useApprovalQueue(canApprove);
  const waiting = useMemo(
    () =>
      queueBanner(queue.data?.items ?? [], {
        timezone: queue.data?.timezone ?? '',
        now: Date.now(),
      }),
    [queue.data],
  );

  const error = calendar.error ?? fleet.error ?? queue.error;

  return (
    <>
      <PageHead
        title="Kalendarz"
        actions={
          <>
            {canConfigure ? (
              <LinkButton to="/kalendarz/sciezka" variant="ghost">
                Ścieżka akceptacji
              </LinkButton>
            ) : null}
            {canManage ? (
              <Button variant="ghost" onClick={() => setForm('booking')}>
                Zarezerwuj za pilota
              </Button>
            ) : null}
            {canBlock ? (
              <Button onClick={() => setForm('block')}>Wyłącz maszynę z użytku</Button>
            ) : null}
          </>
        }
      />

      {/* Baner STOI NAD siatką i pojawia się w reakcji na odpowiedź, która właśnie
          przyszła - panel 2.0 nie ma ani jednego banera stałego. Siatka zostaje pod nim
          z ostatnimi danymi: puste miejsce po awarii wygląda jak pusty klub. */}
      {error == null ? null : (
        <Banner tone="danger" live>
          {errorMessage(error)}
        </Banner>
      )}

      {/* WEJŚCIE W KOLEJKĘ ISTNIEJE WYŁĄCZNIE Z PRACĄ: baner pojawia się, gdy coś czeka
          NA ZALOGOWANEGO - nie na klub. Pusta kolejka to stan domyślny i nie dostaje
          zdania (reguła SyncChipa); liczba w napisie, bo „coś czeka" kazałoby wejść,
          żeby się dowiedzieć ile. */}
      {waiting == null ? null : (
        <Banner
          tone="status"
          action={
            <LinkButton to="/kalendarz/decyzje" size="sm" variant="ghost">
              Rozpatrz
            </LinkButton>
          }
        >
          <b>{waiting.lead}</b> {waiting.detail}
        </Banner>
      )}

      <div className="filters">
        {RANGE_OPTIONS.map((option) => (
          <FilterChip
            key={option.key}
            label={option.label}
            on={known === option.key}
            onToggle={() => setRange(option.key)}
          />
        ))}
      </div>

      <div className="card">
        <Loadable
          pending={calendar.isPending || fleet.isPending}
          skeleton={<CalendarSkeleton days={rangeDays(known)} />}
        >
          {aircraft.length === 0 ? (
            <EmptyState
              icon={<PlaneIcon />}
              title="Klub nie ma jeszcze ani jednej maszyny"
              note="Dodaj samolot w module Samoloty - dopiero wtedy będzie co rezerwować."
            />
          ) : (
            <>
              <Grid rows={rows} days={calendar.data?.days ?? []} />
              {hasAnyItem(rows) ? null : (
                <EmptyState
                  icon={<CalendarIcon />}
                  title="W tym zakresie nikt nic nie zaplanował"
                  note="Flota jest wolna. Rezerwacje zakładają piloci w aplikacji."
                />
              )}
              <div className="cal-legend">
                <span className="cal-legend-item">
                  <span className="cal-swatch" />
                  Rezerwacja
                </span>
                {/* Stan „czeka na akceptację" różni się KSZTAŁTEM (przerywana ramka), nie
                    barwą - bursztyn niesie wyłączenie z użytku (issue #165, H4). */}
                <span className="cal-legend-item">
                  <span className="cal-swatch pending" />
                  Czeka na akceptację
                </span>
                <span className="cal-legend-item">
                  <span className="cal-swatch block" />
                  Wyłączona z użytku
                </span>
              </div>
            </>
          )}
        </Loadable>
      </div>

      {open == null ? null : (
        <BookingDrawer
          booking={open}
          person={person}
          reg={aircraft.find((a) => a.id === open.aircraftId)?.reg ?? open.aircraftId}
          timezone={calendar.data?.timezone ?? ''}
          canManage={canManage}
          onClose={() => navigate('/kalendarz')}
        />
      )}

      {form == null ? null : (
        <BlockDrawer
          mode={form}
          aircraft={aircraft}
          bookings={calendar.data?.bookings ?? []}
          timezone={calendar.data?.timezone ?? ''}
          person={person}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

interface GridProps {
  rows: ReturnType<typeof buildCalendarGrid>;
  days: NonNullable<ReturnType<typeof useCalendar>['data']>['days'];
}

function Grid({ rows, days }: GridProps) {
  const navigate = useNavigate();
  if (days.length === 0) return null;

  return (
    <div className="cal" style={calVars(days.length)}>
      <div className="cal-head">
        <span />
        <div className="cal-days">
          {days.map((day) => {
            const at = new Date(day.startsAt);
            // Dzień tygodnia bierze się z POŁUDNIA doby, nie z jej początku: doba klubu
            // zaczyna się przed północą UTC, więc `getUTCDay()` na jej granicy trafiałby
            // w dzień poprzedni.
            const mid = new Date((Date.parse(day.startsAt) + Date.parse(day.endsAt)) / 2);
            const dow = mid.getUTCDay();
            return (
              <div
                key={day.date}
                className={['cal-day', dow === 0 || dow === 6 ? 'weekend' : ''].join(' ').trim()}
              >
                <span className="cal-day-dow">{DOW[dow]}</span>
                <span className="cal-day-num">{day.date.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {rows.map((row) => (
        <div className="cal-row" key={row.aircraft.id}>
          <span className="cal-reg">
            <span className="cal-reg-mark">{row.aircraft.reg}</span>
            <span className="cal-reg-type">
              {row.aircraft.inService ? row.aircraft.type : 'poza służbą'}
            </span>
          </span>
          <div className="cal-cells">
            {row.cells.map((cell) => (
              <div
                key={cell.date}
                className={['cal-cell', cell.items.length === 0 ? 'off' : ''].join(' ').trim()}
              >
                {cell.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={itemClass(item)}
                    onClick={() => navigate(`/kalendarz/${item.id}`)}
                  >
                    {item.continues ? `· ${item.label}` : item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Zmienne siatki: liczba kolumn dni i SZEROKOŚĆ KOLUMNY ZNAKU.
 *
 * Obie są wymagane, bo `.cal-head` i `.cal-row` budują z nich `grid-template-columns`.
 * Kod ustawiał samo `--cal-days` i reguła siatki była przez to NIEPRAWIDŁOWA - a wtedy
 * przeglądarka ją pomija i wiersz układa się w JEDNEJ kolumnie: znak maszyny nad
 * paskami zamiast obok nich. Wartość 88 px przychodzi z makiet (`kalendarz-flota`),
 * które ustawiają ją na `.cal` tak samo.
 */
const calVars = (days: number): React.CSSProperties =>
  ({ '--cal-days': days, '--cal-reg-col': '88px' }) as React.CSSProperties;

/**
 * Klasa paska niesie RODZAJ i STAN: wyłączenie z użytku ma własny ton, a rezerwacja
 * jeszcze niepotwierdzona jest wyciszona - bez tego termin, o którym nikt nie
 * zdecydował, wyglądał na pewny.
 */
const itemClass = (item: { kind: string; status: string }): string =>
  ['cal-item', item.kind === 'block' ? 'block' : '', item.status === 'pending' ? 'pending' : '']
    .filter((c) => c !== '')
    .join(' ');

/**
 * Plamki w geometrii docelowej: pięć wierszy, bo tyle ma typowa flota klubu. Nagłówek
 * dni ma prawdziwą liczbę kolumn - zakres znamy lokalnie, więc nie migocze.
 */
function CalendarSkeleton({ days }: { days: number }) {
  return (
    <div className="cal" style={calVars(days)} aria-busy="true">
      {Array.from({ length: 5 }, (_, row) => (
        <div className="cal-row" key={row}>
          <span className="cal-reg">
            <span className="skeleton cell" style={{ width: '58px' }} />
          </span>
          <div className="cal-cells">
            {Array.from({ length: days }, (_, col) => (
              <div className="cal-cell" key={col}>
                {(row + col) % 3 === 0 ? <span className="skeleton cell" style={{ width: '100%' }} /> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
