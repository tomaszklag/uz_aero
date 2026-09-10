/**
 * UZ Aero - BRAMKA KLUBU w store uwierzytelnienia (wielofirmowość §7, issue #102).
 *
 * Ten sam kod klubu wpisuje się w DWÓCH miejscach i wynik znaczy tam co innego:
 *  • na 00E (osoba bez klubu) zgłoszenie i odmowa PRZEŁĄCZAJĄ EKRAN - to jest cała
 *    treść bramki;
 *  • na 13A (pilot, który już gdzieś lata) nie zmieniają NICZEGO poza listą klubów:
 *    on ma klub i pracuje dalej. Odmowa z drugiego klubu wyrzucająca go z aplikacji
 *    byłaby najgorszym możliwym skutkiem próby dołączenia gdzie indziej.
 *
 * Store testuje się w Node bez renderowania - zustand tego nie potrzebuje.
 */

import type {
  AuthService,
  ClubsView,
  JoinOutcome,
  MembershipCheck,
  StoredCredentials,
} from '../application';
import { useAuthStore } from '../ui/store/authStore';

const ALFA = { id: 'org-a', slug: 'alfa', name: 'Aeroklub Zielonogórski' };
const BETA = { id: 'org-b', slug: 'beta', name: 'Aeroklub Krakowski' };

const person = { name: 'Tomasz Małkiewicz', email: 't@example.com' };

const noClubs: ClubsView = { status: 'none', memberships: [], person };
const waitingInBeta: ClubsView = {
  status: 'pending',
  person,
  memberships: [
    {
      org: BETA,
      clubActive: true,
      status: 'pending',
      code: null,
      role: 'pilot',
      rejectReason: null,
      createdAt: '2026-09-10T09:00:00.000Z',
      decidedAt: null,
    },
  ],
};

const flying: StoredCredentials = {
  token: 'jwt',
  refreshToken: 'r',
  pilot: { id: 'p1', code: 'TMK', name: 'Tomasz Małkiewicz' },
  pin: { salt: 's', hash: 'h' },
  org: ALFA,
  memberships: [{ org: ALFA, code: 'TMK', role: 'pilot' }],
};

/** Atrapa serwisu - store woła z niego dokładnie te trzy rzeczy. */
function fakeService(script: {
  join?: JoinOutcome;
  check?: MembershipCheck;
  person?: { personToken: string; clubs: ClubsView } | null;
}): AuthService {
  return {
    joinClub: async () => script.join ?? { kind: 'unknown_code' },
    checkMemberships: async () => script.check ?? { kind: 'unreachable' },
    person: async () => script.person ?? null,
  } as unknown as AuthService;
}

/** Stan wyjściowy: pilot BEZ klubu (bramka 00E) albo pilot latający w Alfie. */
const atGate = (): void => {
  useAuthStore.setState({ status: 'no_club', clubs: noClubs, pilot: null, org: null, memberships: [] });
};
const inClub = (): void => {
  useAuthStore.setState({
    status: 'signed_in',
    clubs: null,
    pilot: flying.pilot,
    org: ALFA,
    memberships: flying.memberships ?? [],
  });
};

describe('joinClub - z bramki (00E)', () => {
  it('zgłoszenie przyjęte przełącza ekran na oczekiwanie (00C)', async () => {
    useAuthStore.getState().attach(fakeService({ join: { kind: 'pending', org: BETA, clubs: waitingInBeta } }));
    atGate();

    expect(await useAuthStore.getState().joinClub('BET-2345')).toEqual({ kind: 'joined' });
    expect(useAuthStore.getState().status).toBe('no_club');
    expect(useAuthStore.getState().clubs?.status).toBe('pending');
  });

  it('nieznany kod: zdanie PRZY POLU, ekran bez zmian', async () => {
    useAuthStore.getState().attach(fakeService({ join: { kind: 'unknown_code' } }));
    atGate();

    const result = await useAuthStore.getState().joinClub('ZLY-KOD1');
    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('Nie znam takiego kodu') });
    expect(useAuthStore.getState().clubs?.status).toBe('none');
  });

  it('limit prób: powód W PRZYCISKU z czasem odczekania (issue #55)', async () => {
    useAuthStore.getState().attach(fakeService({ join: { kind: 'rate_limited', retryAfterSec: 180 } }));
    atGate();

    expect(await useAuthStore.getState().joinClub('AZG-7K4M')).toEqual({
      kind: 'blocked',
      reason: 'Za dużo prób - spróbuj za 3 min',
    });
  });

  it('brak sieci: „Wymaga internetu" - dołączenie jest jedną z akcji, które sieci wymagają (§6)', async () => {
    useAuthStore.getState().attach(fakeService({ join: { kind: 'unreachable' } }));
    atGate();

    expect(await useAuthStore.getState().joinClub('AZG-7K4M')).toEqual({
      kind: 'blocked',
      reason: 'Wymaga internetu',
    });
  });
});

describe('joinClub - z ustawień (13A), gdy pilot JUŻ gdzieś lata', () => {
  it('zgłoszenie przyjęte NIE rusza ekranu - pilot pracuje dalej w swoim klubie', async () => {
    useAuthStore.getState().attach(fakeService({ join: { kind: 'pending', org: BETA, clubs: waitingInBeta } }));
    inClub();

    expect(await useAuthStore.getState().joinClub('BET-2345')).toEqual({ kind: 'joined' });
    expect(useAuthStore.getState().status).toBe('signed_in');
    expect(useAuthStore.getState().org).toEqual(ALFA);
  });

  it('ODMOWA drugiego klubu nie wyrzuca z aplikacji - jest zdaniem w arkuszu', async () => {
    useAuthStore.getState().attach(
      fakeService({
        join: { kind: 'rejected', org: BETA, rejectReason: 'nie z klubu', decidedAt: null },
      }),
    );
    inClub();

    const result = await useAuthStore.getState().joinClub('BET-2345');
    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('Aeroklub Krakowski') });
    // Najgorszy możliwy skutek próby dołączenia gdzie indziej: utrata własnego klubu.
    expect(useAuthStore.getState().status).toBe('signed_in');
    expect(useAuthStore.getState().org).toEqual(ALFA);
  });
});

describe('checkClubs', () => {
  it('z bramki: „za tym tokenem nikt nie stoi" wraca na ekran logowania', async () => {
    useAuthStore.getState().attach(fakeService({ check: { kind: 'gone' } }));
    atGate();

    await useAuthStore.getState().checkClubs();
    expect(useAuthStore.getState().status).toBe('signed_out');
  });

  it('z ustawień: ta sama odmowa NIE wylogowuje - 13A tylko odświeża listę klubów', async () => {
    useAuthStore.getState().attach(fakeService({ check: { kind: 'gone' } }));
    inClub();

    await useAuthStore.getState().checkClubs();
    expect(useAuthStore.getState().status).toBe('signed_in');
  });

  it('z ustawień: brak sieci milczy - zdanie „sprawdź, gdy będzie zasięg" należy do 00C', async () => {
    useAuthStore.getState().attach(fakeService({ check: { kind: 'unreachable' } }));
    inClub();

    await useAuthStore.getState().checkClubs();
    expect(useAuthStore.getState().clubsNote).toBeNull();
  });
});

describe('switchClub', () => {
  it('zaległe zapisy KLUBU BIEŻĄCEGO blokują z powodem, bez ruszania serwera', async () => {
    let asked = false;
    useAuthStore.getState().attach({
      switchClub: async () => {
        asked = true;
        return { kind: 'not_found' as const };
      },
    } as unknown as AuthService);
    inClub();

    expect(await useAuthStore.getState().switchClub(BETA.id, 3)).toEqual({
      kind: 'blocked',
      reason: expect.stringContaining('Najpierw wyślij 3 zapisy'),
    });
    expect(asked).toBe(false);
  });

  it('udane przełączenie wchodzi w nowy klub z kodem z TAMTEGO członkostwa', async () => {
    const beta: StoredCredentials = {
      ...flying,
      token: 'jwt-b',
      pilot: { ...flying.pilot, code: 'TOM' },
      org: BETA,
      memberships: [
        { org: ALFA, code: 'TMK', role: 'pilot' },
        { org: BETA, code: 'TOM', role: 'pilot' },
      ],
    };
    useAuthStore.getState().attach({
      switchClub: async () => ({ kind: 'switched' as const, stored: beta }),
    } as unknown as AuthService);
    inClub();

    expect(await useAuthStore.getState().switchClub(BETA.id, 0)).toEqual({ kind: 'joined' });
    expect(useAuthStore.getState().org).toEqual(BETA);
    expect(useAuthStore.getState().pilot?.code).toBe('TOM');
    // PIN przeżywa przełączenie - bramka wraca do zamka, nie do „Ustaw PIN".
    expect(useAuthStore.getState().status).toBe('locked');
  });
});
