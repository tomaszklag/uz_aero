/**
 * Ninerdeck - panel: moduł Kalendarz (`#/kalendarz`, issue #160).
 *
 * Administrator odpowiada tu na dwa pytania: „co stoi w kalendarzu floty" i „ta maszyna
 * jest od wtorku na przeglądzie". Oś to MASZYNY × DNI - inaczej niż na telefonie, gdzie
 * osią jest jedna doba całej floty. Ta sama zajętość, dwa pytania, dwa kadry.
 *
 * ══ OŚ JEST WEJŚCIEM W REZERWACJĘ (issue #233) ══
 * Od 3.2.0 każdy członek rezerwuje z tej samej osi, którą ogląda: „Zarezerwuj" w nagłówku
 * (jedyna akcja główna - czynność każdego i najczęstsza w module) albo kliknięcie w wolne
 * miejsce komórki, które podstawia maszynę i dzień. Własne wpisy są zielone - pilot szuka
 * na osi przede wszystkim siebie. Akcje administratora schodzą do przycisków wyciszonych.
 *
 * ══ CZEGO TU NIE MA ══
 * **Sugestii slotów przy „Zarezerwuj za pilota".** Administrator patrzy na całość
 * i wpisuje konkretny termin (§10). Sugestie ma WŁASNA rezerwacja - pilot szuka miejsca
 * dla siebie, dokładnie dla tego przypadku powstały.
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
import type { BookingDto } from '../../api/dto';
import { useApprovalQueue } from '../../queries/useApprovals';
import { useBooking, useCalendar } from '../../queries/useCalendar';
import { useDirectory } from '../../queries/useDirectory';
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
import { dayMonthLabel, weekdayAccusative } from './bookingLabels';
import { buildCalendarGrid, hasAnyItem } from './calendarGrid';
import { clubToday } from './clubClock';
import { calendarAircraft, personLookup } from './directoryLookups';
import { OwnBookingDrawer } from './OwnBookingDrawer';
import { draftFromBooking, emptyOwnDraft, rebookDraft, type OwnDraft } from './ownBookingForm';
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
  // Szuflada WŁASNEJ rezerwacji (#233): szkic startowy i - w poprawce - rezerwacja.
  const [own, setOwn] = useState<{ seed: OwnDraft; editing: BookingDto | null } | null>(null);

  const range = (params.get('zakres') as RangeKey | null) ?? DEFAULT_RANGE;
  const known = RANGE_OPTIONS.some((o) => o.key === range) ? range : DEFAULT_RANGE;

  // Okno liczy się RAZ na wejście w ekran, nie przy każdym renderze: `Date.now()`
  // w ciele komponentu dawałby nowy klucz zapytania co sekundę, czyli odpytywanie
  // serwera w kółko i migającą siatkę.
  const query = useMemo(() => calendarQuery(known, Date.now()), [known]);

  const calendar = useCalendar(query);
  // Znaki i nazwiska ze SŁOWNIKA klubu, nie z list modułów Piloci i Samoloty
  // (issue #216): kalendarz ma każdy członek, tamte listy - „Podgląd klubu".
  const directory = useDirectory();

  const setRange = (key: RangeKey): void => {
    const next = new URLSearchParams(params);
    if (key === DEFAULT_RANGE) next.delete('zakres');
    else next.set('zakres', key);
    setParams(next, { replace: true });
  };

  const aircraft = useMemo(() => calendarAircraft(directory.data), [directory.data]);

  // Rozwiązanie identyfikatora na członka klubu ze słownika, który ekran i tak pobiera.
  // Kalendarz nie dostaje nazwisk w DTO zajętości i nie ma ich dostawać: ta sama
  // reguła, przez którą dziennik rozwiązuje kody z listy, a nie z wiersza.
  const person = useMemo(() => personLookup(directory.data), [directory.data]);

  const viewer = session?.pilot ?? null;
  const timezone = calendar.data?.timezone ?? '';
  // Bez znanej strefy klubu oś nie ma wejść - „dziś" przeglądarki bywa innym dniem niż
  // „dziś" na lotnisku, a komórka wczorajsza z plusem obiecywałaby termin miniony.
  const today = timezone === '' ? null : clubToday(Date.now(), timezone);

  const rows = useMemo(
    () =>
      buildCalendarGrid({
        days: calendar.data?.days ?? [],
        aircraft,
        bookings: calendar.data?.bookings ?? [],
        person,
        viewerId: viewer?.id ?? null,
        today,
      }),
    [calendar.data, aircraft, person, viewer, today],
  );

  const fromGrid = id == null ? null : (calendar.data?.bookings ?? []).find((b) => b.id === id) ?? null;
  // Wpisu spoza siatki (link do rezerwacji w innym tygodniu, rezerwacja już zamknięta)
  // szuflada też ma otworzyć - pytamy o niego wprost.
  const fetched = useBooking(id != null && fromGrid == null ? id : null);
  const open = fromGrid ?? fetched.data?.booking ?? null;

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

  const error = calendar.error ?? directory.error ?? queue.error;

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
              <Button variant="ghost" onClick={() => setForm('block')}>
                Wyłącz maszynę z użytku
              </Button>
            ) : null}
            {/* JEDYNA akcja główna ekranu - rezerwacja jest czynnością KAŻDEGO członka
                i najczęstszą w module (#233). Akcje administratora wyżej są wyciszone. */}
            {viewer == null || session?.org == null ? null : (
              <Button onClick={() => setOwn({ seed: emptyOwnDraft(), editing: null })}>Zarezerwuj</Button>
            )}
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
          pending={calendar.isPending || directory.isPending}
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
              <Grid
                rows={rows}
                days={calendar.data?.days ?? []}
                timezone={timezone}
                onAdd={(aircraftId, date) =>
                  setOwn({ seed: emptyOwnDraft({ aircraftId, date }), editing: null })
                }
              />
              {hasAnyItem(rows) ? null : (
                <EmptyState
                  icon={<CalendarIcon />}
                  title="W tym zakresie nikt nic nie zaplanował"
                  note="Flota jest wolna. Kliknij wolne miejsce przy maszynie, żeby ją zarezerwować."
                />
              )}
              <div className="cal-legend">
                <span className="cal-legend-item">
                  <span className="cal-swatch" />
                  Rezerwacja
                </span>
                {/* Pilot szuka na osi przede wszystkim SIEBIE (#233). */}
                <span className="cal-legend-item">
                  <span className="cal-swatch mine" />
                  Twoja rezerwacja
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
          timezone={timezone}
          canManage={canManage}
          viewerId={viewer?.id ?? null}
          onEdit={(booking) => {
            navigate('/kalendarz');
            setOwn({ seed: draftFromBooking(booking, timezone), editing: booking });
          }}
          onRebook={(booking) => {
            navigate('/kalendarz');
            setOwn({ seed: rebookDraft(booking, timezone), editing: null });
          }}
          onClose={() => navigate('/kalendarz')}
        />
      )}

      {own == null || viewer == null ? null : (
        <OwnBookingDrawer
          aircraft={aircraft}
          members={directory.data?.members ?? []}
          viewer={viewer}
          person={person}
          timezone={timezone}
          seed={own.seed}
          editing={own.editing}
          onClose={() => setOwn(null)}
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
  timezone: string;
  /** Kliknięcie w wolne miejsce komórki - szuflada własnej rezerwacji z maszyną i dniem. */
  onAdd: (aircraftId: string, date: string) => void;
}

function Grid({ rows, days, timezone, onAdd }: GridProps) {
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
            {row.cells.map((cell, j) => (
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
                {/* Wolne miejsce komórki jest celem kliknięcia - w spoczynku nie rysuje
                    nic, pod kursorem tło i plus (#233). Dzień miniony, maszyna poza
                    służbą i doba zajęta w całości przeglądem celu NIE dostają. */}
                {cell.addable ? (
                  <button
                    type="button"
                    className="cal-add"
                    title={addTitle(row.aircraft.reg, days[j], timezone)}
                    aria-label={addTitle(row.aircraft.reg, days[j], timezone)}
                    onClick={() => onAdd(row.aircraft.id, cell.date)}
                  >
                    +
                  </button>
                ) : null}
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
const itemClass = (item: { kind: string; status: string; mine: boolean }): string =>
  [
    'cal-item',
    item.kind === 'block' ? 'block' : '',
    item.status === 'pending' ? 'pending' : '',
    item.mine ? 'mine' : '',
  ]
    .filter((c) => c !== '')
    .join(' ');

/**
 * „Zarezerwuj SP-AXA na sobotę 26 września" - podpis celu kliknięcia. Dzień z POŁUDNIA
 * doby klubu, jak nagłówek kolumny: jej początek wypada przed północą UTC.
 */
function addTitle(reg: string, day: { startsAt: string; endsAt: string } | undefined, tz: string): string {
  if (day == null) return `Zarezerwuj ${reg}`;
  const mid = new Date((Date.parse(day.startsAt) + Date.parse(day.endsAt)) / 2);
  return `Zarezerwuj ${reg} na ${weekdayAccusative(mid, tz)} ${dayMonthLabel(mid, tz)}`;
}

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
