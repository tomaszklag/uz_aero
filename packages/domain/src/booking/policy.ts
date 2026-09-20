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

/**
 * Ile propozycji oddaje sugestia. Cztery, bo to jest WYBÓR, a nie lista wszystkich
 * kwadransów dnia - ta sama liczba i ten sam powód, co przy `MAX_AIRFIELD_SUGGESTIONS`.
 */
export const MAX_SLOT_SUGGESTIONS = 4;

/* ── Wagi oceny upakowania (§7) ────────────────────────────────────────────────
 * Kształt oceny jest DECYZJĄ (kara za resztkę, premia za przyleganie, premia za porę
 * dnia), a te trzy liczby - jej strojeniem. Stoją tu razem z progami, bo razem z nimi
 * pójdą do kalibracji po pierwszym sezonie.
 *
 * Relacja między nimi niesie jedną regułę i warto ją znać przed zmianą: **kara za
 * martwą resztkę jest WIĘKSZA niż premia za jedno przyleganie**. Slot doklejony do
 * cudzej rezerwacji, który zostawia po drugiej stronie pół godziny na nic, psuje dzień
 * bardziej, niż pomaga - i ma przegrać ze slotem stojącym luzem.
 */

/** Za każdą stronę przylegającą do ZAJĘTOŚCI (nie do granicy dnia). */
export const SLOT_ADJACENCY_BONUS = 1;

/** Za każdą powstałą resztkę krótszą niż `MIN_USEFUL_SLOT_MS`. */
export const SLOT_REMNANT_PENALTY = 1.5;

/** Maksimum premii za trafienie w porę dnia, o którą pilot prosił; maleje z odległością. */
export const SLOT_PREFERRED_BONUS = 1;

/*
 * HORYZONTU (jak daleko w przód wolno rezerwować) świadomie TU NIE MA - decyzja
 * właściciela P7 z 2026-09-19: w 3.0.0 nie ma limitów horyzontu ani liczby rezerwacji
 * na pilota. Klub jest mały i zna się nawzajem; limit wpisany zawczasu byłby regułą
 * wymyśloną przed problemem. Lista zadań #159 (C3) wymieniała go, bo powstała przed tą
 * decyzją.
 */

/**
 * Margines zmierzchu CYWILNEGO: o tyle przed wschodem zaczyna się doba lotna i o tyle
 * po zachodzie się kończy (§7.1).
 *
 * Okno nie jest samym wschodem-zachodem i to jest decyzja, nie zaokrąglenie: tak liczy
 * się dzień w lotnictwie VFR i tak wygląda praktyka klubu - ostatni lot ląduje PO
 * zachodzie słońca, a nie przed nim.
 */
export const CIVIL_TWILIGHT_MS = 30 * MINUTE_MS;

/**
 * Okno domyślne dla klubu BEZ lotniska macierzystego (stare wiersze, klub świeżo
 * założony) - godziny liczone w strefie klubu.
 *
 * Brak konfiguracji nie może zablokować rezerwacji: to ta sama zasada, przez którą brak
 * normy zużycia nie blokuje lotu, tylko wyłącza werdykt. Te dwie liczby są jedynym
 * miejscem w module, gdzie stała godzina w ogóle występuje - i istnieją po to, żeby
 * nie występowała nigdzie indziej.
 */
export const DEFAULT_DAY_START_H = 6;
export const DEFAULT_DAY_END_H = 21;
