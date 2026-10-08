/**
 * Ninerdeck - testy BANERA W APLIKACJI (`ui/screens/logic/inAppBanner.ts`; 4.0.0,
 * `docs/kanal-klubu.md` K5, makieta 25E; epik KK-C #246).
 *
 * Pod obserwacją dwie rzeczy, które ekran ma dostać gotowe:
 *  - CZY baner staje: nie w kokpicie, nie przy aplikacji w tle, nie na ekranie rzeczy,
 *    której dotyczy (karta rezerwacji, decyzja o niej, karta maszyny, otwarta skrzynka);
 *    wiadomość z innego klubu - zawsze poza kokpitem;
 *  - CO mówi: ramka - zdaniem wiersza skrzynki słowo w słowo, bez plakietki sprawy
 *    i z „teraz"; push - tytułem pusha (ze znakiem maszyny z pamięci floty), z nazwą
 *    klubu nad tytułem i zdaniem o przełączeniu, gdy przyszedł z innego klubu.
 */

import type { RemoteNotification } from '../application';
import type { ScreenRoute } from '../ui/navigation/activeRoute';
import {
  bannerFits,
  FOREIGN_CLUB_HINT,
  inAppBanner,
  NOW_LABEL,
  type BannerContext,
  type BannerSource,
} from '../ui/screens/logic/inAppBanner';
import { inboxRows } from '../ui/screens/logic/inbox';

const NOW = Date.UTC(2026, 9, 2, 5, 31);
const ACTIVE = 'org-zg';
const OTHER = 'org-kr';

const DAY = { date: '2026-10-03', startsAt: '2026-10-02T22:00:00Z', endsAt: '2026-10-03T22:00:00Z' };

function note(over: Partial<RemoteNotification> = {}): RemoteNotification {
  return {
    id: 'n1',
    kind: 'approval_requested',
    payload: {
      bookingId: 'b1',
      aircraftId: 'a1',
      pilotId: 'p-jwr',
      startsAt: '2026-10-03T07:00:00Z',
      endsAt: '2026-10-03T09:00:00Z',
    },
    createdAt: new Date(NOW - 5_000).toISOString(),
    readAt: null,
    day: DAY,
    ...over,
  };
}

const REGS: Record<string, string> = { a1: 'SP-AXA', a9: 'SP-KLM' };

function ctx(over: Partial<BannerContext> = {}): BannerContext {
  return {
    activeOrgId: ACTIVE,
    foreground: true,
    holdsAircraft: false,
    route: { name: 'Dashboard' },
    now: NOW,
    regOf: (id) => REGS[id] ?? null,
    nameOf: (id) => (id === 'p-jwr' ? 'Jan Wróbel' : null),
    clubNameOf: (id) => (id === OTHER ? 'Aeroklub Krakowski' : id === ACTIVE ? 'Aeroklub Zielonogórski' : null),
    ...over,
  };
}

const frame = (item: RemoteNotification = note(), quiet = false): BannerSource => ({ kind: 'frame', item, quiet });

const push = (data: Record<string, unknown>, title = 'Prośba o zgodę', body: string | null = null): BannerSource => ({
  kind: 'push',
  id: 'push-1',
  title,
  body,
  data,
});

const at = (name: string, params?: Record<string, unknown>): ScreenRoute => ({ name, params });

describe('baner z ramki kanału', () => {
  it('mówi zdaniem wiersza skrzynki słowo w słowo - bez plakietki sprawy, z „teraz"', () => {
    const banner = inAppBanner(frame(), ctx());
    const row = inboxRows({
      items: [note()],
      todoIds: new Set(['b1']),
      now: NOW,
      regOf: (id) => REGS[id] ?? null,
      nameOf: (id) => (id === 'p-jwr' ? 'Jan Wróbel' : null),
    })[0]!;

    expect(banner).not.toBeNull();
    expect(banner!.row.title).toBe(row.title);
    expect(banner!.row.sub).toBe(row.sub);
    expect(banner!.row.reason).toBe(row.reason);
    expect(banner!.row.tone).toBe(row.tone);
    expect(banner!.row.todo).toBe(false);
    expect(banner!.row.when).toBe(NOW_LABEL);
    expect(banner!.club).toBeNull();
  });

  it('tapnięcie prowadzi tam, gdzie tapnięcie w push tego rodzaju', () => {
    expect(inAppBanner(frame(), ctx())!.target).toEqual({ screen: 'Decision', params: { bookingId: 'b1' } });
    expect(inAppBanner(frame(note({ kind: 'booking_rejected' })), ctx())!.target).toEqual({
      screen: 'BookingDetails',
      params: { bookingId: 'b1' },
    });
    expect(
      inAppBanner(frame(note({ kind: 'aircraft_engine_started', payload: { aircraftId: 'a1' } })), ctx())!.target,
    ).toEqual({ screen: 'Aircraft', params: { aircraftId: 'a1' } });
  });

  it('nie staje na ekranie rzeczy, której dotyczy - ten ekran się odświeża (pkt 43)', () => {
    expect(inAppBanner(frame(), ctx({ route: at('Decision', { bookingId: 'b1' }) }))).toBeNull();
    expect(inAppBanner(frame(), ctx({ route: at('BookingDetails', { bookingId: 'b1' }) }))).toBeNull();
    expect(inAppBanner(frame(), ctx({ route: at('Notifications') }))).toBeNull();
    expect(
      inAppBanner(
        frame(note({ kind: 'aircraft_released', payload: { aircraftId: 'a1' } })),
        ctx({ route: at('Aircraft', { aircraftId: 'a1' }) }),
      ),
    ).toBeNull();
  });

  it('zlecenie: nie staje nad kartą tego zlecenia ani nad tą rozmową - nad inną staje (pkt 43)', () => {
    const changed = note({ kind: 'order_changed', payload: { orderId: 'o-1', aircraftId: 'a1', term: false, changes: {} } });
    expect(inAppBanner(frame(changed), ctx({ route: at('Order', { orderId: 'o-1' }) }))).toBeNull();
    expect(inAppBanner(frame(changed), ctx({ route: at('Order', { orderId: 'o-2' }) }))).not.toBeNull();

    const message = note({
      kind: 'order_message',
      payload: { orderId: 'o-1', recipientId: 'ako', authorId: 'p-jwr', unread: 1, preview: 'Mogę o 14?' },
    });
    expect(inAppBanner(frame(message), ctx())).not.toBeNull();
    // Licznik rozmowy jest plakietką skrzynki - baner mówi samo zdanie (25E).
    expect(inAppBanner(frame(message), ctx())!.row.count).toBeNull();
    expect(inAppBanner(frame(message), ctx())!.target).toEqual({
      screen: 'OrderThread',
      params: { orderId: 'o-1', recipientId: 'ako' },
    });
    expect(inAppBanner(frame(message), ctx({ route: at('OrderThread', { orderId: 'o-1', recipientId: 'ako' }) }))).toBeNull();
    // Rozmowa z KIMŚ INNYM w tym samym zleceniu to inna rzecz - baner staje.
    expect(inAppBanner(frame(message), ctx({ route: at('OrderThread', { orderId: 'o-1', recipientId: 'ews' }) }))).not.toBeNull();
    // Karta zlecenia nie pokazuje treści wiadomości - baner o niej staje także tam.
    expect(inAppBanner(frame(message), ctx({ route: at('Order', { orderId: 'o-1' }) }))).not.toBeNull();
  });

  it('staje nad kartą INNEJ rzeczy - inna rezerwacja, inna maszyna', () => {
    expect(inAppBanner(frame(), ctx({ route: at('BookingDetails', { bookingId: 'b2' }) }))).not.toBeNull();
    expect(
      inAppBanner(
        frame(note({ kind: 'aircraft_released', payload: { aircraftId: 'a1' } })),
        ctx({ route: at('Aircraft', { aircraftId: 'a2' }) }),
      ),
    ).not.toBeNull();
  });

  it('w kokpicie i przy aplikacji w tle nie staje wcale', () => {
    expect(inAppBanner(frame(), ctx({ holdsAircraft: true }))).toBeNull();
    expect(inAppBanner(frame(), ctx({ foreground: false }))).toBeNull();
  });

  it('ramka oznaczona jako cicha nie stawia banera - załoga operacji w toku, także drugi pilot', () => {
    // Telefon drugiego pilota nie jest w trybie kokpitu, więc o ciszy mówi serwer
    // (decyzje 2026-10-06): wiadomość trafia do skrzynki, baneru nie ma.
    expect(inAppBanner(frame(note(), true), ctx())).toBeNull();
  });
});

describe('baner z pusha odebranego na wierzchu', () => {
  it('wiadomość z innego klubu: nazwa klubu nad tytułem, znak z pamięci floty, zdanie o przełączeniu', () => {
    const banner = inAppBanner(
      push({ kind: 'approval_requested', orgId: OTHER, bookingId: 'b9', aircraftId: 'a9' }, 'Zlecenie lotu', 'Odpowiedz w aplikacji.'),
      ctx(),
    );
    expect(banner).not.toBeNull();
    expect(banner!.club).toBe('Aeroklub Krakowski');
    expect(banner!.row.title).toBe('Zlecenie lotu · SP-KLM');
    expect(banner!.row.reason).toBe(FOREIGN_CLUB_HINT);
    // Push godzin nie niesie, więc podpisu z terminem nie ma.
    expect(banner!.row.sub).toBeNull();
    expect(banner!.row.when).toBe(NOW_LABEL);
    expect(banner!.target).toEqual({ screen: 'Notifications', params: { foreignClub: true } });
  });

  it('zlecenie z innego klubu niesie ikonę wiersza skrzynki - kartkę zlecenia w błękicie (25E)', () => {
    const banner = inAppBanner(
      push({ kind: 'order_offered', orgId: OTHER, orderId: 'o-9', bookingId: 'b9', aircraftId: 'a9' }, 'Zlecenie lotu'),
      ctx(),
    );
    expect(banner!.row).toMatchObject({ title: 'Zlecenie lotu · SP-KLM', tone: 'ask', glyph: 'order' });
  });

  it('z innego klubu staje także nad otwartą skrzynką - tamtej wiadomości w niej nie ma', () => {
    expect(inAppBanner(push({ kind: 'approval_requested', orgId: OTHER, bookingId: 'b9' }), ctx({ route: at('Notifications') }))).not.toBeNull();
  });

  it('znak już w tytule nie dokleja się drugi raz; bez znaku w pamięci tytuł stoi sam', () => {
    expect(
      inAppBanner(push({ kind: 'aircraft_engine_started', orgId: OTHER, aircraftId: 'a9' }, 'SP-KLM uruchomiona'), ctx())!.row.title,
    ).toBe('SP-KLM uruchomiona');
    expect(inAppBanner(push({ kind: 'approval_requested', orgId: OTHER, aircraftId: 'a404' }, 'Zlecenie lotu'), ctx())!.row.title).toBe(
      'Zlecenie lotu',
    );
  });

  it('klub aktywny (chwila bez łącza): tytuł i treść pusha, tapnięcie jak w push', () => {
    const banner = inAppBanner(
      push({ kind: 'booking_rejected', orgId: ACTIVE, bookingId: 'b1', aircraftId: 'a1' }, 'Rezerwacja odrzucona', 'Otwórz, żeby przeczytać powód.'),
      ctx(),
    );
    expect(banner!.club).toBeNull();
    expect(banner!.row.title).toBe('Rezerwacja odrzucona · SP-AXA');
    expect(banner!.row.reason).toBe('Otwórz, żeby przeczytać powód.');
    expect(banner!.target).toEqual({ screen: 'BookingDetails', params: { bookingId: 'b1' } });
    // …i nie staje nad kartą tej rezerwacji.
    expect(
      inAppBanner(push({ kind: 'booking_rejected', orgId: ACTIVE, bookingId: 'b1' }, 'Rezerwacja odrzucona'), ctx({ route: at('BookingDetails', { bookingId: 'b1' }) })),
    ).toBeNull();
  });

  it('ton ikony idzie za rodzajem - ten sam, co w wierszu skrzynki', () => {
    expect(inAppBanner(push({ kind: 'approval_requested', orgId: OTHER }), ctx())!.row.tone).toBe('ask');
    expect(inAppBanner(push({ kind: 'booking_rejected', orgId: OTHER }), ctx())!.row.tone).toBe('no');
    expect(inAppBanner(push({ kind: 'cos-nowego', orgId: OTHER }), ctx())!.row.tone).toBe('info');
  });

  it('w kokpicie push przychodzi po cichu - banera nie ma nawet z innego klubu (pkt 44)', () => {
    expect(inAppBanner(push({ kind: 'approval_requested', orgId: OTHER }), ctx({ holdsAircraft: true }))).toBeNull();
  });

  it('push oznaczony jako cichy nie stawia banera - drugi pilot w chwili bez łącza', () => {
    expect(inAppBanner(push({ kind: 'approval_requested', orgId: ACTIVE, bookingId: 'b1', quiet: true }), ctx())).toBeNull();
    // Z innego klubu tak samo - cisza dotyczy osoby w kabinie, nie klubu wiadomości.
    expect(inAppBanner(push({ kind: 'approval_requested', orgId: OTHER, quiet: true }), ctx())).toBeNull();
    // Flaga inna niż `true` nie wycisza - cisza jest wyjątkiem, nie domysłem.
    expect(inAppBanner(push({ kind: 'approval_requested', orgId: ACTIVE, bookingId: 'b1', quiet: 'tak' }), ctx())).not.toBeNull();
  });
});

describe('baner, który już stoi', () => {
  it('zmiana ekranu na ekran rzeczy, której dotyczy, albo wejście do kokpitu gasi go', () => {
    const banner = inAppBanner(frame(), ctx())!;
    expect(bannerFits(banner, at('Calendar'), false)).toBe(true);
    expect(bannerFits(banner, at('Decision', { bookingId: 'b1' }), false)).toBe(false);
    expect(bannerFits(banner, at('Calendar'), true)).toBe(false);
  });
});
