/**
 * Ninerdeck (testy serwera) - JEDNO miejsce tworzące bazę w procesie.
 *
 * Powód: od migracji 11 schemat wymaga rozszerzenia `btree_gist` (ograniczenie
 * wykluczające na zakresach czasu w `bookings`, `docs/rezerwacje.md` §3.2), a PGlite
 * NIE ładuje rozszerzeń contrib samo z siebie - trzeba je podać w konstruktorze, inaczej
 * `CREATE EXTENSION` odpowiada „extension is not available" i wywraca migracje.
 *
 * Do tej pory każdy plik testowy pisał `new PGlite()` u siebie (pięć miejsc). Dopisanie
 * rozszerzenia w czterech z nich i przeoczenie piątego dałoby test, który wywraca się
 * dopiero przy pełnym przebiegu i wygląda na problem z izolacją, a nie z brakiem
 * rozszerzenia - dlatego konstruktor ma odtąd jeden adres.
 */

import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

/** Baza testowa z kompletem rozszerzeń, których wymaga schemat produkcyjny. */
export function newPglite(): PGlite {
  return new PGlite({ extensions: { btree_gist } });
}
