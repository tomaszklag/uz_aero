/**
 * Ninerdeck - ARKUSZ ADRESATA NA KARCIE PROWADZĄCEGO (4.0.0, epik Z-C #247; makieta 32D;
 * `docs/zlecenia.md` §5.2, §5.3, pkt 14 i 29).
 *
 * Menu ⋯ przy adresacie: jedna osoba, trzy drogi - w KOLEJNOŚCI PYTAŃ PROWADZĄCEGO.
 * Najpierw „napiszę i zapytam" (najczęstsza odpowiedź na „odczytane, bez odpowiedzi"),
 * potem „wezmę kogoś innego", na końcu „odbiorę zlecenie" - najcięższa akcja najniżej.
 *
 * ══ NAGŁÓWEK MÓWI, KIM TA OSOBA JEST W TYM ZLECENIU ══
 * Fotel, sposób adresowania i kod („Dowódca · imiennie · JWR"), a pod spodem to, co
 * zrobiła - ten sam status, co w wierszu, z którego otwarto arkusz.
 *
 * ══ PIERWSZA DROGA ZALEŻY OD TEGO, KTO PATRZY ══
 * Autor zlecenia pisze („Napisz wiadomość"), koordynator prowadzący cudze zlecenie czyta
 * („Rozmowa · do odczytu", 29B) - wątki prowadzi autor (pkt 20). Bez wątku koordynator
 * nie ma tu czego otworzyć, więc wiersza nie ma.
 *
 * ══ OSOBA W FOTELU MA JEDNĄ DROGĘ: „COFNIJ PRZYDZIAŁ" ══
 * Odebrać zlecenia osobie w fotelu wprost się nie da, żeby nie zniknęła z lotu bez śladu:
 * fotel wraca do szukania, drugi fotel i termin zostają, a zgłoszenia pozostałych dalej
 * się liczą (pkt 14). „ZAMIEŃ OSOBĘ" istnieje wyłącznie przy fotelu imiennym - nowa osoba
 * dostaje go imiennie, a jej potwierdzenie dalej go obsadza.
 */

import type { RemoteOrderCard, RemoteSeat } from '../../../application';

import type { CrewSeatVm, LeaderRowVm } from './orderLeaderCard';
import { audienceOf } from './orderLeaderCard';
import type { ChangePart } from './orderChanges';
import { personLabel, seatLabel } from './orderFormat';

/** Skąd otwarto arkusz: blok fotela, wspólna lista albo karta „Załoga". */
export type MenuSource =
  | { kind: 'row'; row: LeaderRowVm; block: RemoteSeat | 'shared' }
  | { kind: 'crew'; crew: CrewSeatVm };

export type MenuAction = { kind: 'remove'; swapSeat: RemoteSeat | null } | { kind: 'unassign'; seat: RemoteSeat };

export interface RecipientMenuVm {
  pilotId: string;
  /** Nazwisko - wersaliki dokłada krój tytułu arkusza. */
  title: string;
  /** „Dowódca · imiennie · JWR". */
  role: string;
  /** „Odczytane 08:15 · bez odpowiedzi". */
  state: string;
  /** Wejście w rozmowę; `null` = nie ma czego otworzyć. */
  thread: { title: string; sub: string; readOnly: boolean } | null;
  action: MenuAction;
  /** Skutek pod akcjami, raz - z nazwiskiem w mianowniku jako podmiotem. */
  note: ChangePart[];
}

export interface RecipientMenuInput {
  card: RemoteOrderCard;
  source: MenuSource;
  /** Kto patrzy - autor pisze, koordynator czyta. */
  viewerId: string;
  nameOf: (pilotId: string) => string | null;
  codeOf: (pilotId: string) => string | null;
}

/** `null` = osoba bez wiersza (fotel „ja" albo szukany - tam menu nie ma). */
export function recipientMenuVm(input: RecipientMenuInput): RecipientMenuVm | null {
  const { card, source } = input;
  const pilotId = source.kind === 'row' ? source.row.pilotId : source.crew.pilotId;
  if (pilotId == null) return null;

  const name = personLabel(pilotId, input.viewerId, input.nameOf);
  const recipient = (card.recipients ?? []).find((r) => r.pilotId === pilotId) ?? null;
  const audience = audienceOf(card.order.audienceLabel);
  const code = input.codeOf(pilotId);

  let seat: string;
  let via: string | null;
  let action: MenuAction;
  let state: string;
  if (source.kind === 'crew') {
    seat = seatLabel(source.crew.seat);
    via = recipient?.direct === true ? 'imiennie' : audience[source.crew.seat] ?? audience.shared;
    action = { kind: 'unassign', seat: source.crew.seat };
    state = source.crew.status.map((p) => p.text).join('');
  } else if (source.block === 'shared') {
    seat = 'Wspólna lista';
    via = audience.shared;
    action = { kind: 'remove', swapSeat: null };
    state = source.row.status.map((p) => p.text).join('');
  } else {
    const named = recipient != null && ((recipient.direct && recipient.seat === source.block) || recipient.namedSeat === source.block);
    seat = seatLabel(source.block);
    via = named ? 'imiennie' : audience[source.block];
    action = { kind: 'remove', swapSeat: named ? source.block : null };
    state = source.row.status.map((p) => p.text).join('');
  }

  const author = card.order.createdBy === input.viewerId;
  const thread =
    recipient == null
      ? null
      : author
        ? { title: 'Napisz wiadomość', sub: `Rozmowa · ${name}`, readOnly: false }
        : recipient.threadId != null
          ? { title: `Rozmowa · ${name}`, sub: 'do odczytu', readOnly: true }
          : null;

  return {
    pilotId,
    title: name,
    role: [seat, via, code].filter((p): p is string => p != null && p !== '').join(' · '),
    state,
    thread,
    action,
    note: noteOf(name, action),
  };
}

function noteOf(name: string, action: MenuAction): ChangePart[] {
  if (action.kind === 'unassign') {
    return [
      { text: name, strong: true },
      { text: ' dostanie wiadomość, że przydział cofnięto - fotel wróci do szukania, a zgłoszenia pozostałych dalej się liczą.' },
    ];
  }
  const when = action.swapSeat == null ? '' : ' - przy zamianie i przy odebraniu';
  return [
    { text: name, strong: true },
    { text: ` dostanie wiadomość, że zlecenie jest nieaktualne${when}. Rozmowa zostaje do odczytu.` },
  ];
}
