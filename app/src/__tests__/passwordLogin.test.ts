/**
 * Ninerdeck - decyzje ekranu 00F (`ui/screens/logic/passwordLogin.ts`; 2.1.0, issue #135 E4).
 */

import { canSubmitLogin, looksLikeEmail, normalizeLogin } from '../ui/screens/logic/passwordLogin';

describe('looksLikeEmail', () => {
  it('rozstrzyga OBECNOŚĆ „@", bo pole ma rozpoznać intencję, nie sprawdzić pocztę', () => {
    expect(looksLikeEmail('adam@ninerdeck.pl')).toBe(true);
    expect(looksLikeEmail('BNO')).toBe(false);
    // Adres popsuty jest nadal adresem: pójdzie na serwer i wróci jedną odmową.
    expect(looksLikeEmail('ako@')).toBe(true);
  });
});

describe('normalizeLogin', () => {
  it('adres małą literą - tak trzyma go serwer od 2.1.0', () => {
    expect(normalizeLogin('  ADAM@Ninerdeck.PL ')).toBe('adam@ninerdeck.pl');
  });

  it('kod pilota wersalikami - tak stoi w klubie i tak czyta go człowiek', () => {
    expect(normalizeLogin(' bno ')).toBe('BNO');
  });

  it('autokapitalizacja tabletu nie może rozdzielać tej samej osoby', () => {
    expect(normalizeLogin('Bno')).toBe(normalizeLogin('BNO'));
  });
});

describe('canSubmitLogin', () => {
  it('puste pole blokuje - i robi to BEZ zdania, bo blokadę widać z pól', () => {
    expect(canSubmitLogin('', 'dobre-haslo-2026')).toBe(false);
    expect(canSubmitLogin('   ', 'dobre-haslo-2026')).toBe(false);
    expect(canSubmitLogin('BNO', '')).toBe(false);
    expect(canSubmitLogin('BNO', 'x')).toBe(true);
  });

  it('krótkiego hasła NIE blokuje - polityka dotyczy ustawiania, nie logowania', () => {
    // Konto sprzed zaostrzenia reguł musi dać się otworzyć, a zdanie „za krótkie"
    // przy logowaniu mówiłoby pilotowi o cudzej regule.
    expect(canSubmitLogin('BNO', 'krotkie')).toBe(true);
  });
});
