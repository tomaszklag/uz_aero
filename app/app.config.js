/**
 * Ninerdeck - konfiguracja Expo z WARIANTEM (2026-09-17) i PLIKIEM FIREBASE (3.1.0).
 *
 * `app.json` zostaje ŹRÓDŁEM konfiguracji (wersja, `versionCode`, pakiet, ikony, projekt
 * EAS - czytają go też `src/infrastructure/release/nativeRelease.ts` i skill `wydanie`);
 * ten plik wyłącznie:
 *  - przestawia ją na wariant deweloperski, gdy `APP_VARIANT=development`
 *    (`scripts/app-variant.js`: tam reguła, powody i kto tę zmienną ustawia);
 *  - dokłada `android.googleServicesFile`, gdy plik Firebase jest pod ręką
 *    (`scripts/google-services.js`: zmienna EAS typu „file" albo lokalna kopia poza
 *    repozytorium - powiadomienia push, epik R-J).
 * Expo CLI podaje tu zawartość `app.json` jako `config` i bierze to, co wrócimy.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { variantConfig } = require('./scripts/app-variant');
const { withGoogleServices } = require('./scripts/google-services');

const existsHere = (relativePath) => fs.existsSync(path.join(__dirname, relativePath));

module.exports = ({ config }) =>
  withGoogleServices(variantConfig(config, process.env), process.env, existsHere);
