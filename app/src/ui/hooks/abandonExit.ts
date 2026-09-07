/**
 * UZ Aero - KOLEJNOŚĆ WYJŚCIA Z FORMULARZA PO REZYGNACJI (issue #84 pkt 7).
 *
 * Zgłoszenie z urządzenia: „jak się cofam z lotu ręcznego tak, że rezygnuję
 * i potwierdzam rezygnację, to leci wyjątek IllegalStateException".
 *
 * ══ SKĄD SIĘ BIERZE WYWROTKA ══
 * Arkusz rezygnacji stoi na `Modal` z React Native, a `Modal` na Androidzie jest
 * OSOBNYM OKNEM natywnym (`Dialog` z własnym `Window`) - nie kolejnym widokiem
 * w drzewie ekranu. Potwierdzenie robiło dotąd dwie rzeczy naraz:
 *
 *  1. chowało arkusz (`visible` schodziło na fałsz), a rama trzyma wtedy okno JESZCZE
 *     przez ~160 ms, żeby panel zdążył wyjechać w dół (`SheetSurface`);
 *  2. wypuszczało zatrzymaną akcję nawigacji, czyli zdejmowało CAŁY ekran ze stosu.
 *
 * Okno modala znikało więc razem z powierzchnią, do której należało - i to jest
 * dokładnie ten stan, w którym Android odmawia zdjęcia widoku, którego rodzic już
 * nie istnieje.
 *
 * ══ NA CZYM POLEGA POPRAWKA ══
 * Wyjście przestaje być jednym skokiem, a staje się TRZEMA fazami, z których każda
 * robi dokładnie jedną rzecz:
 *
 *   `asking`  - arkusz jest w drzewie i pyta;
 *   `closing` - arkusz WYPADŁ z drzewa (okno modala schodzi), nawigacja jeszcze stoi;
 *   `leaving` - okna już nie ma, więc wolno zdjąć ekran.
 *
 * Cena jest jedna: przy rezygnacji arkusz znika bez animacji wyjazdu. To dobra
 * zamiana - ekran pod spodem i tak za chwilę zniknie, więc animować nie ma czego,
 * a jedyne, co ta animacja dawała, to okno przeżywające własny ekran.
 *
 * Moduł jest czysty i bez Reacta z tego samego powodu, co `keyboardFocus.ts`: kolejność
 * jest tu CAŁĄ treścią poprawki, a wywrotki na Androidzie nie widać w testach - więc
 * niezmiennik musi być przybity osobno, nie doglądany w JSX.
 */

/** Faza wyjścia z formularza, który pyta o rezygnację. */
export type AbandonPhase =
  /** Pilot wypełnia formularz - nikt o nic nie pytał. */
  | 'form'
  /** Arkusz rezygnacji stoi na ekranie i czeka na decyzję. */
  | 'asking'
  /** Pilot potwierdził: arkusz schodzi z drzewa, nawigacja jeszcze czeka. */
  | 'closing'
  /** Okna modala już nie ma - wolno wypuścić zatrzymaną akcję. */
  | 'leaving';

/**
 * Czy bramka „wstecz" ma jeszcze zatrzymywać wyjście.
 *
 * Opada z chwilą potwierdzenia, bo od `closing` ekran JEST w drodze do wyjścia -
 * gdyby pytała dalej, zatrzymałaby własną akcję i formularz zostałby na ekranie.
 */
export function abandonGuards(phase: AbandonPhase): boolean {
  return phase === 'form' || phase === 'asking';
}

/**
 * Czy arkusz rezygnacji wolno trzymać w drzewie.
 *
 * To NIE jest to samo pytanie, co „czy arkusz jest widoczny": rama arkusza przeżywa
 * własną niewidzialność o czas animacji wyjazdu, a właśnie ten czas był tu usterką.
 * Przy rezygnacji arkusz wypada z drzewa od razu.
 */
export function abandonSheetMounted(phase: AbandonPhase): boolean {
  return phase === 'asking';
}

/** Czy wolno wypuścić zatrzymaną akcję nawigacji (zdjąć ekran ze stosu). */
export function abandonDispatches(phase: AbandonPhase): boolean {
  return phase === 'leaving';
}

/**
 * Następna faza po tej, która ma następną. `null` = faza jest stanem spoczynku
 * i czeka na decyzję pilota, nie na zegar.
 *
 * Rozdzielenie `closing` i `leaving` na dwie fazy, a nie na dwie linie w jednym
 * kroku, jest CAŁYM sensem tego modułu: między nimi musi wypaść klatka, w której
 * system zdejmie okno modala.
 */
export function nextAbandonPhase(phase: AbandonPhase): AbandonPhase | null {
  return phase === 'closing' ? 'leaving' : null;
}
