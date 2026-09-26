/**
 * Ninerdeck - decyzje ekranów 00G i 00H (prośba o link; 2.1.0, issue #135 E5/E9).
 *
 * Oba ekrany mają JEDNĄ wspólną własność, której pilnuje ten plik: odpowiadają ZAWSZE
 * tym samym zdaniem. Serwer nie rozróżnia adresu znanego od obcego ani zajętego od
 * wolnego, więc ekran nie ma prawa - inaczej sam byłby tą różnicą.
 */

import {
  LINK_INTRO_TEXT,
  LINK_SENT_TEXT,
  canSendLink,
  emailPrefill,
} from '../ui/screens/logic/forgotPassword';
import { SIGNUP_SENT_TEXT, canSignUp, normalizeName } from '../ui/screens/logic/signUp';

describe('00G - „Nie pamiętam hasła"', () => {
  it('podstawia adres z 00F, ale KODU PILOTA nie - z kodu serwer adresu nie zdradzi', () => {
    expect(emailPrefill('  adam@ninerdeck.pl ')).toBe('adam@ninerdeck.pl');
    expect(emailPrefill('BNO')).toBe('');
    expect(emailPrefill('')).toBe('');
  });

  it('puste pole blokuje, ale KSZTAŁTU ADRESU nie sprawdzamy', () => {
    // Odmowa „to nie wygląda na adres" byłaby drugą, surowszą regułą po tej stronie -
    // a ekran, który ma odpowiadać zawsze tak samo, nie różnicuje niczego sam z siebie.
    expect(canSendLink('')).toBe(false);
    expect(canSendLink('   ')).toBe(false);
    expect(canSendLink('ako@')).toBe(true);
    expect(canSendLink('cokolwiek')).toBe(true);
  });

  it('potwierdzenie jest WARUNKOWE i mówi, gdzie otworzyć link', () => {
    expect(LINK_SENT_TEXT).toContain('Jeśli ten adres jest w systemie');
    expect(LINK_SENT_TEXT).toContain('ważny godzinę');
    // Pilot na wspólnym tablecie czyta pocztę na własnym telefonie.
    expect(LINK_SENT_TEXT).toContain('na dowolnym urządzeniu');
  });

  it('ani instrukcja, ani potwierdzenie nie mówią o kodzie do przepisania', () => {
    // Kodu jednorazowego nie ma i nie będzie (decyzja właściciela 2026-09-16).
    expect(`${LINK_INTRO_TEXT} ${LINK_SENT_TEXT}`).not.toMatch(/kod/i);
  });
});

describe('00H - „Załóż konto"', () => {
  it('oba pola wymagane, ale liczby członów nazwiska NIE sprawdzamy', () => {
    expect(canSignUp('', 'kto@gmail.com')).toBe(false);
    expect(canSignUp('Adam Kowalski', '  ')).toBe(false);
    // „Jan" jest kompletnym imieniem człowieka, który tak się przedstawia.
    expect(canSignUp('Jan', 'kto@gmail.com')).toBe(true);
  });

  it('nazwisko idzie bez zewnętrznych spacji i bez podwójnych w środku', () => {
    expect(normalizeName('  Adam   Kowalski ')).toBe('Adam Kowalski');
  });

  it('potwierdzenie opisuje OBA wyniki naraz - adres wolny i zajęty', () => {
    // Serwer nie mówi, czy adres jest wolny; ekran nie może być tą różnicą.
    expect(SIGNUP_SENT_TEXT).toContain('Jeśli ten adres jest wolny');
    expect(SIGNUP_SENT_TEXT).toContain('już istnieje');
  });
});
