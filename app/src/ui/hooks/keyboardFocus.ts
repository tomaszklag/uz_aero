/**
 * UZ Aero — drabinka fokusu pola w arkuszu (issue #58 pkt 7/8, DRUGA tura zgłoszenia).
 *
 * Historia dwóch nieudanych podejść, żeby trzecie nie wróciło do żadnego z nich:
 *  1. `autoFocus` — odpala się przy montowaniu, ZANIM okno modala w ogóle istnieje;
 *     pole bywało „skupione", klawiatura nie przychodziła nigdy.
 *  2. pojedyncze `focus()` w `Modal.onShow` — okno już istnieje, ale fokus IME
 *     dostaje dopiero po dojechaniu animacji wjazdu. `focus()` wywołane przed tym
 *     ustawia fokus WIDOKU bez klawiatury — a drugie `focus()` na skupionym już
 *     widoku jest no-opem, więc jedna spóźniona próba przepadała bezpowrotnie.
 *
 * Stąd DRABINKA: pierwsza próba od razu w `onShow`, kolejne po `RETRY_DELAYS_MS`,
 * każda kolejna z `blur()` przed `focus()` (to `blur` przywraca fokusowi moc
 * pokazania klawiatury) i tylko wtedy, gdy klawiatura wciąż nie wyszła
 * (`Keyboard.isVisible`). Widoczna klawiatura zatrzymuje drabinkę — późne
 * `blur+focus` przy wysuniętej klawiaturze mrugałoby kursorem bez powodu.
 *
 * ══ ROLA DRABINKI ZAWĘZIŁA SIĘ (issue #62, szósta tura) ══
 * Powód nr 2 z tej historii — czekanie na animację wjazdu okna — ZNIKŁ: `SheetSurface`
 * otwiera `Modal` bez animacji (`animationType="none"`) i animuje panel sam, więc okno
 * dostaje fokus wejścia natychmiast, a pierwsza próba drabinki zwykle wystarcza.
 * To była właśnie ta „krótka chwila" między arkuszem a klawiaturą.
 *
 * Drabinka ZOSTAJE, bo powód nr 1 działa dalej w innej postaci: `onShow` potrafi
 * wyprzedzić commit dzieci modala (stąd koniunkcja w `shouldStartLadder`), a przy
 * obciążonym JS pierwsza próba nadal bywa za wczesna. Ponowienia są tanie — gasną
 * same, gdy tylko klawiatura wyjdzie.
 *
 * Ten moduł jest CZYSTY (decyzja per próba); zegar i RN siedzą w `useSheetInputFocus`.
 */

/**
 * Odstępy kolejnych prób od startu drabinki.
 *
 * PIERWSZE PONOWIENIE JEST BLISKO (issue #62, szósta tura). Poprzedni harmonogram
 * (150/400/800) był dobrany tak, żeby PRZECZEKAĆ animację wjazdu okna — a tej już nie
 * ma, odkąd `SheetSurface` otwiera `Modal` bez animacji. Zostało wyłącznie okno na
 * przejęcie fokusu wejścia przez świeżo pokazane okno, czyli klatka albo dwie: `onShow`
 * pada, gdy dialog jest POKAZANY, ale fokus wejścia potrafi dojść beat później, a wtedy
 * próba nr 0 ustawia fokus widoku bez IME. Czekanie 150 ms na naprawę tego jest widoczne
 * gołym okiem — stąd pierwsza próba po 50 ms.
 *
 * Dalsze rungi zostają rzadkie: są na zamulony JS, nie na fokus okna, a przy wysuniętej
 * klawiaturze i tak gasną (`focusStep` pyta o `Keyboard.isVisible`).
 */
export const RETRY_DELAYS_MS = [50, 180, 400, 800];

/**
 * Drabinka rusza w PÓŹNIEJSZYM z dwóch zdarzeń: okno modala pokazane (`onShow`)
 * i pole zamontowane (ref doszedł). TRZECIA tura zgłoszenia (issue #58): start
 * wyłącznie z `onShow` gubił pierwszą próbę, bo `onShow` potrafi wyprzedzić
 * commit dzieci modala — ref był jeszcze pusty, próba nr 0 nie miała na czym
 * zadziałać i klawiaturę wyciągało dopiero ponowienie po 150 ms. Stąd widoczny
 * efekt „najpierw popup, potem klawiatura". Kolejność zdarzeń bywa OBIE strony
 * (zależnie od urządzenia i obciążenia JS), więc bramka pyta o koniunkcję,
 * a nie o konkretne zdarzenie.
 */
export function shouldStartLadder(windowShown: boolean, inputAttached: boolean): boolean {
  return windowShown && inputAttached;
}

export type FocusStep =
  /** Pierwsze podejście: samo `focus()` — pole nie było jeszcze skupione. */
  | 'focus'
  /** Ponowienie: `blur()` + `focus()` — bez blur drugi fokus jest no-opem. */
  | 'refocus'
  /** Klawiatura już jest — nic nie rób. */
  | 'stop';

export function focusStep(round: number, keyboardVisible: boolean): FocusStep {
  if (round === 0) return 'focus';
  return keyboardVisible ? 'stop' : 'refocus';
}
