/**
 * UZ Aero - TYPOGRAFIA.
 *
 * Tu przebiega jedyny SZEW między platformami. Rodziny czcionek nazywają się inaczej
 * w React Native (eksporty `@expo-google-fonts`) i w CSS (rodziny z Google Fonts), więc
 * pakiet podaje oba zestawy pod osobnymi nazwami. `fontFamily` zostaje aliasem wariantu
 * natywnego, żeby aplikacja - 85 plików importujących te tokeny - nie zmieniła ani znaku.
 *
 * Same rozmiary, wagi i interlinie są WSPÓLNE: to ta sama skala typograficzna,
 * niezależnie od tego, co ją renderuje.
 */

/**
 * Rodziny czcionek dla React Native - nazwy zgodne z eksportami @expo-google-fonts.
 * Bebas Neue = display/nagłówki. Archivo = body/etykiety/przyciski.
 * JetBrains Mono = cyfry timerów, kody ICAO, wartości GPS, MH, kody pilotów.
 *
 * Wariantów jest osiem, bo RN wybiera GRUBOŚĆ przez osobny plik czcionki -
 * `fontWeight` na Androidzie nie działa na czcionkach wczytanych z pakietu.
 */
export const fontFamilyNative = {
  display: 'BebasNeue_400Regular',
  body: 'Archivo_400Regular',
  bodyMedium: 'Archivo_500Medium',
  bodySemiBold: 'Archivo_600SemiBold',
  bodyBold: 'Archivo_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

/**
 * Rodziny czcionek dla CSS. Trzy, nie osiem - w przeglądarce grubość jest OSOBNĄ
 * właściwością (`font-weight`), więc nie należy do nazwy rodziny. Te same trzy
 * wartości stoją w `design/admin/SZABLON.html` jako `--font-display`, `--font-body`
 * i `--font-mono`.
 */
export const fontFamilyCss = {
  display: "'Bebas Neue', sans-serif",
  body: "'Archivo', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

/**
 * Alias zgodności: aplikacja mobilna importuje `fontFamily` w kilkudziesięciu plikach
 * i ma tak zostać. Wariant natywny jest dla niej jedynym sensownym domyślnym, a jawna
 * nazwa `fontFamilyNative` istnieje po to, żeby kod webowy nie sięgnął po niego przez
 * pomyłkę.
 */
export const fontFamily = fontFamilyNative;

/** Pojedynczy token typograficzny (bez koloru - kolor idzie z motywu). */
export interface TypographyToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform?: 'uppercase' | 'none';
}

/**
 * Skala typografii. Rozmiary/letter-spacing przeniesione z mockupów (do issue #72
 * mieszkały w `design/05-themes.html`; nazwy w nawiasach to klasy tamtych ekranów):
 *  - display     → .film-strip / .phase-hero-name (Bebas Neue)
 *  - timer_large → duży timer, cyfry mono (CLAUDE.md: "cyfry timerów = JetBrains Mono")
 *  - param_value → .param-value (mono 28 / ls 2 / lh 1)
 *  - param_label → .param-label (mono 10 / ls 2.5 / UPPERCASE)
 *  - body        → tekst Archivo
 *  - label       → etykiety/przyciski Archivo
 *  - mono_code   → inline kody: ICAO, GPS, MH, kod pilota (.compact-info)
 *  - micro       → mikro-etykiety 9 px w wersalikach (.diag-key / .header-sub / .version-tag)
 */
export const typography = {
  display: {
    fontFamily: fontFamily.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: 2,
  },
  timer_large: {
    fontFamily: fontFamily.mono,
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: 2,
  },
  param_value: {
    fontFamily: fontFamily.mono,
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: 2,
  },
  param_label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  // Etykiety przycisków akcji. Dwa rozmiary, oba skopiowane z mockupów:
  //  - button       → `.btn-primary` (DALEJ, ZACZNIJ DZIEŃ, START ENGINE)
  //  - button_small → `.modal-btn-cancel` / `.modal-btn-confirm` (akcje arkusza)
  // Nie używamy tu `display` (34 px) - to rozmiar tytułu ekranu, nie napisu na przycisku.
  button: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: 3,
  },
  button_small: {
    fontFamily: fontFamily.display,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: 2,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  label: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  mono_code: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1,
  },
  // Mikro-etykiety sekcji i pasków (mono 9 / wersaliki): `.diag-key` (13),
  // `.header-sub` (08), `.version-tag` (01), `.pin-label` (00), `.field-label` (07),
  // `.group-lbl` (12). Mockupy wahają się między światłem 1.5 a 2 px - kanon to 1.5
  // (jak `.diag-key`/`.header-sub`); normalizacja jest celowa, wzorem `colors.overlay`,
  // który zakończył dryf scrimów.
  micro: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    lineHeight: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TypographyToken>;


/** Nazwa tokenu typograficznego - klucz w `typography`. */
export type TypographyName = keyof typeof typography;
