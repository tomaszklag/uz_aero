/**
 * Ninerdeck - treść ekranów 00c/00d/00e (`ui/screens/logic/clubGateView.ts`) i maska kodu
 * klubu (`logic/clubCode.ts`). Wielofirmowość §7, issue #102.
 */

import type { ClubMembershipView, ClubsView } from '../application/ports';
import {
  clubGateView,
  clubOf,
  initialsOf,
  whenLabel,
} from '../ui/screens/logic/clubGateView';
import { clubCodeComplete, maskClubCodeInput } from '../ui/screens/logic/clubCode';

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0); // 4 września 2026, 12:00 UTC

const ALFA = { id: 'org-a', slug: 'alfa', name: 'Aeroklub Zielonogórski' };
const BETA = { id: 'org-b', slug: 'beta', name: 'Aeroklub Krakowski' };
const PERSON = { name: 'Tomasz Małkiewicz', email: 't.malkiewicz@gmail.com' };

const membership = (over: Partial<ClubMembershipView> = {}): ClubMembershipView => ({
  org: ALFA,
  clubActive: true,
  status: 'pending',
  code: null,
  role: 'pilot',
  rejectReason: null,
  createdAt: '2026-09-04T09:38:00.000Z',
  decidedAt: null,
  ...over,
});

const clubs = (status: ClubsView['status'], memberships: ClubMembershipView[]): ClubsView => ({
  status,
  memberships,
  person: PERSON,
});

describe('whenLabel', () => {
  it('ta sama doba UTC: „dziś HH:MM UTC"', () => {
    expect(whenLabel('2026-09-04T09:38:00.000Z', NOW)).toBe('dziś 09:38 UTC');
  });

  it('inna doba: data z formatu wspólnego (dzień, skrót miesiąca, godzina)', () => {
    expect(whenLabel('2026-09-03T14:20:00.000Z', NOW)).toBe('3 WRZ 14:20 UTC');
  });

  it('doba liczy się w UTC - 23:59 wczoraj nie jest „dziś"', () => {
    expect(whenLabel('2026-09-03T23:59:00.000Z', NOW)).not.toContain('dziś');
  });
});

describe('initialsOf', () => {
  it('dwa pierwsze człony, wersalikami', () => {
    expect(initialsOf('Tomasz Małkiewicz')).toBe('TM');
    expect(initialsOf('anna maria nowak')).toBe('AM');
  });

  it('jeden człon daje jedną literę; pusty - znak zapytania', () => {
    expect(initialsOf('Madonna')).toBe('M');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('clubOf - który klub nazywa ekran', () => {
  it('przy czekaniu: NAJŚWIEŻSZE zgłoszenie - o nim pilot właśnie myśli', () => {
    const view = clubs('pending', [
      membership({ org: ALFA, createdAt: '2026-09-01T08:00:00.000Z' }),
      membership({ org: BETA, createdAt: '2026-09-04T09:38:00.000Z' }),
    ]);
    expect(clubOf(view, 'pending')?.org).toEqual(BETA);
  });

  it('przy odmowie: najświeższa DECYZJA, nie najświeższe zgłoszenie', () => {
    const view = clubs('rejected', [
      membership({
        org: ALFA,
        status: 'rejected',
        createdAt: '2026-09-04T09:00:00.000Z',
        decidedAt: '2026-09-04T10:00:00.000Z',
      }),
      membership({
        org: BETA,
        status: 'rejected',
        createdAt: '2026-09-01T09:00:00.000Z',
        decidedAt: '2026-09-04T11:00:00.000Z',
      }),
    ]);
    expect(clubOf(view, 'rejected')?.org).toEqual(BETA);
  });

  it('mija członkostwa w innym stanie - odmowa w jednym klubie nie nazywa drugiego', () => {
    const view = clubs('pending', [
      membership({ org: BETA, status: 'rejected', decidedAt: '2026-09-04T11:00:00.000Z' }),
      membership({ org: ALFA, status: 'pending' }),
    ]);
    expect(clubOf(view, 'pending')?.org).toEqual(ALFA);
  });
});

describe('clubGateView', () => {
  it('czeka: klub NAZWANY w zdaniu, chwila zgłoszenia, bez powodu (00C)', () => {
    const view = clubGateView(clubs('pending', [membership()]), NOW);

    expect(view.state).toBe('pending');
    expect(view.title).toBe('CZEKA NA ZATWIERDZENIE');
    expect(view.body).toContain('Aeroklub Zielonogórski');
    expect(view.body).toContain('nadać Ci kod pilota');
    expect(view.meta).toBe('Zgłoszono kodem klubu · dziś 09:38 UTC');
    expect(view.initials).toBe('TM');
    expect(view.reason).toBeNull();
  });

  it('odrzucone: cytuje POWÓD administratora, chwilę decyzji i nazywa klub (00D)', () => {
    const view = clubGateView(
      clubs('rejected', [
        membership({
          status: 'rejected',
          rejectReason: 'To konto prywatne - zgłoś się adresem klubowym.',
          decidedAt: '2026-09-03T14:20:00.000Z',
        }),
      ]),
      NOW,
    );

    expect(view.state).toBe('rejected');
    expect(view.title).toBe('ZGŁOSZENIE ODRZUCONE');
    expect(view.body).toContain('Aeroklub Zielonogórski');
    expect(view.meta).toBe('Decyzja z 3 WRZ 14:20 UTC');
    expect(view.reason).toBe('To konto prywatne - zgłoś się adresem klubowym.');
  });

  it('bez klubu: instrukcja SKĄD wziąć kod, bez wiersza chwili (00E)', () => {
    const view = clubGateView(clubs('none', []), NOW);

    expect(view.state).toBe('none');
    expect(view.title).toBe('NIE NALEŻYSZ DO ŻADNEGO KLUBU');
    expect(view.body).toContain('od administratora klubu');
    // Nie ma czego stemplować - nic się jeszcze nie wydarzyło.
    expect(view.meta).toBeNull();
    expect(view.reason).toBeNull();
  });

  it('plakietka konta jedzie z serwera - ekran nie zna tokenu Google', () => {
    const view = clubGateView(clubs('none', []), NOW);
    expect(view.name).toBe('Tomasz Małkiewicz');
    expect(view.email).toBe('t.malkiewicz@gmail.com');
  });

  it('konto bez adresu (starszy serwer) nie wywraca ekranu - pusty napis, nie „null"', () => {
    const view = clubGateView({ ...clubs('none', []), person: { name: 'X', email: null } }, NOW);
    expect(view.email).toBe('');
  });
});

describe('maskClubCodeInput', () => {
  it('stawia myślnik po trzech znakach i podnosi wielkość liter', () => {
    expect(maskClubCodeInput('azg7k4m')).toBe('AZG-7K4M');
    expect(maskClubCodeInput('AZG')).toBe('AZG');
    expect(maskClubCodeInput('AZG7')).toBe('AZG-7');
  });

  it('myślnik i spacje są ZAPISEM - wpis z nimi i bez nich daje to samo', () => {
    expect(maskClubCodeInput('AZG-7K4M')).toBe('AZG-7K4M');
    expect(maskClubCodeInput('azg 7k4m')).toBe('AZG-7K4M');
  });

  it('przycina do siedmiu znaków - dłuższego kodu nie ma', () => {
    expect(maskClubCodeInput('AZG7K4MXYZ')).toBe('AZG-7K4M');
  });

  it('NIE filtruje alfabetu kodów - pole, które połyka klawisz, nie mówi dlaczego', () => {
    // O i I nie występują w kodach, ale odpowiedź na nie należy do serwera: jedna
    // wiadomość „Nie znam takiego kodu", ta sama co dla kodu nieznanego (§5).
    expect(maskClubCodeInput('OIO1234')).toBe('OIO-1234');
  });

  it('kompletność liczy się bez myślnika', () => {
    expect(clubCodeComplete('AZG-7K4M')).toBe(true);
    expect(clubCodeComplete('AZG-7K4')).toBe(false);
    expect(clubCodeComplete('')).toBe(false);
  });
});
