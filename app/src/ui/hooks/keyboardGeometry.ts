/**
 * UZ Aero - geometria unoszenia pola nad klawiaturę.
 *
 * Osobny plik, bo osobny powód istnienia: to jedyna DECYZJA, jaką podejmuje
 * `useKeyboardAwareScroll`, i jedyna jego część sprawdzalna bez urządzenia. Hook obok
 * importuje `react-native` (zdarzenia klawiatury, `TextInput.State`), a testy w tym
 * projekcie są RN-free z założenia (`jest.config.js`) - arytmetyka musi więc mieszkać
 * tam, gdzie Jest ją widzi.
 *
 * HISTORIA POMYŁEK (warta zapamiętania, bo kosztowała trzy tury zgłoszenia):
 *
 *  1. Pierwsza wersja mieszała UKŁADY WSPÓŁRZĘDNYCH: dolna krawędź pola z `measureInWindow`
 *     (układ okna) kontra górna krawędź klawiatury z `endCoordinates.screenY` (układ ekranu).
 *     Wynik zaniżony o wysokość status bara - pole wyjeżdżało tylko do połowy.
 *  2. Druga liczyła poprawnie, w układzie treści listy, ale opierała się na `measureLayout`
 *     względem widoku wewnętrznego `ScrollView`. Na Fabric (domyślna architektura od
 *     Expo SDK 54) ta metoda wymaga REFERENCJI węzła nadrzędnego i przy czymkolwiek innym
 *     wypisuje „ref.measureLayout must be called with a ref to a native component", nic nie
 *     mierząc - więc dociąganie pola nie działało wcale, a pilot dostawał czerwony błąd
 *     w konsoli i toast nad arkuszem.
 *
 * Stąd wersja trzecia: DWA pomiary `measureInWindow` - pola i samej listy - czyli jeden
 * układ współrzędnych i żadnej referencji do węzła nadrzędnego. Dolna krawędź listy jest
 * już po skróceniu ekranu o klawiaturę (`Screen` + `useKeyboardHeight`), więc pokrywa się
 * z górną krawędzią klawiatury - o nią właśnie chodzi. Wynik jest PRZESUNIĘCIEM względem
 * bieżącego przewinięcia; `onScroll` (throttle 16 ms) trzyma je świeże.
 */

/**
 * Zapas pod dolną krawędzią pola. Pole ma być widoczne z powietrzem wokół, a nie
 * stykać się z klawiaturą pikselem - przy zerze input wygląda jak wciśnięty pod nią.
 * Przy 24 dp widać jeszcze początek podpowiedzi pod polem (`TextField hint`).
 */
export const KEYBOARD_CLEARANCE = 24;

/**
 * Nierealna wysokość klawiatury - powyżej tego udziału okna traktujemy pomiar jako
 * artefakt układu współrzędnych, nie jako klawiaturę. Najwyższe klawiatury z paskiem
 * podpowiedzi zajmują około połowy ekranu telefonu.
 */
const MAX_KEYBOARD_FRACTION = 0.6;

/**
 * Ile dolnej krawędzi OKNA zasłania klawiatura - tyle miejsca musi zostawić arkusz.
 *
 * Zdarzenie klawiatury podaje dwie miary tego samego: `height` (wysokość samej
 * klawiatury) i `screenY` (jej górna krawędź). Zwykle są zgodne, ale nie na Androidzie
 * rysującym edge-to-edge (Expo SDK 54 / RN 0.81): tam `height` bywa wysokością POWIERZCHNI
 * klawiatury, bez paska nawigacji, nad którym ona stoi, a okno sięga już pod ten pasek.
 * Różnica to kilkadziesiąt dp - dokładnie tyle, ile trzeba, żeby przyciski arkusza
 * zniknęły pod klawiaturą (zgłoszenie z urządzenia: arkusz godziny meldunku).
 *
 * Bierzemy więc miarę WIĘKSZĄ, ale tylko gdy jest wiarygodna: brak `screenY` (zero)
 * dałby „klawiaturę na całe okno" i wypchnął arkusz za ekran, więc wynik poza
 * `MAX_KEYBOARD_FRACTION` odrzucamy i zostajemy przy `height`. Pomyłka w bezpieczną
 * stronę kosztuje pasek powietrza w arkuszu; w drugą - niedostępny przycisk.
 */
export function keyboardBottomOffset(
  height: number,
  screenY: number,
  windowHeight: number,
): number {
  const measured = Math.max(0, height);
  const toWindowBottom = windowHeight - screenY;

  if (!(toWindowBottom > measured)) return measured;
  if (toWindowBottom > windowHeight * MAX_KEYBOARD_FRACTION) return measured;
  return toWindowBottom;
}

/**
 * Zapas pod rzędem akcji arkusza - jedna reguła dla wszystkich arkuszy, bo pasek nawigacji
 * należy do DWÓCH różnych miar i łatwo zapłacić za niego dwa razy (zgłoszenia z urządzenia):
 *
 *  • klawiatura wysunięta → sam `gap`. `keyboardHeight` mierzy do dołu okna, więc pasek
 *    nawigacji jest już w tej liczbie; dołożony osobno robił pas martwego powietrza
 *    między arkuszem a klawiaturą;
 *  • klawiatura zwinięta → `insetBottom + gap`, bo dolnej krawędzi nie chroni już nic.
 *    `designPad` (zapas z mockupu) zostaje podłogą - na telefonach z nawigacją gestami
 *    inset bywa zerowy i bez niej arkusz przyklejałby się do krawędzi ekranu.
 */
export function sheetBottomPad(
  designPad: number,
  insetBottom: number,
  keyboardHeight: number,
  gap: number,
): number {
  if (keyboardHeight > 0) return gap;
  return Math.max(designPad, insetBottom + gap);
}

/**
 * Ile EKRANU musi zostać widoczne nad arkuszem (dp, ponad bezpiecznym obszarem).
 *
 * Arkusz jest wstawką NAD ekranem, a nie kolejnym ekranem - i to musi być widać, zanim
 * pilot przeczyta choć jedno słowo. Bez wyraźnego pasa przyciemnionego tła arkusz z dużą
 * treścią (korekta zdarzenia z wierszami odniesienia, historia zmian) dobijał do górnej
 * krawędzi i wyglądał jak nowy ekran - z uchwytem, którego nikt nie szuka, jako jedyną
 * poszlaką.
 *
 * 56 dp, bo poprzednie 24 dp znikało: na telefonie z paskiem statusu narysowanym na
 * arkuszu (`statusBarTranslucent`) różnica między „arkusz do góry" a „arkusz prawie
 * do góry" była niewidoczna. Przy 56 dp widać pas tła i kawałek ekranu pod spodem.
 */
export const SHEET_TOP_GAP = 56;

/**
 * Sufit wysokości arkusza wysuwanego od dołu.
 *
 * Odejmujemy trzy rzeczy i każda ma inny powód: klawiaturę (arkusz ma stać NAD nią,
 * nie pod), górny bezpieczny obszar (paska statusu i wcięcia aparatu nie wolno zasłonić)
 * oraz `SHEET_TOP_GAP` (żeby było widać, że pod spodem jest ekran).
 *
 * Podłoga 240 dp trzyma sens układu, gdyby pomiary przyszły niespójne - arkusz bez
 * miejsca na rząd akcji jest gorszy niż arkusz zachodzący na pasek statusu.
 */
export function sheetMaxHeight(
  windowHeight: number,
  keyboardHeight: number,
  insetTop: number,
  topGap: number = SHEET_TOP_GAP,
): number {
  return Math.max(240, windowHeight - keyboardHeight - insetTop - topGap);
}

/**
 * O ile jeszcze przewinąć listę, żeby CAŁE pole stało nad klawiaturą.
 *
 * Oba argumenty to dolne krawędzie w układzie OKNA, wprost z `measureInWindow`:
 *  • `inputBottom` - dół pola (nie góra: pole wieloliniowe potrafi mieć górną krawędź
 *    nad klawiaturą, a dolną pod nią, i wtedy nadal jest nieczytelne),
 *  • `viewportBottom` - dół widocznej części listy, już po skróceniu ekranu o klawiaturę,
 *    czyli w praktyce górna krawędź klawiatury.
 *
 * Zero znaczy „nie ruszaj": pole widoczne z zapasem nie ma być szarpane. Wynik nigdy nie
 * jest ujemny - przewijanie „w drugą stronę" nie jest zadaniem tego mechanizmu.
 */
export function scrollDeltaForInput(
  inputBottom: number,
  viewportBottom: number,
  clearance: number = KEYBOARD_CLEARANCE,
): number {
  return Math.max(0, inputBottom + clearance - viewportBottom);
}

/**
 * Czy wysunięta klawiatura należy do ARKUSZA stojącego nad ekranem (zgłoszenie
 * z urządzenia, 2026-09-04: „czasem jak mam na manualnym locie przejście na ekran
 * z przebiegiem operacji, to tak jakby dwa razy muszę kliknąć DALEJ").
 *
 * Zdarzenia klawiatury w RN są GLOBALNE dla aplikacji, a arkusz żyje we własnym oknie
 * (`Modal`). Ekran pod spodem dostawał więc `keyboardDidShow` od pola, którego wcale
 * nie ma: kurczył się o wysokość klawiatury i dociągał listę (`useKeyboardAwareScroll`),
 * choć pilot patrzył na arkusz. Rachunek płacił się przy ZAMKNIĘCIU: `keyboardDidHide`
 * pada na Androidzie dopiero po animacji chowania (~300 ms), więc przez ten czas
 * ekran stał jeszcze skrócony - pilot tapał „DALEJ" tam, gdzie go widział, layout
 * w międzyczasie wracał na miejsce, a tapnięcie lądowało w pustce. Drugie działało.
 *
 * Stan jest LEPKI: pożyczka gaśnie dopiero, gdy klawiatura naprawdę zniknie (`raw` = 0),
 * a nie w chwili odmontowania arkusza - inaczej ekran odzyskiwałby cudzą klawiaturę na
 * te kilkaset milisekund i skok wracałby tylnymi drzwiami.
 *
 * @param borrowed czy klawiatura była pożyczona arkuszowi przy poprzednim zdarzeniu
 * @param rawHeight wysokość ze zdarzeń klawiatury - wspólna dla całej aplikacji
 * @param sheetOpen czy nad ekranem stoi choć jeden arkusz (`sheetPresence`)
 */
export function keyboardBorrowedBySheet(
  borrowed: boolean,
  rawHeight: number,
  sheetOpen: boolean,
): boolean {
  if (sheetOpen) return rawHeight > 0;
  // Arkusz zniknął, ale klawiatura jeszcze schodzi - to nadal nie jest klawiatura ekranu.
  return borrowed && rawHeight > 0;
}
