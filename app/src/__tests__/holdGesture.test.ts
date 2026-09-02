/**
 * UZ Aero - podpisy gestu przytrzymania (issue #67).
 *
 * Odmiana jest tu całą treścią modułu: stary `accessibilityHint` w `ActionButton`
 * składał „Przytrzymaj ${s} sekundy" na sztywno, więc zejście z 2 s na 1 s
 * (issue #67) dawało „Przytrzymaj 1 sekundy". Test przybija biernik dla każdej
 * klasy liczebnika, żeby przyszła zmiana czasu nie odtworzyła tego błędu.
 */

import { HOLD_MS, holdConfirmHint, holdShortLabel } from '../ui/components/data/holdGesture';

describe('holdGesture', () => {
  it('czas kanoniczny gestu to 1 s (issue #67)', () => {
    expect(HOLD_MS).toBe(1000);
  });

  it('podpis kanoniczny odmienia „1 sekundę" (nie „1 sekundy")', () => {
    expect(holdConfirmHint(HOLD_MS)).toBe('Przytrzymaj 1 sekundę aby potwierdzić');
  });

  it('odmienia klasy liczebnika: 2-4 sekundy, 5+ i 12-14 sekund', () => {
    expect(holdConfirmHint(2000)).toBe('Przytrzymaj 2 sekundy aby potwierdzić');
    expect(holdConfirmHint(4000)).toBe('Przytrzymaj 4 sekundy aby potwierdzić');
    expect(holdConfirmHint(5000)).toBe('Przytrzymaj 5 sekund aby potwierdzić');
    expect(holdConfirmHint(12_000)).toBe('Przytrzymaj 12 sekund aby potwierdzić');
    expect(holdConfirmHint(22_000)).toBe('Przytrzymaj 22 sekundy aby potwierdzić');
  });

  it('zaokrągla do pełnych sekund i nie schodzi poniżej 1', () => {
    expect(holdConfirmHint(1499)).toBe('Przytrzymaj 1 sekundę aby potwierdzić');
    expect(holdConfirmHint(200)).toBe('Przytrzymaj 1 sekundę aby potwierdzić');
  });

  it('mikropodpis paska mówi skrótem: „przytrzymaj 1 s"', () => {
    expect(holdShortLabel(HOLD_MS)).toBe('przytrzymaj 1 s');
    expect(holdShortLabel(2000)).toBe('przytrzymaj 2 s');
  });
});
