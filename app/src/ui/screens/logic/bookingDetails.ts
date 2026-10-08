/**
 * Ninerdeck - KARTA REZERWACJI (`design/23`, #162 F7; ze zlecenia - `23f`, 4.0.0).
 *
 * ══ BOHATEREM EKRANU JEST TERMIN ══
 * To on jest przedmiotem rezerwacji - maszyna, zadanie i trasa tylko go opisują.
 * Dlatego godziny stoją wielkim składem na górze, a wszystko inne jest wierszem karty.
 *
 * ══ PLAN TO NIE FAKT ══
 * Czas lotu, paliwo i notatka opisują PRZYSZŁOŚĆ, której rejestr nie zna. Po locie
 * mają swoje faktyczne odpowiedniki na ekranie operacji (10) i to TAMTE wchodzą do
 * rozliczenia. Karty „plan kontra fakt" tu nie ma i nie będzie: rezerwacja zamyka się
 * w chwili, w której zaczyna się operacja.
 *
 * ══ CO WOLNO, LICZY SIĘ TU, A NIE W JSX ══
 * Odwołać da się WŁASNĄ rezerwację, która jeszcze się nie skończyła i nie jest
 * zamknięta; poprawić - własną, która się jeszcze nie zaczęła. Rozdzielenie jest
 * celowe: termin, który już trwa, można oddać (pilot nie poleci), ale przesuwanie
 * go wstecz opisywałoby przeszłość.
 *
 * ══ KARTA LICZY OBA FOTELE (decyzja 23 zleceń) ══
 * Drugi pilot widzi tę samą kartę, a w miejscu wiersza o sobie - wiersz „Dowódca": druga
 * osoba w kabinie jest jedyną, o którą pyta. Fotel zlecenia, którego jeszcze nikt nie
 * zajął, mówi „szukany".
 *
 * ══ REZERWACJA ZE ZLECENIA (23F, `docs/zlecenia.md` §5.3, §14.3) ══
 * Termin prowadzi zlecenie, a zlecenie prowadzi osoba zlecająca - więc „PRZESUŃ I POPRAW"
 * nie ma (serwer odrzuciłby to jako `booking_from_order`, a wyszarzony przycisk obiecywałby
 * akcję, której reguły nie dopuszczą). Odwołanie znaczy to, co znaczy dla OSOBY, która je
 * wciska - dokładnie jak na serwerze (`OrderBookingCommands.cancelOwn`):
 *  - przydzielony pilot REZYGNUJE: fotel wraca do szukania, termin zostaje zajęty;
 *  - zlecający w swoim fotelu „ja" odwołuje CAŁE zlecenie (pkt 57) - dla niego rezerwacja
 *    jest zleceniem.
 * Rolę rozpoznaje autor zlecenia (`createdBy`): w fotelu „ja" siedzi wyłącznie zlecający,
 * a jego samego nie ma wśród adresatów. Bez tego pola (serwer go nie przysłał) akcji nie
 * ma wcale - zgadnięta rola mogłaby skasować całe zlecenie komuś, kto chciał zrezygnować.
 */

import { duration, litres, relativeAge } from '@ninerdeck/format';

import type { CalendarBooking } from './calendarData';
import { clubHhmm, type ClubDayBounds } from './clubClock';
import { NONE, orderDate, orderReference, seatLabel } from './orderFormat';
import { operationLabelOf } from './operations';

export interface BookingDetailsInput {
  booking: CalendarBooking;
  day: ClubDayBounds;
  now: number;
  /** Ten pilot - cudza rezerwacja nie ma ani odwołania, ani poprawki. */
  pilotId: string;
  /** Czy klub prowadzi ścieżkę akceptacji dla tej rezerwacji (są kroki) - dla `editNote`. */
  hasPath?: boolean;
  /** Znak i typ maszyny z cache floty; `null` = poza cache'em. */
  aircraft: { reg: string; type: string | null } | null;
  /** Imię i nazwisko z pamięci klubu (druga osoba w kabinie, zlecający); `null` = poza nią. */
  nameOf: (pilotId: string) => string | null;
  /** Kod pilota w klubie; `null` = poza pamięcią klubu. */
  codeOf: (pilotId: string) => string | null;
  /** Nazwa lotniska po kodzie ICAO - rozwinięcie skrótu, nie druga informacja. */
  airfieldName: (icao: string) => string | null;
}

export interface BookingDetailRow {
  label: string;
  value: string;
  sub: string | null;
  /** Wartość maszynowa (znak, kod, godziny) - krój cyfr (`.kv-v .mono`). */
  mono?: boolean;
}

/** Rezerwacja ze zlecenia oczami osoby, która w niej siedzi (23F). */
export interface BookingOrderVm {
  /** `assigned` - przydzielony pilot (REZYGNUJĘ); `author` - zlecający w swoim fotelu. */
  role: 'assigned' | 'author';
  orderId: string;
  /**
   * Wiersz „Ze zlecenia" - ostatni w karcie i jedyny z szewronem. Przydzielonego prowadzi
   * do ROZMOWY z osobą zlecającą (29): po obsadzeniu zlecenie jest tą rezerwacją, więc
   * jedyne, co z nim zostało, to uzgodnienie zmiany. Zlecającego - do karty zlecenia (32),
   * bo tam zmienia termin i załogę.
   */
  row: BookingDetailRow;
  /** Wiersz odniesienia arkusza: „SP-AXA · sob 3 PAŹ 10:00-12:00". */
  reference: string;
  /**
   * Zdanie o skutku pod „REZYGNUJĘ" (23F); `null` przy zlecającym - skutek odwołania
   * zlecenia mówi jego arkusz (32C).
   */
  note: readonly { text: string; strong?: boolean }[] | null;
}

export interface BookingDetailsVm {
  /** „Sobota · 19 września" - czas klubu, jak cała siatka. */
  date: string;
  /** Stan rezerwacji: „Potwierdzona", „Odwołana", „Slot zwolniony". */
  badge: string;
  /** „09:00 → 11:00". */
  hours: string;
  /** „2 h" - długość terminu, nie planowany czas lotu. */
  length: string;
  /** „ZA 1 H 15 MIN", „TRWA"; `null` = termin minął albo rezerwacja zamknięta. */
  countdown: string | null;
  /** Co rezerwujesz: maszyna, zadanie, trasa, druga osoba w kabinie. */
  what: BookingDetailRow[];
  /** Plan lotu; pusta lista = pilot nie podał nic i sekcji nie ma. */
  plan: BookingDetailRow[];
  /** Rezerwacja ze zlecenia (23F); `null` = zwykła rezerwacja albo patrzący spoza foteli. */
  order: BookingOrderVm | null;
  /** Patrzący siedzi w którymś fotelu - rezerwacja jest jego (dowódca albo drugi pilot). */
  seated: boolean;
  canCancel: boolean;
  canEdit: boolean;
  /**
   * Rezerwacja ZAMKNIĘTA (odrzucona, wygasła, odwołana, zwolniona) ma jedno wyjście -
   * „wybierz inny termin" (23C/23D): nie ma czego przesuwać ani odwoływać, a wyszarzone
   * przyciski obiecywałyby akcje, których reguły nie dopuszczą.
   */
  closed: boolean;
  /**
   * Zdanie pod „PRZESUŃ I POPRAW" przy rezerwacji CZEKAJĄCEJ (23B): poprawka czyści zgody
   * i ekran mówi to PRZED tapnięciem. `null` przy potwierdzonej w klubie bez ścieżki -
   * tam nie ma czego czyścić; przy potwierdzonej PO ścieżce zdanie też pada, bo zgoda
   * dotyczyła terminu.
   */
  editNote: string | null;
  /**
   * Ostrzeżenie arkusza odwołania - SKUTEK przed tapnięciem. Przy rezerwacji z drugim
   * pilotem dochodzi zdanie o wiadomości do niego (§12.9, D2): odwołanie zawiadamia
   * osoby w fotelach poza odwołującym. Odwołanie zlecenia mówi zdaniem 32C; rezygnacja
   * ostrzeżenia nie ma (`null`) - jej skutek stoi przypisem pod przyciskiem.
   */
  cancelWarning: string | null;
}

const STATUS: Readonly<Record<string, string>> = {
  confirmed: 'Potwierdzona',
  pending: 'Czeka na zgodę',
  rejected: 'Odrzucona',
  expired: 'Wygasła',
  cancelled: 'Odwołana',
  released: 'Niewykorzystana',
  fulfilled: 'Zrealizowana',
};

const EDIT_NOTE = 'Po przesunięciu ścieżka rusza od nowa - zgoda dotyczyła tego terminu.';
const CANCEL_WARNING = 'Termin się zwolni i będzie mógł go zająć ktoś inny.';
/** To samo zdanie, co arkusz odwołania na karcie zlecenia (32C). */
const ORDER_CANCEL_WARNING =
  'Termin się zwolni, a adresaci, którzy nie odmówili, dostaną wiadomość - z powodem, jeśli go podasz.';

export function bookingDetails(input: BookingDetailsInput): BookingDetailsVm {
  const b = input.booking;
  const mine = b.pilotId === input.pilotId;
  const seated = mine || b.dualId === input.pilotId;
  const open = b.status === 'confirmed' || b.status === 'pending';
  // Zlecenie stoi za rezerwacją, także gdy patrzący nie zna jego adresu (`order.id`):
  // termin i tak prowadzi wtedy ktoś inny, więc poprawki nie ma dla nikogo.
  const fromOrder = b.order != null;
  const order = seated ? orderVm(input) : null;
  const editable = !fromOrder && mine && open && b.startsAt > input.now;

  return {
    date: orderDate(input.day),
    // Stan nieznany temu wydaniu jedzie SUROWY: nowszy serwer dokłada statusy
    // (3.1.0 - zgoda i odrzucenie), a „nieznany" mówiłby pilotowi mniej niż kod.
    badge: STATUS[b.status] ?? b.status,
    hours: `${clubHhmm(b.startsAt, input.day)} → ${clubHhmm(b.endsAt, input.day)}`,
    length: relativeAge(b.endsAt - b.startsAt),
    countdown: countdown(b, input.now, open),
    what: whatRows(input),
    plan: planRows(b),
    order,
    seated,
    canCancel: open && b.endsAt > input.now && (fromOrder ? order != null : mine),
    canEdit: editable,
    // Wyjście z zamkniętej należy do OBU foteli (§12.9): drugi pilot dostaje wiadomość
    // o odwołaniu i ląduje tutaj - karta bez żadnej drogi dalej byłaby ślepym zaułkiem.
    // Odwołać ani poprawić nie może nadal: to robi właściciel.
    closed: seated && !open && b.kind === 'flight',
    editNote: editable && input.hasPath === true ? EDIT_NOTE : null,
    cancelWarning: cancelWarning(b, order),
  };
}

/**
 * Ton karty terminu: stan rezerwacji (`approvalView`) zawężony o to, CZYJA jest.
 *
 * Zieleń mówi na tej karcie „moje i w normie" (makieta 23), więc cudza potwierdzona
 * dostaje zwykłą, neutralną ramkę - tak jak szary pasek cudzej rezerwacji na osi
 * (decyzja właściciela 2026-10-06). Bursztyn („czeka") i wygaszenie („zamknięta") zostają
 * u każdego: to są stany terminu, a nie przynależność. Plakietka stanu nie zmienia się -
 * „Potwierdzona" jest zielona, bo mówi o stanie, nie o właścicielu.
 */
export function termTone(
  heroTone: 'green' | 'amber' | 'off',
  seated: boolean,
): 'green' | 'amber' | 'neutral' | 'off' {
  return heroTone === 'green' && !seated ? 'neutral' : heroTone;
}

function cancelWarning(b: CalendarBooking, order: BookingOrderVm | null): string | null {
  if (order?.role === 'assigned') return null;
  if (order?.role === 'author') return ORDER_CANCEL_WARNING;
  return b.dualId == null ? CANCEL_WARNING : `${CANCEL_WARNING} Drugi pilot dostanie wiadomość.`;
}

function countdown(b: CalendarBooking, now: number, open: boolean): string | null {
  if (!open) return null;
  // Termin, który TRWA, nie dostaje liczby: odliczanie do przeszłości nie znaczy nic,
  // a „minęło 20 min" jest zdaniem o locie, nie o rezerwacji.
  if (now >= b.startsAt) return now < b.endsAt ? 'TRWA' : null;
  return `ZA ${relativeAge(b.startsAt - now)}`.toUpperCase();
}

function whatRows(input: BookingDetailsInput): BookingDetailRow[] {
  const b = input.booking;
  const rows: BookingDetailRow[] = [
    {
      label: 'Samolot',
      value: input.aircraft?.reg ?? b.aircraftId,
      sub: input.aircraft?.type ?? null,
      mono: true,
    },
  ];

  // Rodzaj nieznany temu wydaniu nie dostaje wiersza: „ferry" na karcie byłoby
  // napisem z wnętrza bazy pokazanym pilotowi (`operationLabelOf`).
  const zadanie = operationLabelOf(b.operation);
  if (zadanie != null) {
    rows.push({ label: 'Zadanie', value: zadanie, sub: null });
  }

  const route = routeDetailRow(b.fromIcao, b.toIcao, input.airfieldName);
  if (route != null) rows.push({ ...route, mono: true });

  const crew = crewRow(input);
  if (crew != null) rows.push(crew);

  return rows;
}

/**
 * Druga osoba w kabinie: dowódca (i każdy spoza foteli) widzi drugiego pilota, drugi
 * pilot - dowódcę. Kod jest wartością (odróżnia dwóch Nowaków), nazwisko - rozwinięciem;
 * poza pamięcią klubu zostaje kreska, nigdy surowy identyfikator.
 */
function crewRow(input: BookingDetailsInput): BookingDetailRow | null {
  const b = input.booking;
  const me = input.pilotId;
  const asDual = b.dualId === me && b.pilotId !== me;
  const seat = asDual ? 'pic' : 'dual';
  const person = asDual ? b.pilotId : b.dualId;
  const label = seatLabel(seat);

  if (person != null) {
    return { label, value: input.codeOf(person) ?? NONE, sub: input.nameOf(person), mono: true };
  }
  // „Szukany" mówi się tylko komuś z załogi: patrzącemu z zewnątrz brak drugiej osoby
  // nazywa pasek zlecenia w kalendarzu, a karta nie ma czego dodać.
  const seated = b.pilotId === me || b.dualId === me;
  return seated && b.order?.seeking.includes(seat) === true ? { label, value: 'szukany', sub: null } : null;
}

function orderVm(input: BookingDetailsInput): BookingOrderVm | null {
  const b = input.booking;
  const order = b.order;
  if (order?.id == null || order.createdBy == null) return null;

  const reference = orderReference(input.aircraft?.reg ?? b.aircraftId, input.day, b.startsAt, b.endsAt);

  if (order.createdBy === input.pilotId) {
    return {
      role: 'author',
      orderId: order.id,
      row: { label: 'Ze zlecenia', value: 'Twoje zlecenie', sub: 'termin zmienisz edycją zlecenia' },
      reference,
      note: null,
    };
  }

  // Nazwisko w mianowniku, bez odmiany (słownik §3); kod odróżnia dwie osoby o tym samym
  // nazwisku, a zdanie o rozmowie mówi, czemu ten wiersz prowadzi gdzieś dalej.
  const name = input.nameOf(order.createdBy);
  const code = input.codeOf(order.createdBy);
  return {
    role: 'assigned',
    orderId: order.id,
    row: {
      label: 'Ze zlecenia',
      value: name ?? NONE,
      sub: code == null ? 'termin uzgodnisz w rozmowie' : `${code} · termin uzgodnisz w rozmowie`,
    },
    reference,
    note: [
      { text: 'Po rezygnacji ' },
      { text: 'fotel znów będzie do obsadzenia', strong: true },
      { text: `, a ${name ?? 'osoba zlecająca'} dostanie wiadomość.` },
    ],
  };
}

/**
 * Wiersz trasy - „Trasa EPKK → EPRJ" albo „Lotnisko EPKP" - z rozwinięciem nazw. Wspólny
 * dla karty rezerwacji (23) i karty zlecenia (28, 32), bo to ten sam termin i te same pola.
 */
export function routeDetailRow(
  fromIcao: string | null,
  toIcao: string | null,
  airfieldName: (icao: string) => string | null,
): BookingDetailRow | null {
  if (fromIcao == null && toIcao == null) return null;

  // Skoki startują i lądują na tym samym placu, więc para powtarzałaby kod dwa razy
  // (issue #13 - reguła mieszka w domenie, a tu widać jej skutek).
  const same = fromIcao != null && toIcao != null && fromIcao === toIcao;
  if (same || toIcao == null) {
    const icao = fromIcao ?? toIcao!;
    return { label: 'Lotnisko', value: icao, sub: airfieldName(icao) };
  }
  if (fromIcao == null) {
    return { label: 'Lądowanie', value: toIcao, sub: airfieldName(toIcao) };
  }

  const from = airfieldName(fromIcao);
  const to = airfieldName(toIcao);
  return {
    label: 'Trasa',
    value: `${fromIcao} → ${toIcao}`,
    // Rozwinięcie jest parą albo go nie ma: jedna znana nazwa obok surowego kodu
    // wyglądałaby na brak danych po drugiej stronie strzałki.
    sub: from != null && to != null ? `${from} → ${to}` : null,
  };
}

function planRows(b: CalendarBooking): BookingDetailRow[] {
  const rows: BookingDetailRow[] = [];

  if (b.plannedAirMin != null) {
    rows.push({ label: 'Czas lotu', value: duration(b.plannedAirMin * 60_000), sub: null, mono: true });
  }
  if (b.plannedFuelL != null) {
    rows.push({ label: 'Paliwo', value: litres(b.plannedFuelL), sub: 'do zabrania', mono: true });
  }
  if (b.note != null && b.note.trim() !== '') {
    rows.push({ label: 'Notatka', value: b.note.trim(), sub: null });
  }

  return rows;
}
