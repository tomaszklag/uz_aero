/**
 * Ninerdeck (serwer) - DOŁĄCZANIE DO KLUBU KODEM (`POST /auth/join`; wielofirmowość
 * §3.8 i §5, decyzja właściciela 2026-09-09, issue #100).
 *
 * Jedyna droga do klubu: pilot loguje się Googlem, wpisuje kod klubu (00E, albo 13A
 * z klubu, w którym już jest) i dostaje członkostwo `pending`. Wejście jest ZAWSZE
 * decyzją administratora klubu - kod nie daje dostępu, daje zgłoszenie do rozpatrzenia.
 * Dlatego ta komenda pisze poza panelem i poza audytem: to akcja pilota o jego własnym
 * zgłoszeniu, a ślad audytu powstaje przy decyzji (epik D2).
 *
 * ══ JEDNA ODPOWIEDŹ NA TRZY STANY KLUBU ══
 * Kod nieznany, klub z wyłączonym dołączaniem (`join_code = NULL`) i klub nieaktywny
 * dają to samo `unknown_code`: żaden z tych stanów nie ma powodu się ujawniać, a pilot
 * i tak nie ma na nie innej odpowiedzi niż „zapytaj w klubie o kod".
 *
 * ══ OGRANICZENIE TEMPA PRZED CZYMKOLWIEK ══
 * Kod wisi w hangarze i krąży po grupach, więc wycieknie - skutkiem jest najwyżej
 * zgłoszenie. Ograniczenie broni przed ZGADYWANIEM: 10 prób na osobę i 30 na adres IP
 * w 15 minut, udane i nieudane razem; przekroczenie → `429` z czasem odczekania, który
 * aplikacja pisze jako powód w przycisku. Liczy się PRZED odczytem klubu, żeby próba
 * z kodem zmyślonym kosztowała tyle samo, co z prawdziwym.
 */

import { credentialsRevoked } from '../../../domain/credentials.ts';
import { normalizeClubCode } from '../../../domain/clubCode.ts';
import {
  clubsView,
  type ClubsView,
  type OrgRef,
  type PersonRequest,
} from '../../common/commands/auth.ts';
import type { Clock, PilotsPort } from '../../common/ports.ts';
import type { AttemptLimiter } from '../attemptLimiter.ts';
import type { ClubJoinPort } from '../ports.ts';

/** Okno ograniczenia tempa (§3.8): 15 minut. */
export const JOIN_WINDOW_MS = 15 * 60_000;
/** Próby na OSOBĘ w oknie - pilot, który pomyli się kilka razy, nie zostaje odcięty. */
export const JOIN_LIMIT_PER_PERSON = 10;
/** Próby na ADRES IP w oknie - kilku pilotów za jednym NAT-em w hangarze. */
export const JOIN_LIMIT_PER_IP = 30;

export type JoinOutcome =
  /** Zgłoszenie czeka (`202`) - także wtedy, gdy czekało już przed tym wywołaniem. */
  | { ok: true; org: OrgRef; clubs: ClubsView }
  /** Osoba zablokowana platformowo albo poświadczenie starsze niż unieważnienie. */
  | { ok: false; reason: 'account_disabled' }
  | { ok: false; reason: 'rate_limited'; retryAfterSec: number }
  /** Kod nieznany = wyłączony = klub nieaktywny = wpis w złym kształcie. */
  | { ok: false; reason: 'unknown_code' }
  /** Decyzja zapadła - ponowny kod jej nie obchodzi; cofnąć ją może wyłącznie klub. */
  | { ok: false; reason: 'rejected'; org: OrgRef; rejectReason: string | null; decidedAt: Date | null }
  | { ok: false; reason: 'already_member'; org: OrgRef }
  | { ok: false; reason: 'membership_disabled'; org: OrgRef };

export class JoinCommands {
  constructor(
    private readonly pilots: PilotsPort,
    private readonly clubs: ClubJoinPort,
    private readonly limiter: AttemptLimiter,
    private readonly clock: Clock,
  ) {}

  async joinByCode(person: PersonRequest, rawCode: string, ip: string | null): Promise<JoinOutcome> {
    const account = await this.pilots.findById(person.pilotId);
    if (
      account == null ||
      !account.active ||
      credentialsRevoked(account.credentialsValidFrom, person.issuedAt)
    ) {
      return { ok: false, reason: 'account_disabled' };
    }

    const keys = [{ key: `person:${account.id}`, limit: JOIN_LIMIT_PER_PERSON }];
    if (ip != null) keys.push({ key: `ip:${ip}`, limit: JOIN_LIMIT_PER_IP });
    const verdict = this.limiter.attempt(keys);
    if (!verdict.allowed) {
      return { ok: false, reason: 'rate_limited', retryAfterSec: Math.ceil(verdict.retryAfterMs / 1000) };
    }

    const code = normalizeClubCode(rawCode);
    const club = code == null ? null : await this.clubs.findByCode(code);
    if (club == null || !club.active) return { ok: false, reason: 'unknown_code' };

    const org: OrgRef = { id: club.id, slug: club.slug, name: club.name };
    const attempt = await this.clubs.join(club.id, account.id, this.clock.now());
    switch (attempt.status) {
      case 'pending':
        return { ok: true, org, clubs: clubsView(await this.pilots.memberships(account.id), { name: account.name, email: account.email }) };
      case 'rejected':
        return {
          ok: false,
          reason: 'rejected',
          org,
          rejectReason: attempt.rejectReason,
          decidedAt: attempt.decidedAt,
        };
      case 'active':
        return { ok: false, reason: 'already_member', org };
      case 'disabled':
        return { ok: false, reason: 'membership_disabled', org };
    }
  }
}
