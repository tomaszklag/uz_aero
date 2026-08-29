/**
 * UZ Aero - panel: MUTACJE konfiguracji floty (`A07`, `A07a`).
 *
 * **Mutacja deklaruje swoje unieważnienia TUTAJ, nie na ekranie**
 * (`docs/architektura-panelu-frontend.md` §4.3).
 *
 * Co się zmienia po każdej z nich:
 *  • **lista floty** - skład (nowa jednostka), konfiguracja i próg flagi;
 *  • **listy dni** - wiersz `A02` niesie `reg`, typ i `mhFormat` samolotu, więc zmiana
 *    rejestracji albo formatu licznika przemalowuje kolumny „Samolot" i „MH" w każdym
 *    otwartym obok widoku dni; bez tego unieważnienia lista pokazywałaby stary format
 *    licznika do najbliższego odświeżenia strony;
 *  • **dziennik audytu** - `AuditedWrite` dopisał wpis TĄ SAMĄ transakcją, więc `A09`
 *    otwarty obok jest nieaktualny dokładnie od tej chwili;
 *  • **pulpit** - unieważnia go każda mutacja panelu, bo alternatywą jest plakietka
 *    kłamiąca zaraz po zmianie.
 *
 * Czego tu NIE MA:
 *  • **unieważnienia progu** (`keys.fleet.tolerance`). Odpowiedź „1100 L → 55 L" jest
 *    funkcją czystą i nie starzeje się od zapisu - unieważnianie jej kazałoby serwerowi
 *    policzyć drugi raz to samo. **To zdanie było nieprawdziwe do 2026-08-01**: kod
 *    unieważniał `keys.fleet.all`, a `invalidateQueries` dopasowuje PREFIKSOWO, więc
 *    próg leciał razem z listami - i to w chwili, gdy jego zapytanie jest aktywne, bo
 *    szuflada zapisu stoi otwarta. Wybraliśmy zawężenie unieważnienia, a nie poprawienie
 *    komentarza: komentarz opisywał zachowanie SŁUSZNE, więc tańsze było doprowadzenie
 *    kodu do niego niż spisanie marnotrawstwa jako reguły. Stąd `keys.fleet.lists`
 *    i brak korzenia `keys.fleet.all` (uzasadnienie przy kluczu).
 *  • **aktualizacji optymistycznych.** Serwer odmawia zmian, których panel nie umie
 *    przewidzieć (zajęta rejestracja, otwarta sesja), więc optymistyczny UI musiałby
 *    się z tego wycofywać i tłumaczyć. Przycisk pokazuje stan zajęty, UI przyjmuje
 *    odpowiedź serwera.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { AircraftChangeDto } from '../api/dto';
import {
  createAircraft,
  updateAircraft,
  type CreateAircraftBody,
  type UpdateAircraftBody,
} from '../api/fleet';
import { keys } from './keys';

/**
 * Eksportowana, żeby dało się ją sprawdzić na PRAWDZIWYM `QueryClient` bez renderu -
 * „czego ta mutacja NIE unieważnia" jest własnością kluczy, nie ekranu, więc test na
 * atrapie sieci byłby testem atrapy, a test przez UI testowałby React.
 */
export function invalidateFleet(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: keys.fleet.lists });
  void qc.invalidateQueries({ queryKey: keys.sessions.all });
  void qc.invalidateQueries({ queryKey: keys.audit.all });
  void qc.invalidateQueries({ queryKey: keys.dashboard });
}

export function useCreateAircraft() {
  const qc = useQueryClient();
  return useMutation<AircraftChangeDto, unknown, CreateAircraftBody>({
    mutationFn: (body) => createAircraft(body),
    onSuccess: () => invalidateFleet(qc),
  });
}

export interface UpdateAircraftInput {
  id: string;
  body: UpdateAircraftBody;
}

export function useUpdateAircraft() {
  const qc = useQueryClient();
  return useMutation<AircraftChangeDto, unknown, UpdateAircraftInput>({
    mutationFn: ({ id, body }) => updateAircraft(id, body),
    onSuccess: () => invalidateFleet(qc),
  });
}
