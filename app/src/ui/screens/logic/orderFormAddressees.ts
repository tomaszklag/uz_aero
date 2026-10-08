/**
 * Ninerdeck - ARKUSZ ADRESATÓW W FORMULARZU ZLECENIA (4.0.0, epik Z-C #247; makieta 31C;
 * `docs/zlecenia.md` §6, pkt 37, 39).
 *
 * Dwa kształty jednego arkusza:
 *  - „Osoba · imiennie" - sama lista osób, wybór POJEDYNCZY (ten sam kształt, co „ZAMIEŃ
 *    OSOBĘ" na karcie prowadzącego, `orderAddressees.ts`);
 *  - „Grupa · lub kilka osób" i wspólna lista - grupy klubu NAD osobami, wybór wielokrotny.
 *
 * ══ OSOBA Z ZAZNACZONEJ GRUPY JEST ZAZNACZONA, ALE NIE DO ODZNACZENIA ══
 * Grupa jest wybierana w CAŁOŚCI i rozwija się w osoby dopiero przy wysłaniu (§6.2), więc
 * jej członka nie da się odznaczyć pojedynczo. Wiersz zostaje na liście mimo to - odpowiada
 * na pytanie „do kogo to NAPRAWDĘ pójdzie", a licznik w „GOTOWE" liczy dokładnie te osoby.
 *
 * ══ CZEGO NA LIŚCIE NIE MA ══
 * Zlecającego (nie jest adresatem nawet przez grupę) i członków nieaktywnych (nie dostają
 * zleceń, §6.1). Licznik grupy mówi o osobach, do których zlecenie NAPRAWDĘ trafi - bez
 * Ciebie i bez wyłączonych.
 *
 * ══ PODPIS MÓWI SKUTEK PRZED ZAZNACZENIEM (pkt 39) ══
 * Osoba z listy DRUGIEGO fotela zostaje do wyboru - zaznaczona trafi na listy obu foteli
 * i dostanie termin do potwierdzenia (pkt 37). Bez formy z płcią: „imiennie na dowódcę".
 */

import { foldPolish } from '../../../domain';
import type { RemoteAddressList, RemoteMemberGroup, RemoteSeat } from '../../../application';

import type { AddresseeOption, Member } from './orderAddressees';
import { peopleCount, unionLists, type AddressMode } from './orderForm';
import { seatAccusative, seatGenitive } from './orderFormat';
import { bySurname, comparePolish } from './polishOrder';

const CONFIRM = 'po zaznaczeniu termin do potwierdzenia';

/** Drugi szukany fotel - z niego biorą się podpisy „termin do potwierdzenia". */
export interface OtherSeat {
  seat: RemoteSeat;
  mode: AddressMode;
  /** Osoba wskazana imiennie (tryb „Osoba"). */
  person: string | null;
  /** Osoby jego listy po rozwinięciu grup; `null` = grup nie wczytano. */
  people: ReadonlySet<string> | null;
}

export interface GroupOptionVm {
  id: string;
  name: string;
  /** „5 osób" - aktywni członkowie bez Ciebie. */
  sub: string;
  on: boolean;
}

export interface PersonOptionVm {
  pilotId: string;
  name: string;
  code: string | null;
  /** `inherit` = zaznaczona przez grupę - przygaszona i nie do odznaczenia. */
  state: 'on' | 'off' | 'inherit';
  sub: string | null;
}

export interface MultiSheetVm {
  groups: GroupOptionVm[];
  persons: PersonOptionVm[];
  /** Liczba osób w „GOTOWE · N". */
  total: number;
}

interface Common {
  members: readonly Member[];
  me: string;
  other: OtherSeat | null;
}

const isCandidate = (m: Member, me: string): boolean => m.active && m.id !== me;

function otherSub(other: OtherSeat | null, pilotId: string): string | null {
  if (other == null) return null;
  if (other.mode === 'person') {
    return other.person === pilotId ? `imiennie na ${seatAccusative(other.seat)} · ${CONFIRM}` : null;
  }
  return other.people?.has(pilotId) === true ? `na liście ${seatGenitive(other.seat)} · ${CONFIRM}` : null;
}

/** Arkusz trybu „Osoba": sama lista osób, wybór pojedynczy. */
export function personOptions(input: Common): AddresseeOption[] {
  return input.members
    .filter((m) => isCandidate(m, input.me))
    .sort((a, b) => bySurname(a.name, b.name))
    .map((m) => ({ pilotId: m.id, name: m.name, code: m.code, sub: otherSub(input.other, m.id) }));
}

/** Arkusz trybu „Grupa" i wspólnej listy: grupy nad osobami, wybór wielokrotny. */
export function multiSheetVm(
  input: Common & {
    /** Wybór w toku - kopia, którą „ANULUJ" porzuca. */
    selection: RemoteAddressList;
    groups: readonly RemoteMemberGroup[];
    /**
     * Osoby, które zlecenie JUŻ mają (edycja): nie stoją na liście i nie liczą się do
     * „GOTOWE · N" - dopisanie wyśle zlecenie wyłącznie nowym (§5.2).
     */
    exclude?: ReadonlySet<string>;
  },
): MultiSheetVm {
  const active = new Set(input.members.filter((m) => isCandidate(m, input.me)).map((m) => m.id));
  const listed = (id: string): boolean => active.has(id) && input.exclude?.has(id) !== true;
  const membersOf = (group: RemoteMemberGroup): string[] => group.memberIds.filter((id) => active.has(id));

  const groups = [...input.groups]
    .sort((a, b) => comparePolish(a.name, b.name))
    .map((g) => ({ id: g.id, name: g.name, sub: peopleCount(membersOf(g).length), on: input.selection.groupIds.includes(g.id) }));

  // Pierwsza zaznaczona grupa w kolejności wyboru - ta, którą podpis wymienia.
  const inheritedFrom = new Map<string, string>();
  for (const id of input.selection.groupIds) {
    const group = input.groups.find((g) => g.id === id);
    if (group == null) continue;
    for (const pilotId of membersOf(group)) if (!inheritedFrom.has(pilotId)) inheritedFrom.set(pilotId, group.name);
  }

  const persons: PersonOptionVm[] = input.members
    .filter((m) => listed(m.id))
    .sort((a, b) => bySurname(a.name, b.name))
    .map((m) => {
      const via = inheritedFrom.get(m.id);
      if (via != null) return { pilotId: m.id, name: m.name, code: m.code, state: 'inherit', sub: `z grupy ${via}` };
      return {
        pilotId: m.id,
        name: m.name,
        code: m.code,
        state: input.selection.pilotIds.includes(m.id) ? 'on' : 'off',
        sub: otherSub(input.other, m.id),
      };
    });

  const total = new Set([
    ...input.selection.pilotIds.filter(listed),
    ...[...inheritedFrom.keys()].filter(listed),
  ]).size;

  return { groups, persons, total };
}

/** Zaznaczenie albo odznaczenie pozycji w wyborze w toku. */
export function toggled(
  selection: RemoteAddressList,
  entry: { kind: 'person' | 'group'; id: string },
): RemoteAddressList {
  const key = entry.kind === 'person' ? 'pilotIds' : 'groupIds';
  const has = selection[key].includes(entry.id);
  const next = has ? selection[key].filter((id) => id !== entry.id) : [...selection[key], entry.id];
  return unionLists({ ...selection, [key]: next });
}

/**
 * Wyszukiwarka arkusza - filtr OBU sekcji naraz: nazwa grupy, imię, nazwisko albo kod od
 * początku dowolnego wyrazu, bez wielkości liter i bez ogonków. Pusty wpis oddaje całość.
 */
export function filterSheet(vm: MultiSheetVm, query: string): MultiSheetVm {
  const needle = foldPolish(query.trim());
  if (needle === '') return vm;
  const matches = (text: string): boolean =>
    foldPolish(text).split(/\s+/).some((word) => word.startsWith(needle)) || foldPolish(text).startsWith(needle);
  return {
    ...vm,
    groups: vm.groups.filter((g) => matches(g.name)),
    persons: vm.persons.filter((p) => matches(p.name) || foldPolish(p.code ?? '').startsWith(needle)),
  };
}
