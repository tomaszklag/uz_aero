/**
 * Ninerdeck - konfiguracja Expo z WARIANTEM (2026-09-17).
 *
 * `app.json` zostaje ŹRÓDŁEM konfiguracji (wersja, `versionCode`, pakiet, ikony, projekt
 * EAS - czytają go też `src/infrastructure/release/nativeRelease.ts` i skill `wydanie`);
 * ten plik wyłącznie przestawia ją na wariant deweloperski, gdy `APP_VARIANT=development`
 * (`scripts/app-variant.js`: tam reguła, powody i kto tę zmienną ustawia). Expo CLI podaje
 * tu zawartość `app.json` jako `config` i bierze to, co wrócimy.
 */

'use strict';

const { variantConfig } = require('./scripts/app-variant');

module.exports = ({ config }) => variantConfig(config, process.env);
