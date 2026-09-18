/**
 * Ninerdeck (serwer) - TREŚĆ listów z linkiem „ustaw hasło" (2.1.0, H-F F2/F4).
 *
 * Brzmienie listu jest decyzją PRODUKTOWĄ, nie skutkiem ubocznym zapisu w bazie -
 * i dlatego treści są czystymi funkcjami, a to jest ich test. Sprawdzamy dokładnie
 * cztery rzeczy, bo tylko one mogą się tu zepsuć w sposób, którego nikt nie zauważy:
 *  • link i termin SĄ w liście (bez nich list jest bezużyteczny);
 *  • termin zgadza się z rzeczywistym czasem ważności (godzina kontra 72 h);
 *  • każdy list kończy się „jeśli to nie Ty" - ktoś wpisał cudzy adres w formularz;
 *  • TOKEN nie stoi w treści nigdzie poza adresem.
 *
 * Testy na samym NAPISIE: to jedyny sposób sprawdzenia rzeczy, którą czyta człowiek.
 */

import { describe, expect, it } from 'vitest';

import {
  existingAccountMail,
  inviteMail,
  resetMail,
  signupMail,
  validityLine,
} from '../src/application/common/mail/passwordMails.ts';

const NOW = new Date('2026-09-18T10:00:00.000Z');
const HOUR = new Date('2026-09-18T11:00:00.000Z');
const THREE_DAYS = new Date('2026-09-21T10:00:00.000Z');

const TOKEN = 'ZbY9-tajny-token-z-linku-0123456789';
const URL = `https://app.ninerdeck.pl/haslo/#${TOKEN}`;

const LINK = { to: 'pilot@ninerdeck.pl', url: URL, expiresAt: HOUR };

/** Cztery listy, jeden kształt - to, co je RÓŻNI, sprawdzamy osobno niżej. */
const ALL = [
  ['reset', resetMail(LINK, NOW)],
  ['masz już konto', existingAccountMail(LINK, NOW)],
  ['rejestracja', signupMail({ ...LINK, displayName: 'Tomasz Małkiewicz' }, NOW)],
  ['zaproszenie', inviteMail({ ...LINK, expiresAt: THREE_DAYS, clubName: 'Aeroklub Alfa' }, NOW)],
] as const;

describe('listy z linkiem - wspólny kształt', () => {
  it.each(ALL)('%s: niesie adres, termin i zdanie „jeśli to nie Ty"', (_name, mail) => {
    expect(mail.to).toBe('pilot@ninerdeck.pl');
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain('Link jest ważny');
    expect(mail.text).toContain('Jeśli to nie Ty');
    expect(mail.subject).toContain('Ninerdeck');
  });

  it.each(ALL)('%s: token stoi WYŁĄCZNIE w adresie, nigdzie indziej', (_name, mail) => {
    // Gdyby token wyciekł do treści osobno (np. „kod: …"), list przestałby być listem
    // z linkiem, a stał się listem z KODEM DO PRZEPISANIA - a tego świadomie nie ma
    // (decyzja właściciela 2026-09-16, D5).
    const withoutUrl = mail.text.split(URL).join('');
    expect(withoutUrl).not.toContain(TOKEN);
  });

  it('listy są TEKSTOWE - żadnego HTML-a do wyrenderowania', () => {
    for (const [, mail] of ALL) expect(mail.text).not.toMatch(/<[a-z]/i);
  });
});

describe('termin ważności', () => {
  it('godzina mówi w minutach, zaproszenie w godzinach - i oba podają chwilę', () => {
    expect(validityLine(HOUR, NOW)).toBe('Link jest ważny 60 minut (do 2026-09-18 11:00 UTC).');
    expect(validityLine(THREE_DAYS, NOW)).toBe(
      'Link jest ważny 72 godzin (do 2026-09-21 10:00 UTC).',
    );
  });

  it('zaproszenie do klubu naprawdę mówi o 72 h, a reset o godzinie', () => {
    // To jest jedyna różnica terminów w systemie i łatwo ją pomylić w wywołaniu.
    expect(inviteMail({ ...LINK, expiresAt: THREE_DAYS, clubName: 'Alfa' }, NOW).text).toContain(
      '72 godzin',
    );
    expect(resetMail(LINK, NOW).text).toContain('60 minut');
  });
});

describe('czym się różnią', () => {
  it('zaproszenie nazywa KLUB - i w temacie, i w treści', () => {
    const mail = inviteMail({ ...LINK, expiresAt: THREE_DAYS, clubName: 'Aeroklub Alfa' }, NOW);
    expect(mail.subject).toContain('Aeroklub Alfa');
    expect(mail.text).toContain('Klub Aeroklub Alfa został założony');
    expect(mail.text).toContain('administratorem');
  });

  it('rejestracja wita po imieniu i zapowiada KOD KLUBU jako następny krok', () => {
    // Konto założone tą drogą niczego w klubie nie omija - to ma stać w liście,
    // żeby człowiek nie czekał na dostęp, którego nikt mu nie nadał.
    const mail = signupMail({ ...LINK, displayName: 'Tomasz Małkiewicz' }, NOW);
    expect(mail.text).toContain('Cześć Tomasz Małkiewicz,');
    expect(mail.text).toContain('kod klubu');
  });

  it('„masz już konto" NIE jest odmową - niesie ten sam link i mówi o Google', () => {
    // Odmowa na ekranie wyliczałaby konta (§8 pkt 2), więc rozstrzyga się to w liście:
    // człowiek, który zapomniał, że już się rejestrował, dostaje to, po co przyszedł.
    const mail = existingAccountMail(LINK, NOW);
    expect(mail.subject).toContain('masz już konto');
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain('Google');
  });

  it('reset uprzedza o wylogowaniu pozostałych sesji, a rejestracja nie ma czego wylogować', () => {
    expect(resetMail(LINK, NOW).text).toContain('sesje zostaną wylogowane');
    expect(signupMail({ ...LINK, displayName: 'Jan' }, NOW).text).not.toContain('wylogowane');
  });
});
