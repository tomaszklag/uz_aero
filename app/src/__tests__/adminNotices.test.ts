/**
 * Komunikaty o operacjach zakończonych / unieważnionych przez administratora (issue #81).
 */

import { emptySessionState, type SessionState } from '../domain';
import type { HistoryDay } from '../application';
import {
  adminNoticeText,
  buildAdminNotices,
  parseAcked,
  serializeAcked,
} from '../ui/screens/logic/adminNotices';

const DAY = Date.UTC(2026, 8, 3);
const at = (h: number, m: number): number => DAY + (h * 60 + m) * 60_000;

function day(over: Partial<SessionState>, withheldCount = 0): HistoryDay {
  return {
    state: { ...emptySessionState(), sessionUuid: 's-1', aircraftId: 'ac-1', ...over },
    pendingCount: 0,
    withheldCount,
  };
}

const closedByAdmin = day(
  { closed: true, closedAt: at(12, 40), closedByAdmin: true, adminCloseReason: 'Telefon padł w locie.' },
  3,
);

describe('buildAdminNotices', () => {
  it('operacja zakończona przez panel daje komunikat; zdana przez pilota - nie', () => {
    const own = day({ sessionUuid: 's-2', closed: true, closedAt: at(9, 0) });
    const notices = buildAdminNotices([own, closedByAdmin], new Set());
    expect(notices).toEqual([
      {
        sessionUuid: 's-1',
        aircraftId: 'ac-1',
        kind: 'closed',
        at: at(12, 40),
        reason: 'Telefon padł w locie.',
        withheldCount: 3,
      },
    ]);
  });

  it('unieważnienie z panelu wygrywa z zakończeniem; własne unieważnienie milczy', () => {
    const both = day({
      closed: true,
      closedAt: at(12, 40),
      closedByAdmin: true,
      adminCloseReason: 'x',
      voided: true,
      voidedAt: at(12, 41),
      voidedByAdmin: true,
      voidReason: 'Pomyłka maszyny.',
    });
    expect(buildAdminNotices([both], new Set())[0]).toMatchObject({
      kind: 'voided',
      at: at(12, 41),
      reason: 'Pomyłka maszyny.',
    });

    // Własne wycofanie z arkusza 10L (bez `source`) nie jest cudzą decyzją.
    const own = day({ sessionUuid: 's-3', voided: true, voidedAt: at(8, 0), voidReason: null });
    expect(buildAdminNotices([own], new Set())).toEqual([]);
  });

  it('potwierdzony komunikat nie wraca; nowsze decyzje stoją pierwsze', () => {
    const older = day({ sessionUuid: 's-9', closed: true, closedAt: at(7, 0), closedByAdmin: true });
    expect(buildAdminNotices([older, closedByAdmin], new Set(['s-9'])).map((n) => n.sessionUuid)).toEqual(['s-1']);
    expect(buildAdminNotices([older, closedByAdmin], new Set()).map((n) => n.sessionUuid)).toEqual(['s-1', 's-9']);
  });
});

describe('adminNoticeText', () => {
  const regOf = (id: string): string | null => (id === 'ac-1' ? 'SP-AXA' : null);

  it('nazywa operację sygnaturą, chwilą, powodem i losem zapisów telefonu', () => {
    const [notice] = buildAdminNotices([closedByAdmin], new Set());
    const text = adminNoticeText(notice!, regOf, () => 'SP-AXA/2026-09-03/TMK/1');
    expect(text.title).toBe('Operację zakończył administrator');
    expect(text.text.split('\n')).toEqual([
      'SP-AXA/2026-09-03/TMK/1 · 3 WRZ 12:40 UTC',
      'Powód: Telefon padł w locie.',
      'Operacja liczy się dalej, ale bez odczytów końcowych - poprawek już nie naniesiesz.',
      '3 zapisy z tego telefonu do tej operacji nie wyjdą na serwer.',
    ]);
  });

  it('bez sygnatury mówi znakiem i datą; bez wstrzymanych zapisów o nich milczy', () => {
    const voided = day({ voided: true, voidedAt: at(12, 41), voidedByAdmin: true, voidReason: null });
    const [notice] = buildAdminNotices([voided], new Set());
    const text = adminNoticeText(notice!, regOf, () => null);
    expect(text.title).toBe('Operację unieważnił administrator');
    expect(text.text.split('\n')).toEqual([
      'SP-AXA · 3 WRZ 12:41 UTC',
      'Wpis nie liczy się do Twojego nalotu ani do sum dnia.',
    ]);
  });

  it('jeden wstrzymany zapis odmienia się w liczbie pojedynczej', () => {
    const one = day({ closed: true, closedAt: at(1, 0), closedByAdmin: true }, 1);
    const [notice] = buildAdminNotices([one], new Set());
    expect(adminNoticeText(notice!, regOf, () => null).text).toContain(
      '1 zapis z tego telefonu do tej operacji nie wyjdzie na serwer.',
    );
  });
});

describe('pamięć potwierdzeń', () => {
  it('round-trip przez JSON; uszkodzony wpis to pusty zbiór, nie awaria', () => {
    expect(parseAcked(serializeAcked(new Set(['a', 'b'])))).toEqual(new Set(['a', 'b']));
    expect(parseAcked(null)).toEqual(new Set());
    expect(parseAcked('{nie json')).toEqual(new Set());
    expect(parseAcked('[1, "x", null]')).toEqual(new Set(['x']));
  });
});
