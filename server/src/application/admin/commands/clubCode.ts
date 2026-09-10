/**
 * UZ Aero (serwer) - KOD KLUBU: generowanie, rotacja i wyłączenie dołączania
 * (panel klubu, mockup `piloci-kod-klubu`; `docs/wielofirmowosc.md` §3.8, §8.3;
 * issue #100, D2).
 *
 * Kod klubu jest JEDYNĄ drogą do klubu, więc te dwie komendy są jedynym włącznikiem
 * i wyłącznikiem tej drogi:
 *  • `rotate` - nowy kod od razu; poprzedni przestaje działać w tej samej chwili.
 *    Zgłoszeń JUŻ ZŁOŻONYCH to nie dotyczy - są wierszami `memberships`, nie kodem;
 *  • `disable` - `join_code = NULL`, po czym serwer odpowiada na każdy kod tego klubu
 *    „nie znam takiego kodu", tak samo jak na kod zmyślony. Do klubu nie wchodzi wtedy
 *    NIKT, bo innej drogi nie ma. Ponowne `rotate` włącza drogę z powrotem.
 *
 * ══ POWTARZANIE PRÓBY JEST NA ZEWNĄTRZ TRANSAKCJI I MUSI BYĆ ══
 * `organizations.join_code` jest jedyny na SERWERZE, więc zderzenie z kodem innego klubu
 * jest możliwe (przy 32⁷ ≈ 3,4·10¹⁰ - teoretycznie) i kończy się błędem unikalności.
 * Po takim błędzie transakcja Postgresa jest ODRZUCONA: kolejne zapytanie w jej środku
 * dostałoby „current transaction is aborted", więc losowanie ponowne MUSI startować nową
 * transakcję. Stąd pętla wokół `write.run`, a nie w jego wnętrzu - a nieudana próba nie
 * zostawia po sobie ani kodu, ani wpisu w dzienniku.
 *
 * Konstruktor bez `Database`/`Queryable` - komenda nie ma jak zapisać z pominięciem
 * śladu audytu (`auditedWrite.ts`, `test/architecture.test.ts`).
 */

import { CLUB_CODE_LENGTH, clubCodeFrom, formatClubCode } from '../../../domain/clubCode.ts';
import type { Clock } from '../../common/ports.ts';
import type { AuditedWrite } from '../auditedWrite.ts';
import { uniqueConflictOn } from './uniqueConflict.ts';
import type { Actor, ClubCodeAdminPort, ClubCodeState } from '../ports.ts';

/**
 * Ile razy losujemy, gdy kod zderzy się z kodem innego klubu.
 *
 * Pięć, bo szansa na pierwsze zderzenie przy kilkuset klubach jest rzędu 10⁻⁸, a na
 * pięć z rzędu - nie istnieje w sensie praktycznym. Wyczerpanie prób jest więc nie
 * „pechem do obsłużenia", tylko awarią generatora losowego i ma być GŁOŚNE (500),
 * a nie odmową z powodem, którego administrator nie umiałby naprawić.
 */
const DRAW_ATTEMPTS = 5;

export type ClubCodeOutcome =
  | { ok: true; result: ClubCodeState }
  /** Wyłączenie kodu, którego nie ma - panel nie ma czego pokazać jako zmianę. */
  | { ok: false; reason: 'no_changes' };

export class AdminClubCodeCommands {
  constructor(
    private readonly write: AuditedWrite,
    private readonly clubCode: ClubCodeAdminPort,
    /**
     * Losowe bajty jako FUNKCJA w konstruktorze, nie port: nie ma tu adaptera do
     * podmiany (composition root podaje `randomBytes` z `node:crypto`), a port bez
     * drugiej implementacji to koszt bez zysku - ta sama decyzja, co przy `newId`
     * w `commands/pilots.ts`. Test podstawia tablicę ustaloną ręką i dzięki temu
     * sprawdza wygenerowany kod co do znaku.
     */
    private readonly randomBytes: (count: number) => Uint8Array,
    private readonly clock: Clock,
  ) {}

  /** Nowy kod klubu - także wtedy, gdy dołączanie było wyłączone (wtedy je włącza). */
  async rotate(actor: Actor): Promise<ClubCodeOutcome> {
    for (let attempt = 1; attempt <= DRAW_ATTEMPTS; attempt += 1) {
      const code = clubCodeFrom(this.randomBytes(CLUB_CODE_LENGTH));
      try {
        const result = await this.write.run(actor, async (tx) => {
          const before = await this.clubCode.state(tx, actor.orgId);
          const at = this.clock.now();
          await this.clubCode.setCode(tx, actor.orgId, code, at);

          return {
            // Liczba zgłoszeń czekających TYM kodem jest po rotacji zerowa z definicji
            // (`created_at >= since`, a `since` to właśnie `at`) - nie pytamy o nią bazy
            // drugi raz, bo odpowiedź jest własnością operacji, nie stanu tabeli.
            result: { code, since: at, pendingWithCode: 0 } satisfies ClubCodeState,
            audit: {
              action: 'club_code.rotate' as const,
              targetType: 'organization',
              targetId: actor.orgId,
              // OBA kody: nowy (żeby dało się odtworzyć, który obowiązywał kiedy)
              // i poprzedni (żeby pytanie „dlaczego kod, który mi podali, nie działa"
              // miało odpowiedź). Kod nie jest sekretem - daje wyłącznie zgłoszenie.
              details: { code: formatClubCode(code), previous: previousOf(before) },
            },
          };
        });

        return { ok: true, result };
      } catch (err) {
        // Zderzenie z kodem INNEGO klubu: losujemy ponownie, nową transakcją.
        if (uniqueConflictOn(err, ['join_code'] as const) != null && attempt < DRAW_ATTEMPTS) {
          continue;
        }
        throw err;
      }
    }

    throw new Error(`nie udało się wylosować wolnego kodu klubu w ${DRAW_ATTEMPTS} próbach`);
  }

  /** Wyłączenie dołączania kodem. Zgłoszenia już złożone zostają w kolejce. */
  async disable(actor: Actor): Promise<ClubCodeOutcome> {
    try {
      const result = await this.write.run(actor, async (tx) => {
        const before = await this.clubCode.state(tx, actor.orgId);
        // Wyłączenie wyłączonego zostawiłoby w dzienniku wpis o niczym - ta sama reguła,
        // co `no_changes` przy koncie (`commands/pilots.ts`).
        if (before.code == null) throw new NoChanges();

        await this.clubCode.setCode(tx, actor.orgId, null, this.clock.now());

        return {
          result: { code: null, since: null, pendingWithCode: 0 } satisfies ClubCodeState,
          audit: {
            action: 'club_code.disable' as const,
            targetType: 'organization',
            targetId: actor.orgId,
            // Wyłączony kod przestaje istnieć w tabeli, więc ten wpis jest jedynym
            // miejscem, z którego widać, co dokładnie zgasło.
            details: { previous: formatClubCode(before.code) },
          },
        };
      });

      return { ok: true, result };
    } catch (err) {
      if (err instanceof NoChanges) return { ok: false, reason: 'no_changes' };
      throw err;
    }
  }
}

/** Poprzedni kod w zapisie kanonicznym albo `null` (dołączanie było wyłączone). */
function previousOf(state: ClubCodeState): string | null {
  return state.code == null ? null : formatClubCode(state.code);
}

/** Przerwanie transakcji - patrz `commands/pilots.ts`. Poza ten plik nie wychodzi. */
class NoChanges extends Error {}
