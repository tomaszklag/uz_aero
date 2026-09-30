/**
 * Ninerdeck (serwer) - ZLECENIE NA LOT: słownik wspólny dla reguł zlecenia
 * (4.0.0, issue #245; dokument decyzji `docs/zlecenia.md` §2, §4, §5).
 *
 * ══ ZLECENIE = REZERWACJA, KTÓRA SZUKA ZAŁOGI, PLUS ADRESACI (§2.1) ══
 * Termin trzyma rezerwacja (`bookings.order_id`), a ZAŁOGA żyje w jej `pilot_id`/`dual_id`
 * - zlecenie jej nie powiela. Reguły tego katalogu czytają więc załogę jako fakt
 * przekazany z zewnątrz (`OrderCrew`), a same opisują to, czego rezerwacja nie wie:
 * które fotele szukają, jak je zaadresowano i kto z adresatów może na nie trafić.
 *
 * ══ CZEGO TU NIE MA ══
 * SQL-a, zegara i zdolności. Kto jest prowadzącym (autor albo `reservations.manage`),
 * rozstrzyga komenda; domena dostaje wynik jako fakt. Ta sama granica, co w
 * `domain/approvals.ts`: reguła ma dać się przetestować bez bazy.
 *
 * Reguły mieszkają w osobnych plikach, każdy z jednym pytaniem: `orderSeats.ts` (fotele
 * i komplet załogi), `orderAddressing.ts` (kto dostaje zlecenie), `orderAnswers.ts`
 * (odpowiedź, przydział, cofnięcie, rezygnacja), `orderAudiences.ts` (kogo obudzić).
 */

/** Fotel w samolocie. */
export type Seat = 'pic' | 'dual';

export const SEATS: readonly Seat[] = ['pic', 'dual'];

export function otherSeat(seat: Seat): Seat {
  return seat === 'pic' ? 'dual' : 'pic';
}

/** Stan fotela dowódcy: zajmuje go zlecający albo jest szukany (§4.1). */
export type PicSeatState = 'self' | 'sought';

/**
 * Stan fotela drugiego pilota - dochodzi „brak", wyłącznie gdy maszyna nie wymaga
 * załogi dwuosobowej (§4.1; wymóg sprawdza `refuseSeats`).
 */
export type DualSeatState = 'self' | 'sought' | 'none';

export interface OrderSeats {
  pic: PicSeatState;
  dual: DualSeatState;
}

/** Fotele, których zlecenie szuka - w stałej kolejności: dowódca, drugi pilot. */
export function soughtSeats(seats: OrderSeats): Seat[] {
  return SEATS.filter((seat) => seats[seat] === 'sought');
}

/**
 * Sposób adresowania (§4.2): per fotel (imiennie albo grupą, mieszane per fotel) albo
 * wspólna lista bez foteli, której adresaci potwierdzają TERMIN.
 */
export type OrderAddressing = 'per_seat' | 'shared';

/**
 * Stany zlecenia (§5). `open` i `filled` są ŻYWE - termin trzyma rezerwacja, a zlecenie
 * da się zmieniać. `cancelled` i `expired` są końcowe: termin wrócił do puli.
 */
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'expired';

export function isLive(status: OrderStatus): boolean {
  return status === 'open' || status === 'filled';
}

/** Odpowiedź adresata: „PRZYJMUJĘ"/„MOGĘ LECIEĆ" albo „NIE MOGĘ". */
export type OrderAnswer = 'yes' | 'no';

/**
 * Rodzaje wpisów HISTORII ZMIAN zlecenia (§10.3). Zapis jest historyczny i w bazie nie ma
 * CHECK-a (jak `admin_audit.action`), więc czytelnik musi przeżyć rodzaj, którego nie
 * zna - ta unia mówi, co serwer dziś PISZE, a nie, co wolno przeczytać.
 */
export type OrderChangeKind =
  | 'created'
  | 'edited'
  | 'recipients_added'
  | 'recipients_removed'
  | 'resent'
  | 'assigned'
  | 'unassigned'
  | 'withdrawn'
  | 'cancelled'
  | 'expired';

/**
 * Załoga z rezerwacji: `null` = fotel bez osoby. Przy fotelu „ja" stoi w nim zlecający -
 * to też jest załoga, nie adresat (§6.3).
 */
export interface OrderCrew {
  pic: string | null;
  dual: string | null;
}

/** Fotel, w którym siedzi dana osoba, albo `null`. */
export function crewSeatOf(crew: OrderCrew, pilotId: string): Seat | null {
  if (crew.pic === pilotId) return 'pic';
  if (crew.dual === pilotId) return 'dual';
  return null;
}

/**
 * Zlecenie widziane przez reguły - tyle, ile trzeba, żeby orzec. Stan wersji nie jest tu
 * potrzebny: odpowiedź z poprzedniej wersji komenda podaje jako brak odpowiedzi (§5.1).
 */
export interface OrderView {
  status: OrderStatus;
  addressing: OrderAddressing;
  seats: OrderSeats;
  crew: OrderCrew;
}

/**
 * Adresat widziany przez reguły.
 *
 * `seat: null` znaczy wspólną listę albo TERMIN DO POTWIERDZENIA (osoba z list obu
 * foteli - także wskazana imiennie na jeden i obecna w grupie drugiego, pkt 37).
 * `answer` jest odpowiedzią w BIEŻĄCEJ wersji zlecenia - starsza się nie liczy (§5.1).
 */
export interface RecipientView {
  pilotId: string;
  seat: Seat | null;
  namedSeat: Seat | null;
  direct: boolean;
  removed: boolean;
  answer: OrderAnswer | null;
}

/**
 * Kody odmowy. Surowe (`zasób_czynność`), jak `BookingRefusal` - nazwanie ich po polsku
 * jest sprawą aplikacji i panelu, serwer nie zna języka interfejsu.
 */
export type OrderRefusal =
  /**
   * Żaden fotel nie szuka - to byłaby zwykła rezerwacja (§4.1). Obejmuje też „ja"
   * w obu fotelach: przy dwóch fotelach to ten sam przypadek, więc osobnego kodu nie ma.
   */
  | 'no_seat_sought'
  /** Drugi fotel „brak" na maszynie, która wymaga załogi dwuosobowej. */
  | 'dual_required'
  /** Szukany fotel nie ma ani jednego adresata - nikt by go nie obsadził. */
  | 'no_recipients'
  /** Lista adresatów dla fotela, którego zlecenie nie szuka („ja" albo „brak"). */
  | 'seat_not_sought'
  /** Grupy nie ma w tym klubie (skasowana albo cudza) - jedna odpowiedź na oba przypadki. */
  | 'unknown_group'
  /** Wskazana osoba nie jest aktywnym członkiem klubu - adresatem bywa wyłącznie członek. */
  | 'not_member'
  /** Zlecenie odwołane albo wygasłe - termin wrócił do puli. */
  | 'order_closed'
  /** Osoba nie jest (albo przestała być) adresatem tego zlecenia. */
  | 'not_recipient'
  /** Fotel już obsadzony - drugi przydział naraz przegrywa z pierwszym (§20 Z3). */
  | 'seat_filled'
  /** Przydział wyłącznie spośród ZGŁOSZONYCH - innego pilota nie wpisuje się bez jego „tak" (pkt 12). */
  | 'not_volunteered'
  /** Osoba zaadresowana na DRUGI fotel - fotel wynika z adresowania albo z listy wspólnej. */
  | 'wrong_seat'
  /** Jedna osoba w dwóch fotelach. */
  | 'same_person_both_seats'
  /** Cofnięcie przydziału z fotela, w którym nikt nie siedzi. */
  | 'seat_empty'
  /** Rezygnacja kogoś, kto nie siedzi w szukanym fotelu. */
  | 'not_assigned'
  /** „NIE MOGĘ" od osoby już przydzielonej - od tego jest rezygnacja (§5.3). */
  | 'already_assigned'
  /** Odebranie zlecenia osobie przydzielonej - najpierw cofnięcie przydziału (§5.2). */
  | 'recipient_assigned';
