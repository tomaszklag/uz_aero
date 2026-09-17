/**
 * Ninerdeck (serwer) - TREŚĆ listów z linkiem „ustaw hasło" (2.1.0, §5.4, §5.4a, D8).
 *
 * Czyste funkcje: dane → `MailMessage`. Osobno od komendy, bo brzmienie listu jest
 * decyzją produktową (sprawdzalną testem na napisie), a nie skutkiem ubocznym zapisu
 * w bazie. Cztery wyzwalacze dają JEDEN list - różni je wyłącznie treść zaproszenia
 * (nazwa klubu) i zdanie „masz już konto" przy rejestracji na zajęty adres.
 *
 * Listy są TEKSTOWE i po polsku; każdy kończy się „jeśli to nie Ty, zignoruj" -
 * ktoś wpisał cudzy adres w formularz, a odbiorca nie ma nic do zrobienia.
 * Tokenu poza adresem w treści nie ma nigdzie; strona `/haslo/` czyta go z fragmentu.
 */

import type { MailMessage } from '../ports.ts';

export interface PasswordLinkMail {
  to: string;
  url: string;
  expiresAt: Date;
}

const FOOTER =
  'Jeśli to nie Ty prosiłeś o ten link, zignoruj tę wiadomość - nic się nie zmieni.\n\nNinerdeck';

/** Termin po polsku, w czasie UTC - list czyta się także z telefonu bez strefy serwera. */
export function validityLine(expiresAt: Date, now: Date): string {
  const minutes = Math.round((expiresAt.getTime() - now.getTime()) / 60_000);
  if (minutes >= 24 * 60) {
    const hours = Math.round(minutes / 60);
    return `Link jest ważny ${hours} godzin (do ${stamp(expiresAt)}).`;
  }
  return `Link jest ważny ${minutes} minut (do ${stamp(expiresAt)}).`;
}

const stamp = (at: Date): string => `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;

/** „Nie pamiętam hasła" (self), przycisk administratora (admin), konsola (cli). */
export function resetMail(mail: PasswordLinkMail, now: Date): MailMessage {
  return {
    to: mail.to,
    subject: 'Ninerdeck - ustaw hasło',
    text: [
      'Ten link ustawia hasło do Twojego konta w Ninerdeck:',
      '',
      mail.url,
      '',
      validityLine(mail.expiresAt, now),
      'Po ustawieniu hasła zaloguj się nim w aplikacji albo w panelu. Wszystkie dotychczasowe',
      'sesje zostaną wylogowane.',
      '',
      FOOTER,
    ].join('\n'),
  };
}

/**
 * Rejestracja e-mailem na adres, który JUŻ jest w systemie (§5.4a): zamiast odmowy
 * (wyliczałaby konta) idzie zwykły reset ze zdaniem „masz już konto".
 */
export function existingAccountMail(mail: PasswordLinkMail, now: Date): MailMessage {
  return {
    to: mail.to,
    subject: 'Ninerdeck - masz już konto',
    text: [
      'Ktoś (prawdopodobnie Ty) próbował założyć konto w Ninerdeck na ten adres - a konto',
      'z tym adresem już istnieje. Ten link ustawia mu hasło, więc zalogujesz się nim',
      'w aplikacji albo w panelu:',
      '',
      mail.url,
      '',
      validityLine(mail.expiresAt, now),
      'Jeśli logujesz się kontem Google, nie musisz ustawiać hasła - po prostu zaloguj się jak dotąd.',
      '',
      FOOTER,
    ].join('\n'),
  };
}

/** Nowe konto z rejestracji e-mailem (00H): osoba powstanie dopiero po kliknięciu. */
export function signupMail(mail: PasswordLinkMail & { displayName: string }, now: Date): MailMessage {
  return {
    to: mail.to,
    subject: 'Ninerdeck - załóż hasło do nowego konta',
    text: [
      `Cześć ${mail.displayName},`,
      '',
      'ten link kończy zakładanie konta w Ninerdeck - ustawisz nim hasło:',
      '',
      mail.url,
      '',
      validityLine(mail.expiresAt, now),
      'Po ustawieniu hasła zaloguj się w aplikacji i wpisz kod klubu, który dostaniesz',
      'od jego administratora.',
      '',
      FOOTER,
    ].join('\n'),
  };
}

/** Zaproszenie PIERWSZEGO administratora klubu przy założeniu klubu i „Wyślij ponownie" (D8). */
export function inviteMail(mail: PasswordLinkMail & { clubName: string }, now: Date): MailMessage {
  return {
    to: mail.to,
    subject: `Klub ${mail.clubName} w Ninerdeck - ustaw hasło`,
    text: [
      `Klub ${mail.clubName} został założony w Ninerdeck, a Ty jesteś jego administratorem.`,
      'Ten link ustawia hasło do panelu:',
      '',
      mail.url,
      '',
      validityLine(mail.expiresAt, now),
      'Jeśli wolisz logować się kontem Google z tym samym adresem, po prostu zaloguj się nim',
      'w panelu - konto podpisze się samo.',
      '',
      FOOTER,
    ].join('\n'),
  };
}
