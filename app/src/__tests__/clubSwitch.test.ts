/**
 * Ninerdeck - sekcja „Klub" w ustawieniach (`ui/screens/logic/clubSwitch.ts`, mockup 13a).
 *
 * Trzy własności, których złamanie widać dopiero na urządzeniu:
 *  1. sekcja istnieje WYŁĄCZNIE przy więcej niż jednym klubie (razem ze zgłoszeniami);
 *  2. blokada przełączenia mówi POWÓD i zna ich kolejność powagi;
 *  3. podpis karty nie zmyśla floty klubu, którego telefon nigdy nie widział.
 */

import type { ClubMembership, ClubMembershipView } from '../application/ports';
import { clubCards, clubSwitchBlock, showsClubSection } from '../ui/screens/logic/clubSwitch';

const ALFA = { id: 'org-a', slug: 'alfa', name: 'Aeroklub Zielonogórski' };
const BETA = { id: 'org-b', slug: 'beta', name: 'Aeroklub Krakowski' };
const GAMMA = { id: 'org-c', slug: 'gamma', name: 'Aeroklub Gamma' };

const member = (org: typeof ALFA, code: string): ClubMembership => ({ org, code, role: 'pilot' });

const pending = (org: typeof ALFA): ClubMembershipView => ({
  org,
  clubActive: true,
  status: 'pending',
  code: null,
  role: 'pilot',
  rejectReason: null,
  createdAt: '2026-09-04T09:38:00.000Z',
  decidedAt: null,
});

describe('showsClubSection', () => {
  it('jeden klub - sekcji NIE MA (przełącznik o jednej pozycji nic nie przełącza)', () => {
    expect(showsClubSection([member(ALFA, 'TMK')], [])).toBe(false);
  });

  it('dwa członkostwa - sekcja jest', () => {
    expect(showsClubSection([member(ALFA, 'TMK'), member(BETA, 'TOM')], [])).toBe(true);
  });

  it('jeden klub + ZGŁOSZENIE do drugiego - sekcja jest', () => {
    // Pilot, który właśnie wpisał kod, ma prawo zobaczyć, że zgłoszenie czeka.
    expect(showsClubSection([member(ALFA, 'TMK')], [pending(BETA)])).toBe(true);
  });

  it('zgłoszenie ODRZUCONE nie robi sekcji - nie ma czego przełączać', () => {
    const rejected = { ...pending(BETA), status: 'rejected' as const };
    expect(showsClubSection([member(ALFA, 'TMK')], [rejected])).toBe(false);
  });
});

describe('clubCards', () => {
  it('klub aktywny na czele, podpis z kodem i liczbą maszyn', () => {
    const cards = clubCards(
      [member(BETA, 'TOM'), member(ALFA, 'TMK')],
      [],
      ALFA.id,
      { [ALFA.id]: 4, [BETA.id]: 2 },
    );

    expect(cards.map((c) => c.orgId)).toEqual([ALFA.id, BETA.id]);
    expect(cards[0]).toMatchObject({ selected: true, sub: 'Twój kod: TMK · 4 samoloty' });
    expect(cards[1]).toMatchObject({ selected: false, sub: 'Twój kod: TOM · 2 samoloty' });
  });

  it('klub, którego floty telefon nie widział, NIE dostaje „0 samolotów"', () => {
    // To byłoby zdanie o flocie, a jest zdaniem o pustym cache'u.
    const cards = clubCards([member(ALFA, 'TMK'), member(BETA, 'TOM')], [], ALFA.id, {
      [ALFA.id]: 4,
    });
    expect(cards[1]!.sub).toBe('Twój kod: TOM');
  });

  it('zgłoszenie stoi na końcu, jest `pending` i nie ma kodu', () => {
    const cards = clubCards([member(ALFA, 'TMK')], [pending(GAMMA)], ALFA.id, {});

    expect(cards).toHaveLength(2);
    expect(cards[1]).toMatchObject({
      orgId: GAMMA.id,
      pending: true,
      selected: false,
      sub: 'Czeka na zatwierdzenie',
    });
  });

  it('zgłoszenie do klubu, w którym pilot JUŻ lata, nie dubluje karty', () => {
    const cards = clubCards([member(ALFA, 'TMK')], [pending(ALFA)], ALFA.id, {});
    expect(cards).toHaveLength(1);
  });
});

describe('clubSwitchBlock', () => {
  it('nic nie blokuje - `null`', () => {
    expect(clubSwitchBlock(0, false)).toBeNull();
  });

  it('zaległe zapisy KLUBU BIEŻĄCEGO: powód mówi ile i dlaczego', () => {
    expect(clubSwitchBlock(3, false)).toBe(
      'Najpierw wyślij 3 zapisy - należą do klubu, w którym powstały',
    );
    expect(clubSwitchBlock(1, false)).toContain('1 zapis -');
    expect(clubSwitchBlock(5, false)).toContain('5 zapisów');
  });

  it('brak sieci: przełączenie wymaga internetu (§6)', () => {
    expect(clubSwitchBlock(0, true)).toBe('Zmiana klubu wymaga internetu');
  });

  it('trzymana maszyna wygrywa z resztą - operacja należy do klubu, w którym ją zaczęto', () => {
    expect(clubSwitchBlock(3, true, true)).toContain('Najpierw zdaj samolot');
  });

  it('zaległe zapisy wygrywają z brakiem sieci - to pilot musi je wysłać, nie zasięg', () => {
    expect(clubSwitchBlock(2, true)).toContain('Najpierw wyślij');
  });
});
