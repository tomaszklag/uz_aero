/**
 * Ninerdeck - PROGI REZERWACJI (milestone 3.0.0, `docs/rezerwacje.md` §4.1, §7).
 *
 * ══ WSZYSTKIE WARTOŚCI SĄ DO KALIBRACJI ══
 * Bazowe pochodzą z rozumowania o tym, jak wygląda sobota w klubie - nie z danych.
 * Kalibrujemy je po pierwszym sezonie, tą samą metodą co progi detekcji
 * (`docs/algorytm-detekcji.md` §15: „progów NIE stroimy na wyczucie") i progi
 * analityki zużycia (`consumption/policy.ts`). Nie stroimy ich w dyskusji.
 *
 * Plik jest w `packages/domain`, bo te same liczby obowiązują serwer (zadanie okresowe
 * zwalniania slotów) i telefon (sugestie slotów liczone offline z cache'owanych
 * zajętości). Dwie kopie rozjechałyby się przy pierwszej kalibracji.
 */

const MINUTE_MS = 60_000;

/**
 * Po ilu minutach od POCZĄTKU rezerwacji slot zwalnia się sam, gdy nikt po maszynę
 * nie przyszedł (§4.1).
 *
 * Godzina jest kompromisem między dwoma błędami. Za krótko: pilot spóźniony na korek
 * traci termin, po który zaraz przyjdzie. Za długo: maszyna stoi w sobotę bezczynnie
 * do końca cudzego slotu, a to jest dokładnie ten problem, dla którego reguła powstała.
 */
export const RELEASE_AFTER_MS = 60 * MINUTE_MS;

/**
 * Ziarno sugestii slotów - propozycje padają na pełne kwadranse (§7).
 *
 * Minuta dawałaby setki kandydatów różniących się niczym; pół godziny gubiłoby lot,
 * który naprawdę trwa 45 minut.
 */
export const SLOT_GRAIN_MS = 15 * MINUTE_MS;

/**
 * Najkrótsza RESZTKA, która jeszcze do czegoś służy. Dziura krótsza od tej wartości
 * jest w ocenie upakowania karana - to jest cała treść reguły „jak w kinie" (§7).
 *
 * Czterdzieści pięć minut to krąg nad lotniskiem z przygotowaniem maszyny; poniżej
 * nie zmieści się nic sensownego, więc dziura tej długości jest stratą dnia.
 */
export const MIN_USEFUL_SLOT_MS = 45 * MINUTE_MS;
