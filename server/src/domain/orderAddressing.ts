/**
 * Ninerdeck (serwer) - ADRESOWANIE ZLECENIA: kto dostaje zlecenie i na jakich zasadach
 * (4.0.0, issue #245; `docs/zlecenia.md` §4.2, §4.3, §6.2).
 *
 * ══ ADRESOWANIE ROZWIJA SIĘ W OSOBY PRZY WYSŁANIU (§6.2) ══
 * Grupa jest skrótem przy wybieraniu, a nie adresatem: serwer zapisuje każdą osobę osobno,
 * więc ktoś dopisany do grupy JUTRO nie dostaje zlecenia wysłanego DZIŚ - dopóki
 * prowadzący nie użyje „Wyślij ponownie", które rozwija grupy od nowa (pkt 41). Dlatego
 * zlecenie trzyma też DEFINICJĘ adresowania (`OrderAudience`): bez niej nie byłoby czego
 * rozwinąć drugi raz.
 *
 * ══ TRZY SPOSOBY, JEDNA FUNKCJA ══
 *  1. imiennie na fotel - jedyna osoba fotela; jej „tak" obsadza fotel od razu (`direct`);
 *  2. grupa albo kilka osób na fotel - „tak" jest ZGŁOSZENIEM, fotel wybiera prowadzący;
 *  3. wspólna lista - jedna lista dla wszystkich szukanych foteli, „tak" potwierdza TERMIN.
 * Osoba z list OBU foteli - dwie grupy się pokrywają albo wskazano ją imiennie na jeden
 * fotel, a jest też w grupie drugiego (pkt 30, 37) - dostaje TERMIN DO POTWIERDZENIA:
 * fotel pusty, a wskazanie imienne zostaje w `namedSeat` i traci moc obsadzania.
 *
 * ══ KTO NIE DOSTAJE ZLECENIA ══
 * Zlecający (nawet obecny w grupie) i członek NIEAKTYWNY - wyłączony zostaje na liście
 * grupy, ale zleceń nie dostaje (§6.1). Osoba wskazana IMIENNIE, która nie jest aktywnym
 * członkiem, to odmowa: zlecający wybrał konkretnego człowieka, a cicha zamiana na „nikt"
 * zostawiłaby fotel bez adresata, o czym nikt by się nie dowiedział.
 */

import {
  otherSeat,
  soughtSeats,
  type OrderRefusal,
  type OrderSeats,
  type Seat,
} from './orders.ts';

/** Lista adresatów jednego fotela albo wspólnej listy: osoby wskazane imiennie i grupy. */
export interface AddressList {
  pilotIds: readonly string[];
  groupIds: readonly string[];
}

/**
 * DEFINICJA adresowania - to, co wybrał zlecający, zanim grupy rozwinęły się w osoby.
 * Zapisana przy zleceniu, bo „Wyślij ponownie" rozwija grupy od nowa (pkt 41).
 */
export type OrderAudience =
  | { kind: 'per_seat'; pic: AddressList | null; dual: AddressList | null }
  | { kind: 'shared'; list: AddressList };

/** Adresat po rozwinięciu - wiersz `order_recipients` bez stanu odpowiedzi. */
export interface PlannedRecipient {
  pilotId: string;
  /** `null` = wspólna lista albo termin do potwierdzenia. */
  seat: Seat | null;
  /** Fotel wskazania imiennego przy terminie do potwierdzenia (pkt 37, 38). */
  namedSeat: Seat | null;
  /** Jedyny adresat fotela, wskazany imiennie: jego „tak" obsadza fotel (§4.3). */
  direct: boolean;
  /** Grupa, przez którą trafił; `null` = wskazany imiennie. */
  viaGroupId: string | null;
}

export interface ExpansionContext {
  authorId: string;
  /** Członkowie grup KLUBU. Brak klucza = grupy nie ma w tym klubie. */
  groupMembers: ReadonlyMap<string, readonly string[]>;
  /** Czy osoba ma dziś AKTYWNE członkostwo w klubie. */
  isActiveMember: (pilotId: string) => boolean;
  /**
   * Osoby, którym zlecenie ODEBRANO (pkt 29): nie wracają przy ponownym rozwinięciu
   * i nie liczą się do „jedynego adresata fotela".
   */
  removed?: ReadonlySet<string>;
}

/** Skąd osoba trafiła na listę jednego fotela (albo listy wspólnej). */
interface Source {
  named: boolean;
  viaGroupId: string | null;
}

/**
 * Rozwinięcie definicji w osoby - lista adresatów albo odmowa.
 *
 * Kolejność wyniku jest stała (fotel dowódcy przed drugim, osoby wskazane przed grupami,
 * grupy w kolejności wybrania): ta sama definicja daje zawsze tę samą listę, więc
 * ponowne rozwinięcie porównuje się z zapisem bez sortowania po stronie wołającego.
 */
export function expandRecipients(
  seats: OrderSeats,
  audience: OrderAudience,
  ctx: ExpansionContext,
): PlannedRecipient[] | OrderRefusal {
  const sought = soughtSeats(seats);

  if (audience.kind === 'shared') {
    const list = collect(audience.list, ctx);
    if (typeof list === 'string') return list;
    if (list.size === 0) return 'no_recipients';
    return [...list].map(([pilotId, source]) => ({
      pilotId,
      seat: null,
      namedSeat: null,
      direct: false,
      viaGroupId: source.named ? null : source.viaGroupId,
    }));
  }

  // Lista dla fotela, którego zlecenie nie szuka, to niezgodność formularza - cicha
  // zamiana na „nikt" zostawiłaby zlecającego w przekonaniu, że ktoś dostał zlecenie.
  for (const seat of ['pic', 'dual'] as const) {
    const list = audience[seat];
    if (list != null && !sought.includes(seat) && !isEmpty(list)) return 'seat_not_sought';
  }

  const perSeat = new Map<Seat, Map<string, Source>>();
  for (const seat of sought) {
    const list = audience[seat];
    const collected = list == null ? new Map<string, Source>() : collect(list, ctx);
    if (typeof collected === 'string') return collected;
    if (collected.size === 0) return 'no_recipients';
    perSeat.set(seat, collected);
  }

  const result: PlannedRecipient[] = [];
  const seen = new Set<string>();
  for (const seat of sought) {
    for (const [pilotId, source] of perSeat.get(seat)!) {
      if (seen.has(pilotId)) continue;
      seen.add(pilotId);
      const other = perSeat.get(otherSeat(seat))?.get(pilotId);
      if (other != null) {
        // TERMIN DO POTWIERDZENIA: osoba stoi na listach OBU foteli. Wskazanie imienne
        // zapamiętujemy tylko wtedy, gdy padło na DOKŁADNIE jeden fotel - przy obu
        // imiennych blok imienny na karcie prowadzącego nie miałby którego wskazać.
        const namedSeat = source.named === other.named ? null : source.named ? seat : otherSeat(seat);
        result.push({
          pilotId,
          seat: null,
          namedSeat,
          direct: false,
          viaGroupId: source.viaGroupId ?? other.viaGroupId,
        });
        continue;
      }
      const candidates = perSeat.get(seat)!;
      result.push({
        pilotId,
        seat,
        namedSeat: null,
        // „Imiennie na fotel" = JEDYNY adresat tego fotela i wskazany imiennie. Grupa
        // z jedną osobą nie jest wskazaniem imiennym: zlecający wybrał grupę, więc to
        // jest zgłoszenie, a fotel wybiera on (§4.3).
        direct: source.named && candidates.size === 1,
        viaGroupId: source.named ? null : source.viaGroupId,
      });
    }
  }
  return result;
}

/**
 * Osoby z jednej listy, bez zlecającego, bez nieaktywnych członków grup i bez osób,
 * którym odebrano zlecenie. Pierwsze źródło wygrywa, ale wskazanie imienne zawsze
 * nadpisuje grupę: „Jan imiennie i w grupie Instruktorzy" jest wskazaniem imiennym.
 */
function collect(list: AddressList, ctx: ExpansionContext): Map<string, Source> | OrderRefusal {
  const out = new Map<string, Source>();
  const skip = (pilotId: string): boolean =>
    pilotId === ctx.authorId || (ctx.removed?.has(pilotId) ?? false);

  for (const pilotId of list.pilotIds) {
    if (skip(pilotId)) continue;
    if (!ctx.isActiveMember(pilotId)) return 'not_member';
    const known = out.get(pilotId);
    out.set(pilotId, { named: true, viaGroupId: known?.viaGroupId ?? null });
  }
  for (const groupId of list.groupIds) {
    const members = ctx.groupMembers.get(groupId);
    if (members == null) return 'unknown_group';
    for (const pilotId of members) {
      if (skip(pilotId) || !ctx.isActiveMember(pilotId)) continue;
      const known = out.get(pilotId);
      if (known == null) out.set(pilotId, { named: false, viaGroupId: groupId });
      else if (known.viaGroupId == null) out.set(pilotId, { ...known, viaGroupId: groupId });
    }
  }
  return out;
}

function isEmpty(list: AddressList): boolean {
  return list.pilotIds.length === 0 && list.groupIds.length === 0;
}

/**
 * Definicja po DOPISANIU adresatów (§5.2): osoby i grupy dochodzą do listy fotela albo
 * do listy wspólnej, bez powtórzeń. Odebrania nie ma tu z definicji - odebranie
 * zlecenia to stempel na wierszu adresata (pkt 29), a definicja zostaje, żeby
 * „Wyślij ponownie" nie przywracało osoby, której zlecenie odebrano (`removed`).
 */
export function withAddedRecipients(
  audience: OrderAudience,
  added: { seat: Seat | null; list: AddressList },
): OrderAudience {
  const merge = (base: AddressList | null, extra: AddressList): AddressList => ({
    pilotIds: unique([...(base?.pilotIds ?? []), ...extra.pilotIds]),
    groupIds: unique([...(base?.groupIds ?? []), ...extra.groupIds]),
  });
  if (audience.kind === 'shared') return { kind: 'shared', list: merge(audience.list, added.list) };
  if (added.seat == null) return audience;
  return { ...audience, [added.seat]: merge(audience[added.seat], added.list) };
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Etykieta dla prowadzących: „dowódca: Instruktorzy · drugi pilot: Anna Nowak" albo
 * „wspólna lista: Piloci An-2, Anna Nowak". Składana PRZY ZAPISIE, bo grupa bywa potem
 * przemianowana albo skasowana, a etykieta ma mówić, do kogo zlecenie poszło (§10.2).
 */
export function audienceLabel(
  seats: OrderSeats,
  audience: OrderAudience,
  names: { person: (pilotId: string) => string; group: (groupId: string) => string },
): string {
  const describe = (list: AddressList | null): string =>
    list == null
      ? ''
      : [...list.groupIds.map(names.group), ...list.pilotIds.map(names.person)].join(', ');
  if (audience.kind === 'shared') return `wspólna lista: ${describe(audience.list)}`;
  const label: Record<Seat, string> = { pic: 'dowódca', dual: 'drugi pilot' };
  return soughtSeats(seats)
    .map((seat) => `${label[seat]}: ${describe(audience[seat])}`)
    .join(' · ');
}
