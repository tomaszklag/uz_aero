/**
 * Ninerdeck - SUGESTIE SLOTÓW („jak w kinie", milestone 3.0.0, `docs/rezerwacje.md` §7).
 *
 * Zdanie ze zgłoszenia: „należy wprowadzić sugestie na sloty tak jak w kinie, aby nie
 * pozostawały wolne miejsca w czasie, tylko możliwie jak najwięcej zajętego dnia".
 * Cała reguła w jednym obrazie: **sadzamy przy zajętych miejscach, nie na środku pustego
 * rzędu** - slot przylegający do cudzej rezerwacji zostawia jedną dziurę zamiast dwóch.
 *
 * ══ FUNKCJA NIE WIE, SKĄD SIĘ WZIĘŁY GRANICE DNIA ══
 * Okno doby lotnej przychodzi ARGUMENTEM (`dayWindow.ts` składa je z efemeryd i progów).
 * Ta sama granica, co przy kopercie śladu, która niesie samą geometrię: gdy przyjdą loty
 * nocne, zmienia się tamta funkcja, a upakowanie dnia zostaje nietknięte.
 *
 * ══ SUGESTIA NIGDY NIE JEST PRZYMUSEM ══
 * Pilot może wpisać dowolny wolny slot. Pusta lista kandydatów NIE JEST błędem - dzień
 * bywa pełny, i to jest odpowiedź, a nie awaria.
 *
 * Funkcja jest czysta i liczy się po OBU stronach: na telefonie z cache'owanych zajętości
 * (czyli offline) i na serwerze w `GET /bookings/suggestions`. Jeden kod, więc odpowiedzi
 * nie mają jak się rozjechać.
 */

import {
  MAX_SLOT_SUGGESTIONS,
  MIN_USEFUL_SLOT_MS,
  SLOT_ADJACENCY_BONUS,
  SLOT_GRAIN_MS,
  SLOT_PREFERRED_BONUS,
  SLOT_REMNANT_PENALTY,
} from './policy';

/** Zajętość maszyny - rezerwacja pilota albo wyłączenie z użytku; tu nie ma różnicy. */
export interface BusySpan {
  startsAt: number;
  endsAt: number;
}

export interface SlotQuery {
  /** Okno doby lotnej - poza nim nie proponujemy niczego. */
  window: { from: number; to: number };
  /** Zajętości TEJ maszyny. Kolejność i nakładanie się bez znaczenia - scalamy je sami. */
  busy: readonly BusySpan[];
  /** Żądana długość slotu w milisekundach. */
  duration: number;
  /** Pora dnia, o którą pilot prosił; `null` = nie podał i wtedy premii nie ma. */
  preferredAt?: number | null;
  /** Chwila bieżąca - slotu, który już się zaczął, nie proponujemy. */
  now?: number | null;
}

/**
 * Dlaczego ten slot. Ekran ma umieć napisać powód, a nie tylko pokazać godzinę -
 * inaczej sugestia wygląda na wyrocznię.
 */
export type SlotReason =
  /** Wypełnia dziurę CAŁĄ - nie zostawia po sobie nic. */
  | 'fills-gap'
  /** Przylega do zajętości z obu stron. */
  | 'between-bookings'
  /** Przylega do zajętości z jednej strony. */
  | 'next-to-booking'
  /** Stoi w wolnym dniu i niczego nie dotyka. */
  | 'open-day';

export interface SlotSuggestion {
  startsAt: number;
  endsAt: number;
  /** Im wyżej, tym lepiej upakowany dzień. Do porównań, nie do pokazania pilotowi. */
  score: number;
  reason: SlotReason;
  /** Ile zostaje po bokach - `0` znaczy „przylega". */
  gapBeforeMs: number;
  gapAfterMs: number;
}

/**
 * Kandydaci posortowani oceną upakowania, bez nakładania się na siebie.
 *
 * ══ KANDYDACI NIE NAKŁADAJĄ SIĘ NAWZAJEM I TO JEST WŁASNOŚĆ, NIE OPTYMALIZACJA ══
 * Bez tego pusty dzień oddawałby cztery propozycje odległe o kwadrans - czyli jedną
 * propozycję powiedzianą cztery razy. Pilot ma dostać WYBÓR, a nie listę zaokrągleń.
 */
export function suggestSlots(query: SlotQuery): SlotSuggestion[] {
  const { duration } = query;
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const from = Math.max(query.window.from, query.now ?? -Infinity);
  const to = query.window.to;
  if (!(to - from >= duration)) return [];

  const busy = mergeBusy(query.busy, from, to);
  const gaps = freeGaps(busy, from, to).filter((gap) => gap.to - gap.from >= duration);

  const scored = gaps
    .flatMap((gap) => candidatesIn(gap, duration))
    .map((slot) => score(slot, query.preferredAt ?? null));

  scored.sort((a, b) => b.score - a.score || a.startsAt - b.startsAt);

  // Zachłanny wybór: bierzemy najlepszego, odrzucamy wszystko, co go dotyka, i dalej.
  const picked: SlotSuggestion[] = [];
  for (const slot of scored) {
    if (picked.length >= MAX_SLOT_SUGGESTIONS) break;
    if (picked.some((p) => slot.startsAt < p.endsAt && slot.endsAt > p.startsAt)) continue;
    picked.push(slot);
  }
  return picked;
}

/**
 * WOLNE PASMA maszyny w oknie - zajętości scalone i odwrócone.
 *
 * Ta sama odpowiedź, z której `suggestSlots` wybiera kandydatów, tylko oddana wprost:
 * karta samolotu przy zakładaniu rezerwacji pisze z niej „wolne: 06:00-13:00 ·
 * 16:00-21:00". Bez tego ekran scalałby zajętości sam i miałby własną definicję
 * słowa „wolne" - a dwie definicje rozjeżdżają się przy pierwszej poprawce.
 *
 * Pasma krótsze niż cokolwiek sensownego NIE są tu odsiewane: to jest opis okna,
 * a nie propozycja terminu. Odsiewa wołający, jeśli chce - próg zależy od tego, na co
 * patrzy (kwadrans między lotami bywa treścią, a nie szumem).
 */
export function freeSpans(
  window: { from: number; to: number },
  busy: readonly BusySpan[],
): BusySpan[] {
  return freeGaps(mergeBusy(busy, window.from, window.to), window.from, window.to).map(
    (gap) => ({ startsAt: gap.from, endsAt: gap.to }),
  );
}

/** Zajętości scalone i przycięte do okna - nakładki i zetknięcia znikają. */
function mergeBusy(busy: readonly BusySpan[], from: number, to: number): BusySpan[] {
  const clipped = busy
    .filter((b) => Number.isFinite(b.startsAt) && Number.isFinite(b.endsAt) && b.endsAt > b.startsAt)
    .map((b) => ({ startsAt: Math.max(b.startsAt, from), endsAt: Math.min(b.endsAt, to) }))
    .filter((b) => b.endsAt > b.startsAt)
    .sort((a, b) => a.startsAt - b.startsAt);

  const out: BusySpan[] = [];
  for (const span of clipped) {
    const last = out[out.length - 1];
    if (last != null && span.startsAt <= last.endsAt) {
      last.endsAt = Math.max(last.endsAt, span.endsAt);
    } else {
      out.push({ ...span });
    }
  }
  return out;
}

interface Gap {
  from: number;
  to: number;
  /** Czy do krawędzi dziury przylega ZAJĘTOŚĆ (a nie granica dnia). */
  busyBefore: boolean;
  busyAfter: boolean;
}

function freeGaps(busy: readonly BusySpan[], from: number, to: number): Gap[] {
  const gaps: Gap[] = [];
  let cursor = from;
  for (const span of busy) {
    if (span.startsAt > cursor) {
      gaps.push({ from: cursor, to: span.startsAt, busyBefore: cursor !== from, busyAfter: true });
    }
    cursor = Math.max(cursor, span.endsAt);
  }
  if (cursor < to) gaps.push({ from: cursor, to, busyBefore: cursor !== from, busyAfter: false });
  return gaps;
}

interface Candidate {
  startsAt: number;
  endsAt: number;
  gap: Gap;
}

/**
 * Kandydaci w jednej dziurze: przyklejony do LEWEJ krawędzi, przyklejony do PRAWEJ
 * i siatka co ziarno pomiędzy.
 *
 * Oba przyklejone wchodzą JAWNIE, bo ziarno nie musi w nie trafić: rezerwacja kończąca
 * się o 10:07 daje przyleganie o 10:07, a siatka liczona co kwadrans by je minęła -
 * czyli zgubiłaby dokładnie ten slot, o który w całej regule chodzi.
 */
function candidatesIn(gap: Gap, duration: number): Candidate[] {
  const latest = gap.to - duration;
  const starts = new Set<number>([gap.from, latest]);
  for (let t = gap.from + SLOT_GRAIN_MS; t < latest; t += SLOT_GRAIN_MS) starts.add(t);

  return [...starts]
    .filter((startsAt) => startsAt >= gap.from && startsAt <= latest)
    .sort((a, b) => a - b)
    .map((startsAt) => ({ startsAt, endsAt: startsAt + duration, gap }));
}

/**
 * Ocena upakowania: premia za przyleganie do ZAJĘTOŚCI, kara za każdą resztkę zbyt
 * krótką, żeby cokolwiek w niej poleciało, premia za bliskość pory dnia.
 *
 * Granica dnia NIE liczy się jako przyleganie: świt i zmrok są ścianą, nie sąsiadem,
 * a premiowanie ich kazałoby proponować lot o pierwszej możliwej minucie po wschodzie.
 */
function score(candidate: Candidate, preferredAt: number | null): SlotSuggestion {
  const gapBeforeMs = candidate.startsAt - candidate.gap.from;
  const gapAfterMs = candidate.gap.to - candidate.endsAt;

  const touchesBefore = gapBeforeMs === 0 && candidate.gap.busyBefore;
  const touchesAfter = gapAfterMs === 0 && candidate.gap.busyAfter;

  let value = 0;
  if (touchesBefore) value += SLOT_ADJACENCY_BONUS;
  if (touchesAfter) value += SLOT_ADJACENCY_BONUS;

  // Resztka ZEROWA nie jest resztką - to znaczy, że slot przylega. Karzemy wyłącznie
  // kawałki na tyle krótkie, że nic sensownego w nich nie poleci.
  if (deadRemnant(gapBeforeMs)) value -= SLOT_REMNANT_PENALTY;
  if (deadRemnant(gapAfterMs)) value -= SLOT_REMNANT_PENALTY;

  if (preferredAt != null && Number.isFinite(preferredAt)) {
    // Premia maleje liniowo z odległością i gaśnie po dwóch godzinach - dalej pora dnia
    // przestaje cokolwiek znaczyć, a przy pełnym dniu niosłaby wybór w losowe miejsce.
    const distance = Math.abs(candidate.startsAt - preferredAt);
    const reach = 2 * 3_600_000;
    if (distance < reach) value += SLOT_PREFERRED_BONUS * (1 - distance / reach);
  }

  return {
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    score: value,
    reason: reasonOf(touchesBefore, touchesAfter, gapBeforeMs + gapAfterMs === 0),
    gapBeforeMs,
    gapAfterMs,
  };
}

const deadRemnant = (ms: number): boolean => ms > 0 && ms < MIN_USEFUL_SLOT_MS;

function reasonOf(before: boolean, after: boolean, exact: boolean): SlotReason {
  // `fills-gap` wymaga SĄSIADA: slot zajmujący całe okno pustego dnia niczego nie wypełnia,
  // tylko w tym dniu stoi - i ekran ma powiedzieć właśnie to.
  if (exact && (before || after)) return 'fills-gap';
  if (before && after) return 'between-bookings';
  if (before || after) return 'next-to-booking';
  return 'open-day';
}
