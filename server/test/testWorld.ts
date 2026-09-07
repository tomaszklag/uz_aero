/**
 * UZ Aero (serwer, testy) - świat referencyjny harnessu: 4 samoloty i 5 kont.
 *
 * Do issue #50 ten scenariusz zakładał produkcyjny seed (`infrastructure/pg/seed.ts`)
 * i był wspólny z zaślepką telefonu. Produkcyjny seed stawia odtąd wyłącznie konto
 * administratora, więc scenariusz mieszka TU: testy dalej stoją na SP-AXA (wolny),
 * SP-FGK (zajmowany przez KRZ), SP-ANK (An-2 z wymogiem Duala) i SP-KWA (wyłączony)
 * oraz na kontach TMK/AKO/PWI/JSE/KRZ - a zmiany bootstrapu wdrożenia ich nie ruszają.
 *
 * Świeża PGlite na harness ⇒ zwykłe INSERTy, bez upsertu produkcyjnego seeda.
 */

import type { Queryable } from '../src/application/common/ports.ts';

/** Konfiguracje zgodne z §5.4 (pojemność, format MH, wymóg Duala). */
const AIRCRAFT = [
  ['SP-AXA', 'SP-AXA', 'Cessna 182', 2019, 330, 'hhmm', false, 'active'],
  ['SP-FGK', 'SP-FGK', 'Cessna 182', 2017, 330, 'hhmm', false, 'active'],
  ['SP-ANK', 'SP-ANK', 'Antonov An-2', 1984, 1700, 'hhmm', true, 'active'],
  ['SP-KWA', 'SP-KWA', 'Cessna 172', 2021, 200, 'decimal', false, 'disabled'],
] as const;

/**
 * DWA konta z wejściem do panelu i trzej zwykli piloci.
 *
 * AKO był szefem wyszkolenia do wycofania tej roli 2026-08-30 i schodzi na `admin`,
 * a nie na `pilot`, bo tak ocaleje najwięcej przypadków: odmowy „konto bez zdolności X"
 * dowodzi odtąd token zwykłego pilota (PWI/JSE/KRZ, brama pyta o ZDOLNOŚĆ, nie o wejście
 * do panelu), a drugiego konta panelowego nie da się niczym zastąpić tam, gdzie przekrój
 * potrzebuje DWÓCH ludzi przy biurku - cudza sesja panelu, wyścig o flagę, aktor
 * dziennika audytu inny niż wykonawca.
 */
/**
 * EKSPORTOWANE od 2026-09-04, bo `helpers.ts` buduje z tej listy fałszywego dostawcę
 * tożsamości: token testowy musi nieść DOKŁADNIE ten e-mail, co konto, inaczej nie
 * zadziała podpięcie po zweryfikowanym adresie (`docs/logowanie-google.md` §6) - czyli
 * ta sama droga, którą w produkcji wchodzą dotychczasowi piloci. Druga lista adresów
 * rozjechałaby się przy pierwszej zmianie i testy logowania przestałyby cokolwiek znaczyć.
 */
export const TEST_PILOTS = [
  ['TMK', 'TMK', 'Tomasz Małkiewicz', 'tomasz@uzaero.pl', 'admin'],
  ['AKO', 'AKO', 'Anna Kowalska', 'anna@uzaero.pl', 'admin'],
  ['PWI', 'PWI', 'Piotr Wiśniewski', 'piotr@uzaero.pl', 'pilot'],
  ['JSE', 'JSE', 'Jan Serafin', 'jan@uzaero.pl', 'pilot'],
  ['KRZ', 'KRZ', 'Krzysztof Zieliński', 'krzysztof@uzaero.pl', 'pilot'],
] as const;

const PILOTS = TEST_PILOTS;

export async function seedTestWorld(db: Queryable): Promise<void> {
  for (const [id, reg, type, year, capacityL, mhFormat, dualRequired, status] of AIRCRAFT) {
    await db.query(
      `INSERT INTO aircraft (id, reg, type, year, capacity_l, mh_format, dual_required, service_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, reg, type, year, capacityL, mhFormat, dualRequired, status],
    );
  }

  // Konta BEZ hasła (2026-09-04): logowanie idzie przez dostawcę zewnętrznego, a testy
  // podstawiają weryfikator tokenu (`TestIdentityProvider` w `helpers.ts`). E-mail jest
  // tu istotny - po nim podpina się konto Google (`docs/logowanie-google.md` §6).
  for (const [id, code, name, email, role] of PILOTS) {
    await db.query(
      `INSERT INTO pilots (id, code, name, email, active, role)
       VALUES ($1, $2, $3, $4, TRUE, $5)`,
      [id, code, name, email, role],
    );
  }
}
