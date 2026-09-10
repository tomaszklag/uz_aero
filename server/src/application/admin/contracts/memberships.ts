/**
 * UZ Aero (serwer) - KONTRAKT kolejki zgłoszeń kodem klubu (mockupy `piloci-lista`
 * - karta ZGŁOSZENIA, `piloci-zgloszenie` - decyzja; `docs/wielofirmowosc.md` §8.3).
 *
 * Pliki w `contracts/` zawierają WYŁĄCZNIE typy i wolno im importować wyłącznie
 * `@uzaero/domain` oraz siebie nawzajem (pilnuje `test/architecture.test.ts`).
 *
 * ══ OSOBNY KONTRAKT OD `pilots.ts`, BO TO INNY BYT NA EKRANIE ══
 * `AdminPilotListItem` opisuje CZŁONKA klubu - ma kod pilota, rolę i dni lotne. Wiersz
 * kolejki opisuje KANDYDATA: nie ma kodu (nadaje się go dopiero przy zatwierdzeniu),
 * nie ma roli i nie ma czego liczyć w dniach lotnych. Wspólny typ z polami nullowalnymi
 * kazałby obu ekranom pytać „a czy to już członek", a karta ZGŁOSZENIA stoi nad listą
 * właśnie po to, żeby tego pytania nie było.
 */

import type { MembershipStatusWire } from './organizations.ts';
import type { PilotRoleWire } from './pilots.ts';

/**
 * Jedno zgłoszenie w kolejce klubu.
 *
 * Imię i adres pochodzą z konta GOOGLE - osoba założyła się sama przy pierwszym
 * logowaniu (`docs/wielofirmowosc.md` §4), więc administrator czyta to, co podał
 * dostawca, i na tym opiera decyzję. `email` jest nullowalny, bo kolumna osoby jest
 * nullowalna (konta z backfillu 1.x), choć zgłoszenie kodem adres zawsze niesie.
 */
export interface AdminMembershipRequest {
  /** Identyfikator OSOBY - adres decyzji (`POST /memberships/:pilotId/approve`). */
  pilotId: string;
  name: string;
  email: string | null;
  /** ISO 8601 UTC - „czeka od" na karcie ZGŁOSZENIA. */
  requestedAt: string;
}

/**
 * Kolejka bez licznika i bez kursora: `items.length` JEST liczbą w tytule karty
 * („Zgłoszenia kodem klubu · 2"), a druga liczba w odpowiedzi mogłaby się z nią
 * rozjechać. Karta nad listą nie ma gdzie pokazać drugiej strony.
 */
export interface AdminMembershipQueue {
  items: AdminMembershipRequest[];
}

/**
 * Stan członkostwa PO decyzji - odpowiedź odrzucenia i cofnięcia odrzucenia.
 *
 * Zatwierdzenie oddaje co innego (`AdminPilotListItem`): wpuszczony kandydat jest odtąd
 * wierszem LISTY, a nie kolejki, i panel ma go dostać w kształcie, w jakim go pokaże.
 */
export interface AdminMembershipDecision {
  pilotId: string;
  status: MembershipStatusWire;
  /** ISO 8601 UTC; `null` po cofnięciu odrzucenia - zgłoszenie znów czeka. */
  decidedAt: string | null;
  /** Powód, który pilot czyta na 00D; `null` poza stanem `rejected`. */
  rejectReason: string | null;
}

/** Zatwierdzenie: kod pilota W TYM klubie i rola. Oba wymagane - aktywny ⟺ ma kod. */
export interface AdminMembershipApproval {
  code: string;
  role: PilotRoleWire;
}
