/**
 * Ninerdeck - WIADOMOŚCI ZLECEŃ W SKRZYNCE (4.0.0, epik Z-C #247; makiety 25D, 25E;
 * `docs/zlecenia.md` §12).
 *
 * Dwanaście rodzajów `order_*`, jeden kształt wiersza. Skrzynka niesie OBIE role naraz -
 * osoba, która zleca, dostaje zlecenia także od innych - więc obok siebie stoją wiadomości
 * ADRESATA (zlecenie, zmiana, edycja, przydział, nieaktualne, odwołane, rozmowa) i AUTORA
 * (odpowiedź, rezygnacja, brak kompletu, wygaśnięcie).
 *
 * ══ TYTUŁ RZECZOWNIKIEM ZE ZNAKIEM MASZYNY ══
 * „Zlecenie lotu · SP-AXA", nie „Marta Zięba zleca Ci lot": rzeczownik brzmi tak samo bez
 * względu na płeć osoby, która działała, a znak odróżnia dwa zlecenia tego samego dnia.
 * Nazwisko stoi na początku zdania, pogrubione i odcięte separatorem - w mianowniku.
 * Podpis niesie termin czasem klubu; przy zmianie terminu - dzień, zadanie i trasę, bo
 * godziny mówi samo zdanie („Termin ~~09:00-11:00~~ → **10:00-12:00**").
 *
 * ══ O INNYCH ADRESATACH ANI SŁOWA (pkt 18) ══
 * „Zlecenie nieaktualne" nie mówi, kto dostał fotel, a „Zlecenie edytowane" - kto je
 * zmienił (pkt 31). Nazwisko pada tam, gdzie osoba coś POWIEDZIAŁA: zlecając, odpowiadając,
 * rezygnując, odwołując albo pisząc w rozmowie.
 *
 * ══ PLAKIETKA SPRAWY: „DO ODPOWIEDZI" ══
 * Stoi przy zleceniu i przy zmianie terminu, dopóki odpowiedź nie padnie - także na
 * przeczytanym wierszu (wiadomość to nie sprawa, reguła z 25). Źródłem jest lista „Do mnie",
 * nie wiadomość: odpowiedź mogła paść z karty zlecenia minutę wcześniej.
 *
 * ══ TE SAME ZDANIA, CO W SKRZYNCE PANELU ══
 * Panel (`admin/src/screens/inbox/inboxRows.ts`) mówi o tych samych wiadomościach - tam,
 * gdzie makieta 25D milczy (przyjęcie imienne, powód odebrania, rezygnacja), brzmienia
 * idą za panelem; fotel, podgląd rozmowy i „odpowiedz od nowa" panel dostanie w Z-D.
 *
 * ══ DOKĄD PROWADZI WIERSZ ══
 * Tam, gdzie budzik tego rodzaju - jedna mapa (`pushTarget`): karta zlecenia, a wiersz
 * rozmowy od razu rozmowa.
 */

import { plural } from '@ninerdeck/format';

import type { RemoteNotification, RemoteSeat } from '../../../application';

import type { ClubDayBounds } from './clubClock';
import type { InboxGlyph, InboxPart, InboxRowVm, InboxTone } from './inbox';
import { operationLabelOf } from './operations';
import { fieldChanges, type FieldChange } from './orderChanges';
import {
  dayIndex,
  instant,
  orderDay,
  orderDayWeekday,
  orderSpan,
  orderTerm,
  routeCodes,
  seatGenitive,
  seatLabel,
  seatLower,
} from './orderFormat';
import { pushTarget } from './pushTarget';

export interface OrderInboxInput {
  n: RemoteNotification;
  /** Pola wspólne każdego wiersza skrzynki - identyfikator, wiek, „nowe", rezerwacja, maszyna. */
  base: Pick<InboxRowVm, 'id' | 'when' | 'isNew' | 'bookingId' | 'aircraftId'>;
  /** Znak maszyny do tytułu; „samolot", gdy maszyny nie ma w pamięci floty. */
  regTitle: string;
  regOf: (aircraftId: string) => string | null;
  nameOf: (pilotId: string) => string | null;
  /** Zlecenia czekające na MOJĄ odpowiedź - plakietka „Do odpowiedzi". */
  answerIds: ReadonlySet<string>;
}

const ANSWER_TODO = 'Do odpowiedzi';

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value != null && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const seatOf = (value: unknown): RemoteSeat | null => (value === 'pic' || value === 'dual' ? value : null);
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Cytat - zdanie człowieka, nie aplikacji (powód odmowy, odwołania, treść wiadomości). */
const quote = (text: string): string => `„${text}"`;

/**
 * Nazwisko pogrubione i odcięte separatorem, a za nim reszta zdania. Poza pamięcią klubu
 * zostaje sama reszta, z wielkiej litery - kreska w miejscu osoby nic by nie powiedziała.
 */
function withName(name: string | null, rest: InboxPart[]): InboxPart[] {
  if (name == null) {
    const [first, ...tail] = rest;
    return first == null ? [] : [{ ...first, text: capital(first.text) }, ...tail];
  }
  return rest.length === 0 ? [{ text: name, strong: true }] : [{ text: name, strong: true }, { text: ' · ' }, ...rest];
}

/**
 * Jedna zmiana w składzie skrzynki: „plan lotu ~~2:00~~ → **3:00**". Pole bez pary
 * (opis - za długi, żeby go cytować) mówi samo, że jest nowe.
 */
function pairParts(change: FieldChange, first: boolean): InboxPart[] {
  if (change.from == null || change.to == null) return [{ text: `${first ? 'Nowy' : 'nowy'} ${change.field}` }];
  return [
    { text: `${first ? capital(change.field) : change.field} ` },
    { text: change.from, strike: true },
    { text: ' → ' },
    { text: change.to, strong: true },
  ];
}

/** Zmiany jednej edycji jednym zdaniem: „Plan lotu ~~2:00~~ → **3:00** · nowy opis." */
function changeSentence(changes: readonly FieldChange[], leading: InboxPart[] = []): InboxPart[] {
  const out: InboxPart[] = [...leading];
  for (const change of changes) {
    if (out.length > 0) out.push({ text: ' · ' });
    out.push(...pairParts(change, out.length === 0));
  }
  if (out.length > 0) out.push({ text: '.' });
  return out;
}

/**
 * „09:00-11:00", a gdy termin przeszedł na inny dzień - „pt 2 PAŹ 09:00-11:00": same
 * godziny przy zmianie doby mówiłyby, że lot został tego samego dnia.
 */
function spanOf(value: unknown, day: ClubDayBounds, otherDay: number | null): string | null {
  if (!isObject(value)) return null;
  const startsAt = instant(str(value.startsAt));
  const endsAt = instant(str(value.endsAt));
  if (startsAt == null || endsAt == null) return null;
  const own = dayIndex(day, startsAt);
  // Datę liczy doba ORYGINALNA - przesunięta zachowuje datę oryginału i psułaby dzień
  // tygodnia; godziny przesuwa sam `orderSpan` (ta sama reguła, co `clubMomentLabel`).
  return otherDay == null || own === otherDay ? orderSpan(startsAt, endsAt, day) : orderTerm(day, startsAt, endsAt);
}

/** Dzień, w którym zaczyna się termin `{ startsAt }` - do porównania starego z nowym. */
function dayOfValue(value: unknown, day: ClubDayBounds): number | null {
  if (!isObject(value)) return null;
  const startsAt = instant(str(value.startsAt));
  return startsAt == null ? null : dayIndex(day, startsAt);
}

/** Wiersz zlecenia; `null` = to nie jest rodzaj zlecenia znany temu wydaniu (wiersz ogólny). */
export function orderInboxRow(input: OrderInboxInput): InboxRowVm | null {
  const { n, regTitle } = input;
  const p = n.payload;
  const orderId = str(p.orderId);
  if (orderId == null) return null;

  const day = n.day == null ? null : orderDay(n.day);
  const startsAt = instant(str(p.startsAt));
  const endsAt = instant(str(p.endsAt));
  const term = day == null || startsAt == null || endsAt == null ? null : orderTerm(day, startsAt, endsAt);
  const name = (value: unknown): string | null => {
    const who = str(value);
    return who == null ? null : input.nameOf(who);
  };
  /** Termin i fotel w podpisie („czw 1 PAŹ 10:00-11:30 · drugi pilot"). */
  const termSeat = (seat: RemoteSeat | null): string | null =>
    [term, seat == null ? null : seatLower(seat)].filter((x): x is string => x != null).join(' · ') || null;

  // Dokąd prowadzi wiersz - ta sama mapa, co budzik tego rodzaju.
  const target = pushTarget({ ...p, kind: n.kind }, null);
  const opens: InboxRowVm['opens'] =
    target.screen === 'OrderThread' ? 'thread' : target.screen === 'Order' ? 'order' : null;

  const row = (over: {
    tone: InboxTone;
    title: string;
    glyph?: InboxGlyph | null;
    sub?: string | null;
    parts?: InboxPart[];
    todo?: boolean;
    count?: string | null;
  }): InboxRowVm => ({
    ...input.base,
    tone: over.tone,
    title: over.title,
    sub: over.sub === undefined ? term : over.sub,
    reason: null,
    lead: null,
    late: null,
    todo: over.todo ?? false,
    todoLabel: ANSWER_TODO,
    opens,
    parts: over.parts == null || over.parts.length === 0 ? null : over.parts,
    glyph: over.glyph ?? null,
    count: over.count ?? null,
    orderId,
    recipientId: target.screen === 'OrderThread' ? target.params.recipientId : null,
  });

  switch (n.kind) {
    case 'order_offered': {
      // Fotel, o który pytamy - imiennie albo z grupy; bez niego (lista wspólna, osoba
      // przy obu fotelach) adresat potwierdza termin, a fotel wybierze prowadzący.
      const seat = seatOf(p.seat);
      const ask: InboxPart[] = [
        { text: !('seat' in p) ? 'zleca lot.' : seat == null ? 'termin do potwierdzenia.' : `proponowany fotel: ${seatLower(seat)}.` },
      ];
      if (p.reminder === true) ask.push({ text: ' Zlecenie czeka na Twoją odpowiedź.' });
      return row({
        tone: 'ask',
        glyph: 'order',
        title: `Zlecenie lotu · ${regTitle}`,
        parts: withName(name(p.createdBy), ask),
        todo: input.answerIds.has(orderId),
      });
    }

    case 'order_changed': {
      const changes = isObject(p.changes) ? p.changes : {};
      const ctx = day == null ? null : { day, regOf: input.regOf };
      if (p.term === true) {
        // Zmiana TERMINU jako jedyna zaczyna odpowiedzi od nowa (decyzja 13) - bursztyn,
        // bo coś, na co odpowiedź mogła już paść, przestało być aktualne.
        const move = isObject(changes.term) ? changes.term : null;
        const newDay = day == null ? null : dayOfValue(move?.to, day);
        const oldDay = day == null ? null : dayOfValue(move?.from, day);
        const before = day == null ? null : spanOf(move?.from, day, newDay);
        const after = day == null ? null : spanOf(move?.to, day, oldDay);
        const lead: InboxPart[] =
          before == null || after == null
            ? [{ text: 'Termin się zmienił' }]
            : [{ text: 'Termin ' }, { text: before, strike: true }, { text: ' → ' }, { text: after, strong: true }];
        const parts = changeSentence(ctx == null ? [] : fieldChanges(changes, ctx, ['term']), lead);
        // Odpowiedzi nie zbiera się od przydzielonego ani od autora - mówi o tym serwer.
        if (p.respond === true) parts.push({ text: ' Odpowiedz na nowy termin.' });
        const task = operationLabelOf(str(p.operation))?.toLowerCase() ?? null;
        const what = [task, routeCodes(str(p.fromIcao), str(p.toIcao))].filter((x): x is string => x != null).join(' ');
        return row({
          tone: 'warn',
          glyph: 'clock',
          title: `Zlecenie zmienione · ${regTitle}`,
          sub:
            [day == null || startsAt == null ? null : orderDayWeekday(day, startsAt), what === '' ? null : what]
              .filter((x): x is string => x != null)
              .join(' · ') || null,
          parts,
          todo: input.answerIds.has(orderId),
        });
      }
      // Każda inna zmiana: CO zmieniono, bez nazwiska (pkt 31) i bez plakietki sprawy -
      // odpowiedź, jeśli padła, zostaje ważna (§5.2).
      return row({
        tone: 'info',
        glyph: 'edit',
        title: `Zlecenie edytowane · ${regTitle}`,
        parts: changeSentence(ctx == null ? [] : fieldChanges(changes, ctx)),
      });
    }

    case 'order_answered': {
      const asked = seatOf(p.seat) ?? seatOf(p.assignedSeat);
      if (p.answer === 'yes') {
        // Zielenią świeci wyłącznie odpowiedź, na którą autor czeka (jak na 32).
        const verdict: InboxPart =
          seatOf(p.assignedSeat) != null ? { text: 'przyjęte - fotel obsadzony', tone: 'ok' } : { text: 'może lecieć', tone: 'ok' };
        return row({
          tone: 'ok',
          glyph: 'person-ok',
          title: `Odpowiedź na zlecenie · ${regTitle}`,
          sub: termSeat(asked),
          parts: withName(name(p.pilotId), [verdict]),
        });
      }
      const reason = str(p.reason);
      return row({
        tone: 'info',
        glyph: 'person-off',
        title: `Odpowiedź na zlecenie · ${regTitle}`,
        sub: termSeat(asked),
        parts: withName(name(p.pilotId), [{ text: reason == null ? 'nie może' : `nie może - ${quote(reason)}` }]),
      });
    }

    case 'order_assigned': {
      // Przydział z grupy albo listy - od tej chwili lot JEST rezerwacją (23F).
      const seat = seatOf(p.seat);
      return row({
        tone: 'ok',
        title: `Lot przydzielony · ${regTitle}`,
        parts: [{ text: seat == null ? 'Lot jest Twoją rezerwacją.' : `${seatLabel(seat)} · lot jest Twoją rezerwacją.` }],
      });
    }

    case 'order_filled':
      // Bez nazwiska osoby, która dostała fotel (pkt 18) - adresat pyta tylko, czy zlecenie
      // jest dla niego aktualne. Nic się nie zepsuło, więc ton neutralny.
      return row({
        tone: 'info',
        glyph: 'stale',
        title: `Zlecenie nieaktualne · ${regTitle}`,
        parts: [{ text: p.reason === 'seat_dropped' ? 'Fotel nie jest już potrzebny.' : 'Fotel jest już obsadzony.' }],
      });

    case 'order_removed': {
      const reason = str(p.reason);
      return row({
        tone: 'info',
        glyph: 'removed',
        title: `Zlecenie nieaktualne · ${regTitle}`,
        parts: [{ text: reason == null ? 'Zlecenie nie jest już do Ciebie.' : `Zlecenie nie jest już do Ciebie - ${quote(reason)}.` }],
      });
    }

    case 'order_withdrawn': {
      // Do autora: fotel znów jest do obsadzenia - coś przepadło, więc bursztyn (25C).
      const reason = str(p.reason);
      return row({
        tone: 'warn',
        glyph: 'resign',
        title: `Rezygnacja z lotu · ${regTitle}`,
        sub: termSeat(seatOf(p.seat)),
        parts: withName(name(p.pilotId), [{ text: reason == null ? 'fotel znów jest do obsadzenia' : quote(reason) }]),
      });
    }

    case 'order_unassigned': {
      const reason = str(p.reason);
      return row({
        tone: 'info',
        glyph: 'unassign',
        title: `Przydział cofnięty · ${regTitle}`,
        sub: termSeat(seatOf(p.seat)),
        parts: [{ text: reason == null ? 'Lot nie jest już Twoją rezerwacją.' : quote(reason) }],
      });
    }

    case 'order_cancelled': {
      // Czerwień, bo zlecenie skasowano, a nie tylko przestało dotyczyć Ciebie. Powód jest
      // TREŚCIĄ wiadomości; bez niego zdanie niesie samo nazwisko (25D).
      const who = name(p.cancelledBy);
      const reason = str(p.reason);
      return row({
        tone: 'no',
        title: `Zlecenie odwołane · ${regTitle}`,
        parts:
          who == null
            ? [{ text: reason == null ? 'Termin się zwolnił.' : quote(reason) }]
            : withName(who, reason == null ? [] : [{ text: quote(reason) }]),
      });
    }

    case 'order_unfilled': {
      // Mówi SKUTEK, a nie instrukcję obsługi: dopisać adresata, zrezygnować z fotela albo
      // odwołać to decyzje na karcie zlecenia, nie skróty w skrzynce (25D).
      const open = Array.isArray(p.openSeats) ? p.openSeats.map(seatOf).filter((s): s is RemoteSeat => s != null) : [];
      const missing =
        open.length >= 2 ? 'Brakuje dowódcy i drugiego pilota' : open.length === 1 ? `Brakuje ${seatGenitive(open[0]!)}` : 'Załoga nie jest kompletna';
      return row({
        tone: 'warn',
        title: `Zlecenie bez kompletu załogi · ${regTitle}`,
        parts: [{ text: `${missing}. Jeśli do początku terminu nikt się nie znajdzie, zlecenie wygaśnie, a termin się zwolni.` }],
      });
    }

    case 'order_expired':
      // Zrobił to zegar, nie człowiek - bez nazwiska i bez koloru (§5.5).
      return row({
        tone: 'info',
        glyph: 'expired',
        title: `Zlecenie wygasło · ${regTitle}`,
        parts: [{ text: 'Do początku terminu nie zebrała się cała załoga - termin się zwolnił.' }],
      });

    case 'order_message': {
      // JEDEN wiersz na rozmowę z licznikiem (§7.3); treścią jest OSTATNIA wiadomość, bo
      // na nią się odpowiada. Licznik świeci, póki wiersz jest nowy.
      const unread = typeof p.unread === 'number' && Number.isFinite(p.unread) ? p.unread : 0;
      const preview = str(p.preview);
      return row({
        tone: 'news',
        glyph: 'message',
        title: `Wiadomość w zleceniu · ${regTitle}`,
        parts: withName(name(p.authorId), preview == null ? [] : [{ text: quote(preview) }]),
        count:
          input.base.isNew && unread > 0
            ? `${unread} ${plural(unread, 'nowa wiadomość', 'nowe wiadomości', 'nowych wiadomości')}`
            : null,
      });
    }

    default:
      return null;
  }
}
