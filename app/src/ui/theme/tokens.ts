/**
 * UZ Aero — tokeny designu mieszkają w `packages/tokens` (workspace `@uzaero/tokens`).
 *
 * Wyniesione stąd 2026-07-31, bo trzecim konsumentem został panel administracyjny
 * (`design/admin/`) — a token skopiowany do drugiego projektu przestaje być tokenem
 * i staje się dwiema wartościami, które rozjadą się przy pierwszej zmianie palety.
 * Ten sam powód, dla którego wcześniej wyniesiono domenę i kształt flagi.
 *
 * Ten plik to shim zgodności: całe `app/src` importuje tokeny ścieżką `ui/theme/tokens`
 * i tak ma zostać — warstwa UI nie musi wiedzieć, że tokeny są osobnym pakietem.
 * ŹRÓDŁEM PRAWDY dla wartości pozostaje `design/05-themes.html`.
 */

export * from '@uzaero/tokens';
