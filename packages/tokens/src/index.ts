/**
 * UZ Aero - barrel pakietu tokenów designu.
 *
 * Reguła twarda, jak w `@uzaero/domain`: TU NIE MA importów Reacta, React Native,
 * Expo ani niczego z DOM. Tokeny to czyste dane - muszą dać się wczytać i na telefonie,
 * i w przeglądarce, i w gołym Node (test porównujący je z mockupami).
 *
 * Konsumenci: `app/` przez shim `src/ui/theme/tokens.ts` (nie zmienia się nic w kodzie
 * ekranów) oraz panel webowy przez `themeCssVars`.
 */

export * from './themes';
export * from './scale';
export * from './typography';
export * from './theme';
export * from './cssVars';
