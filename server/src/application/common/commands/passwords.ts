/**
 * Ninerdeck (serwer) - HASŁO: ustawienie, zmiana, link z e-maila, rejestracja
 * (2.1.0, `docs/logowanie-haslem.md` §5.3, §5.4, §5.4a, §8; issue #132 B6).
 *
 * ══ JEDEN MECHANIZM „USTAW HASŁO", CZTERY WYZWALACZE ══
 * List z linkiem `/haslo/#<token>` jest JEDYNĄ drogą do hasła, którego się nie zna:
 * „Nie pamiętam hasła" (`self`), przycisk administratora w karcie członka (`admin`),
 * zaproszenie pierwszego administratora klubu (`platform`) i konsola serwera (`cli`).
 * Kodu jednorazowego do przepisywania NIE MA - decyzja właściciela (2026-09-16):
 * „działanie administratora powinno być takie samo, jak kliknięcie w e-mail z resetem,
 * tylko inny punkt triggera". Wyzwalacze `admin`/`platform` mają własną komendę
 * z audytem (`application/admin/commands/passwordLinks.ts`) i wołają stąd `issueLink`
 * + `deliver` - żeby list i token miały JEDNO źródło.
 *
 * ══ NIC NIE WYLICZA KONT (§8 pkt 2, 3) ══
 * `forgot` i `signUp` ZAWSZE kończą się bez odpowiedzi (trasa mówi `202`): adres nieznany,
 * adres znany, limit wysyłek - z zewnątrz nie do odróżnienia. List wychodzi wyłącznie
 * wtedy, gdy jest do kogo. Limit wysyłki stoi PRZED czymkolwiek: 3 listy na adres
 * i 10 na adres IP w 15 min - przekroczenie też milczy.
 *
 * ══ REJESTRACJA E-MAILEM TO TEN SAM LIST (§5.4a, decyzja 2026-09-17) ══
 * Adres WOLNY → token `signup` z adresem i imieniem, osoba powstaje DOPIERO przy
 * realizacji (kliknięcie potwierdza adres, jak `email_verified` u Google). Adres ZAJĘTY →
 * zwykły list resetu ze zdaniem „masz już konto", nie odmowa. Realizacja `signup`, gdy
 * adres w międzyczasie zajęto (wyścig z pierwszym logowaniem Googlem), działa jak reset
 * dla TEJ osoby - `insertPerson` oddaje istniejącą.
 *
 * ══ REALIZACJA LINKU: PODGLĄD → POLITYKA → JEDNA TRANSAKCJA ══
 * `peek` bez zużycia, żeby słabe hasło nie spaliło linku (człowiek poprawia i klika
 * jeszcze raz). Potem w JEDNEJ transakcji: `consume` (jednorazowość - przegrany wyścig
 * dwu kliknięć dostaje `invalid_token`), osoba (przy `signup`), skrót `set_via: 'link'`,
 * kasowanie WSZYSTKICH refreshy i stempel `credentials_valid_from` - reset zakłada, że
 * stare hasło mogło wyciec, więc zrywa każdą sesję osoby. Sesji NIE wydaje: strona
 * odpowiada `204`, człowiek loguje się tam, gdzie pracuje.
 *
 * ══ ZMIANA HASŁA W USTAWIENIACH (§5.3) ══
 * Osoba BEZ hasła (dziś każdy zalogowany Googlem) ustawia je bez `current`; osoba
 * Z hasłem podaje `current` (limit prób jak przy logowaniu). Warunkiem jest adres
 * e-mail na osobie - bez niego nie byłoby czym się potem zalogować (`email_required`).
 * Unieważnienie POZOSTAŁYCH sesji (poza bieżącą) potrzebuje `sid` z `login_sessions`
 * i przychodzi z epikiem H-C (issue #133) - tu jest hak `onPasswordChanged`.
 */

import { checkPassword, type PasswordWeakness } from '@ninerdeck/domain';

import { normalizeEmail } from '../../../domain/email.ts';
import type { AttemptLimiter } from '../attemptLimiter.ts';
import { existingAccountMail, inviteMail, resetMail, signupMail } from '../mail/passwordMails.ts';
import type {
  Clock,
  Database,
  IssuedResetToken,
  MailPort,
  PasswordCredentialsPort,
  PasswordHasher,
  PasswordResetTokensPort,
  PilotAccount,
  PilotsPort,
  Queryable,
  RefreshTokensPort,
  ResetTrigger,
} from '../ports.ts';

/** Link z „Nie pamiętam hasła", z przycisku administratora i z rejestracji - godzina (§4.2). */
export const RESET_LINK_TTL_MS = 60 * 60_000;
/** Zaproszenie pierwszego administratora klubu i link z konsoli - 72 godziny. */
export const INVITE_LINK_TTL_MS = 72 * 3_600_000;

/** Okno limitów hasła - to samo, co przy kodzie klubu. */
export const PASSWORD_WINDOW_MS = 15 * 60_000;
/** Wysyłka linku z zewnątrz (`forgot`, `signup`): na adres e-mail i na adres IP. */
export const SEND_PER_ADDRESS = 3;
export const SEND_PER_IP = 10;
/** Wyzwalacz administratora: ochrona skrzynki członka przed panelem, nie przed atakiem. */
export const ADMIN_SEND_PER_PERSON = 5;
/** Próby `current` przy zmianie hasła - jak przy logowaniu (10/login). */
export const CHANGE_ATTEMPTS_PER_PERSON = 10;

/** Adres linku - `infrastructure/auth/resetLinks.ts`; port, żeby testy nie musiały znać hosta. */
export interface PasswordLinks {
  resetUrl(token: string): string;
}

export type ChangePasswordOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid_credentials' | 'email_required' }
  | { ok: false; reason: 'rate_limited'; retryAfterSec: number }
  | { ok: false; reason: 'weak_password'; weakness: PasswordWeakness };

export type ResetByLinkOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid_token' }
  | { ok: false; reason: 'weak_password'; weakness: PasswordWeakness };

/** Wydanie linku dla wyzwalacza z panelu albo konsoli - token żyje wyłącznie do `deliver`. */
export interface IssuedLink extends IssuedResetToken {
  url: string;
  to: string;
}

export class EmailRequired extends Error {}
export class AdminSendLimited extends Error {
  constructor(readonly retryAfterSec: number) {
    super('za dużo listów do tej osoby');
  }
}

export class PasswordCommands {
  constructor(
    private readonly db: Database,
    private readonly pilots: PilotsPort,
    private readonly credentials: PasswordCredentialsPort,
    private readonly resetTokens: PasswordResetTokensPort,
    private readonly refreshTokens: RefreshTokensPort,
    private readonly hasher: PasswordHasher,
    private readonly mail: MailPort,
    private readonly links: PasswordLinks,
    /** Ten sam egzemplarz, co logowanie hasłem - klucze rozróżnia przedrostek. */
    private readonly limiter: AttemptLimiter,
    private readonly clock: Clock,
    /** Identyfikator NOWEJ osoby z rejestracji e-mailem. */
    private readonly newId: () => string,
  ) {}

  /**
   * „Nie pamiętam hasła" - zawsze kończy się tak samo. List wychodzi, gdy osoba z tym
   * adresem istnieje i limit wysyłek nie jest wyczerpany; w każdym innym przypadku
   * nic się nie dzieje i nic tego nie zdradza.
   */
  async forgot(email: string, ip: string | null): Promise<void> {
    const address = normalizeEmail(email);
    if (!this.sendAllowed(address, ip)) return;

    const account = await this.pilots.findByEmail(address);
    if (account?.email == null) return;

    const link = await this.issueSelfLink(account, account.email);
    await this.mail.send(resetMail(link, this.clock.now()));
  }

  /**
   * „Załóż konto" (00H) - zawsze kończy się tak samo, list zależy od adresu: wolny →
   * `signup` z adresem i imieniem; zajęty → reset ze zdaniem „masz już konto".
   */
  async signUp(name: string, email: string, ip: string | null): Promise<void> {
    const address = normalizeEmail(email);
    if (!this.sendAllowed(address, ip)) return;

    const existing = await this.pilots.findByEmail(address);
    if (existing != null) {
      if (existing.email == null) return;
      const link = await this.issueSelfLink(existing, existing.email);
      await this.mail.send(existingAccountMail(link, this.clock.now()));
      return;
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + RESET_LINK_TTL_MS);
    const issued = await this.db.transaction((tx) =>
      this.resetTokens.issue(tx, { kind: 'signup', email: address, displayName: name.trim(), now, expiresAt }),
    );
    await this.mail.send(
      signupMail({ to: address, url: this.links.resetUrl(issued.token), expiresAt, displayName: name.trim() }, now),
    );
  }

  /**
   * Realizacja linku ze strony `/haslo/`. Token obcy, przeterminowany i zużyty dają
   * JEDNO `invalid_token`; słabe hasło oddaje powód i NIE zużywa tokenu.
   */
  async resetByLink(token: string, password: string): Promise<ResetByLinkOutcome> {
    const now = this.clock.now();
    const view = await this.resetTokens.peek(token, now);
    if (view == null) return { ok: false, reason: 'invalid_token' };

    // Polityka z kontekstem OSOBY: przy `reset` znamy ją z bazy, przy `signup` z tokenu.
    const account = view.kind === 'reset' ? await this.pilots.findById(view.pilotId) : null;
    if (view.kind === 'reset' && account == null) return { ok: false, reason: 'invalid_token' };
    const context =
      view.kind === 'reset'
        ? { email: account!.email, name: account!.name }
        : { email: view.email, name: view.displayName };
    const weakness = checkPassword(password, context);
    if (weakness != null) return { ok: false, reason: 'weak_password', weakness };

    // Skrót PRZED transakcją: ~100 ms scryptu nie ma po co trzymać połączenia.
    const hash = await this.hasher.hash(password);

    const done = await this.db.transaction(async (tx) => {
      const consumed = await this.resetTokens.consume(tx, token, now);
      if (consumed == null) return false;

      const pilotId =
        consumed.kind === 'reset'
          ? consumed.pilotId
          : (await this.pilots.insertPerson(tx, { id: this.newId(), name: consumed.displayName, email: consumed.email }))
              .pilotId;

      await this.credentials.upsert(tx, { pilotId, hash, setVia: 'link', at: now });
      // Reset zakłada, że stare hasło mogło wyciec: WSZYSTKIE sesje osoby giną - refreshe
      // telefonu z tabeli, sesje panelu i token osoby przez stempel unieważnienia.
      await this.refreshTokens.revokeAllOf(tx, pilotId);
      await this.pilots.revokeCredentials(tx, pilotId, now);
      return true;
    });
    return done ? { ok: true } : { ok: false, reason: 'invalid_token' };
  }

  /**
   * Ustawienie albo zmiana hasła przez zalogowanego (13B, `#/konto`). `current` jest
   * wymagane WYŁĄCZNIE, gdy hasło już jest - osoba z Googlem ustawia pierwsze bez niego.
   */
  async change(pilotId: string, current: string | null, next: string): Promise<ChangePasswordOutcome> {
    const account = await this.pilots.findById(pilotId);
    if (account == null) return { ok: false, reason: 'invalid_credentials' };
    if (account.email == null) return { ok: false, reason: 'email_required' };

    const existing = await this.credentials.find(pilotId);
    if (existing != null) {
      const verdict = this.limiter.attempt([{ key: `password:change:${pilotId}`, limit: CHANGE_ATTEMPTS_PER_PERSON }]);
      if (!verdict.allowed) {
        return { ok: false, reason: 'rate_limited', retryAfterSec: Math.ceil(verdict.retryAfterMs / 1000) };
      }
      if (current == null || !(await this.hasher.verify(current, existing.hash))) {
        return { ok: false, reason: 'invalid_credentials' };
      }
    }

    const weakness = checkPassword(next, { email: account.email, name: account.name });
    if (weakness != null) return { ok: false, reason: 'weak_password', weakness };

    const now = this.clock.now();
    const hash = await this.hasher.hash(next);
    await this.db.transaction((tx) => this.credentials.upsert(tx, { pilotId, hash, setVia: 'self', at: now }));
    // Hak H-C (issue #133): tu wejdzie unieważnienie pozostałych sesji osoby poza bieżącą
    // (`login_sessions` + `sid` z żądania). Bez `sid` nie ma jak odróżnić bieżącej.
    return { ok: true };
  }

  /**
   * Link dla wyzwalacza Z PANELU albo Z KONSOLI (`admin`, `platform`, `cli`) - w CUDZEJ
   * transakcji, bo wpis audytu idzie razem z tokenem. List wysyła potem `deliver`
   * (po commicie: awaria poczty nie ma prawa cofnąć wpisu, a wpis bez listu jest
   * prawdą - token istnieje). `EmailRequired`: osoba bez adresu nie ma dokąd dostać
   * listu - tu wolno to powiedzieć wprost, pyta zalogowany administrator.
   */
  async issueLink(
    tx: Queryable,
    input: {
      /** Osoba i jej adres - odczytane PRZEZ WOŁAJĄCEGO w tej samej transakcji (`byId` członka, administratorzy klubu). */
      pilotId: string;
      email: string | null;
      triggeredBy: Exclude<ResetTrigger, 'self'>;
      createdBy: string | null;
      ttlMs: number;
    },
  ): Promise<IssuedLink> {
    if (input.email == null) throw new EmailRequired();
    if (input.triggeredBy !== 'cli') {
      const verdict = this.limiter.attempt([
        { key: `password:admin-send:${input.pilotId}`, limit: ADMIN_SEND_PER_PERSON },
      ]);
      if (!verdict.allowed) throw new AdminSendLimited(Math.ceil(verdict.retryAfterMs / 1000));
    }
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + input.ttlMs);
    const issued = await this.resetTokens.issue(tx, {
      kind: 'reset',
      pilotId: input.pilotId,
      triggeredBy: input.triggeredBy,
      createdBy: input.createdBy,
      now,
      expiresAt,
    });
    return { ...issued, url: this.links.resetUrl(issued.token), to: input.email };
  }

  /** List do wydanego linku: reset (administrator) albo zaproszenie z nazwą klubu (platforma). */
  async deliver(link: IssuedLink, invite: { clubName: string } | null): Promise<void> {
    const now = this.clock.now();
    await this.mail.send(
      invite == null ? resetMail(link, now) : inviteMail({ ...link, clubName: invite.clubName }, now),
    );
  }

  /** Token `self` dla istniejącej osoby - wspólne dla `forgot` i `signUp` na zajęty adres. */
  private async issueSelfLink(account: PilotAccount, to: string): Promise<IssuedLink> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + RESET_LINK_TTL_MS);
    const issued = await this.db.transaction((tx) =>
      this.resetTokens.issue(tx, { kind: 'reset', pilotId: account.id, triggeredBy: 'self', createdBy: null, now, expiresAt }),
    );
    return { ...issued, url: this.links.resetUrl(issued.token), to };
  }

  /** Limit WYSYŁKI - liczony także dla adresów nieznanych, żeby odpowiedź była jedna. */
  private sendAllowed(address: string, ip: string | null): boolean {
    return this.limiter.attempt([
      { key: `password:send:${address}`, limit: SEND_PER_ADDRESS },
      { key: `password:send-ip:${ip ?? 'unknown'}`, limit: SEND_PER_IP },
    ]).allowed;
  }
}
