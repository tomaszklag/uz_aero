/**
 * Ninerdeck - arkusz hasła 13B i wiersz w ustawieniach (`ui/screens/logic/passwordForm.ts`;
 * 2.1.0, issue #135 E7).
 *
 * Politykę liczy domena (`passwordPolicy.test.ts`) - tu chodzi o to, CO ARKUSZ MÓWI
 * i kiedy wolno zapisać.
 */

import { PASSWORD_MIN_LENGTH } from '@ninerdeck/domain';

import {
  EMPTY_PASSWORD_DRAFT,
  passwordBlock,
  passwordRow,
  passwordVerdict,
  type PasswordDraft,
} from '../ui/screens/logic/passwordForm';

const ME = { email: 'tomasz.malkiewicz@ninerdeck.pl', name: 'Tomasz Małkiewicz' };
const GOOD = 'hangar-lotnisko-7';

const draft = (over: Partial<PasswordDraft>): PasswordDraft => ({ ...EMPTY_PASSWORD_DRAFT, ...over });

describe('passwordVerdict', () => {
  it('pusty formularz MILCZY - blokadę widać z pól nad przyciskiem', () => {
    const v = passwordVerdict(EMPTY_PASSWORD_DRAFT, ME, false);
    expect(v.hint).toBeNull();
    expect(v.repeatError).toBeNull();
    expect(v.canSave).toBe(false);
  });

  it('podpowiedź polityki pojawia się PO PIERWSZYM ZNAKU i bursztynieje, gdy za krótko', () => {
    const short = passwordVerdict(draft({ next: 'krotkie' }), ME, false);
    expect(short.hint).toContain(String(PASSWORD_MIN_LENGTH));
    expect(short.hintWarns).toBe(true);

    const ok = passwordVerdict(draft({ next: GOOD, repeat: GOOD }), ME, false);
    expect(ok.hint).toContain(String(PASSWORD_MIN_LENGTH));
    expect(ok.hintWarns).toBe(false);
  });

  it('„za łatwe" i „zawiera Twój adres" to ZARZUTY, nie powtórzenie wymogu', () => {
    // Za krótkie naprawia się pisaniem dalej, więc tam wystarczy wymóg. Te dwa trzeba
    // NAZWAĆ - inaczej pilot dopisuje znaki i nie rozumie, czemu dalej nie przechodzi.
    const blocked = passwordVerdict(draft({ next: 'zaq12wsxcde3' }), ME, false);
    expect(blocked.hintWarns).toBe(true);
    expect(blocked.hint).not.toContain(String(PASSWORD_MIN_LENGTH));

    const withEmail = passwordVerdict(draft({ next: 'tomasz.malkiewicz@ninerdeck.pl1' }), ME, false);
    expect(withEmail.hint).toContain('adres');
  });

  it('powtórka odzywa się dopiero, gdy jest NIEPUSTA - zarzut za wcześnie jest zarzutem', () => {
    expect(passwordVerdict(draft({ next: GOOD }), ME, false).repeatError).toBeNull();
    expect(passwordVerdict(draft({ next: GOOD, repeat: 'inne-haslo-2026' }), ME, false).repeatError).toBe(
      'Hasła się różnią.',
    );
  });

  it('osoba, która hasło JUŻ MA, musi podać obecne - serwer i tak go zażąda', () => {
    const without = passwordVerdict(draft({ next: GOOD, repeat: GOOD }), ME, true);
    expect(without.canSave).toBe(false);

    const withCurrent = passwordVerdict(draft({ current: 'stare', next: GOOD, repeat: GOOD }), ME, true);
    expect(withCurrent.canSave).toBe(true);
  });

  it('pierwsze hasło zapisuje się bez pola „Obecne"', () => {
    expect(passwordVerdict(draft({ next: GOOD, repeat: GOOD }), ME, false).canSave).toBe(true);
  });
});

describe('passwordRow', () => {
  it('JEDEN wiersz, dwa napisy - zależnie od tego, czy hasło już jest', () => {
    expect(passwordRow(false, null)).toEqual({
      name: 'Ustaw hasło',
      sub: 'do logowania na wspólnym tablecie',
    });
    expect(passwordRow(true, null)).toEqual({
      name: 'Zmień hasło',
      sub: 'najpierw obecne, potem nowe',
    });
  });

  it('podpis mówi PO CO, a nie „wymaga internetu" - sieć jest stanem domyślnym', () => {
    expect(passwordRow(false, null).sub).not.toContain('internet');
  });

  it('blokada wypiera podpis i nazywa powód W WIERSZU', () => {
    expect(passwordRow(false, 'offline').sub).toBe('niedostępne - wymaga internetu');
    expect(passwordRow(true, 'revoked').sub).toBe('niedostępne - zaloguj się ponownie');
  });
});

describe('passwordBlock', () => {
  it('sesja zerwana zdalnie WYGRYWA z brakiem sieci - zasięg jej nie naprawi', () => {
    expect(passwordBlock(true, false)).toBe('revoked');
    expect(passwordBlock(true, true)).toBe('revoked');
    expect(passwordBlock(false, false)).toBe('offline');
    expect(passwordBlock(false, true)).toBeNull();
  });
});
