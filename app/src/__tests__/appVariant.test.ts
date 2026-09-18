/**
 * Ninerdeck - wariant konfiguracji Expo (`scripts/app-variant.js`, wołany z `app.config.js`
 * i z `infrastructure/release/nativeRelease.ts`).
 *
 * Dev build ma stać na telefonie OBOK produkcyjnego APK, więc dostaje osobny pakiet -
 * a wszystko inne (wersja, numer builda, projekt EAS, ikony) ma zostać takie samo. Test
 * pilnuje obu połówek: co się zmienia i co nie ma prawa się zmienić.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEVELOPMENT_VARIANT,
  DEV_PACKAGE_SUFFIX,
  devPackage,
  isDevelopmentVariant,
  variantConfig,
} from '../../scripts/app-variant';

const BASE = {
  name: 'Ninerdeck',
  slug: 'ninerdeck',
  version: '2.0.0',
  scheme: ['com.ninerdeck.app', 'ninerdeck'],
  android: { package: 'com.ninerdeck.app', versionCode: 3 },
  updates: { url: 'https://u.expo.dev/x' },
  extra: { eas: { projectId: 'x' } },
};

const DEV_ENV = { APP_VARIANT: 'development' };

describe('isDevelopmentVariant - tylko jawne `development`', () => {
  it('włącza wariant wyłącznie dokładna wartość - literówka znaczy produkcję', () => {
    expect(isDevelopmentVariant({ APP_VARIANT: DEVELOPMENT_VARIANT })).toBe(true);
    expect(isDevelopmentVariant({ APP_VARIANT: 'production' })).toBe(false);
    expect(isDevelopmentVariant({ APP_VARIANT: 'Development' })).toBe(false);
    expect(isDevelopmentVariant({ APP_VARIANT: '' })).toBe(false);
    expect(isDevelopmentVariant({})).toBe(false);
    expect(isDevelopmentVariant(undefined)).toBe(false);
  });
});

describe('devPackage', () => {
  it('dokleja sufiks do pakietu bazowego', () => {
    expect(devPackage('com.ninerdeck.app')).toBe('com.ninerdeck.app.dev');
    expect(DEV_PACKAGE_SUFFIX).toBe('.dev');
  });
});

describe('variantConfig - produkcja', () => {
  it('bez wariantu oddaje TĘ SAMĄ konfigurację - produkcja nie zależy od helpera', () => {
    expect(variantConfig(BASE, { APP_VARIANT: 'production' })).toBe(BASE);
    expect(variantConfig(BASE, {})).toBe(BASE);
    expect(variantConfig(BASE, undefined)).toBe(BASE);
  });
});

describe('variantConfig - wariant deweloperski', () => {
  const dev = variantConfig(BASE, DEV_ENV);

  it('zmienia nazwę, pakiet i schemat pakietu', () => {
    expect(dev.name).toBe('Ninerdeck Dev');
    expect(dev.android.package).toBe('com.ninerdeck.app.dev');
    expect(dev.scheme).toEqual(['com.ninerdeck.app.dev', 'ninerdeck']);
  });

  it('pakiet dev jest tym samym, który liczy czytnik wydania', () => {
    expect(dev.android.package).toBe(devPackage(BASE.android.package));
  });

  it('nie rusza wersji, numeru builda, projektu EAS ani reszty konfiguracji', () => {
    expect(dev.version).toBe(BASE.version);
    expect(dev.slug).toBe(BASE.slug);
    expect(dev.android.versionCode).toBe(BASE.android.versionCode);
    expect(dev.updates).toEqual(BASE.updates);
    expect(dev.extra).toEqual(BASE.extra);
  });

  it('nie mutuje bazy', () => {
    expect(BASE.name).toBe('Ninerdeck');
    expect(BASE.android.package).toBe('com.ninerdeck.app');
    expect(BASE.scheme).toEqual(['com.ninerdeck.app', 'ninerdeck']);
  });

  it('schemat pakietu dev stoi zawsze - także gdy baza nie wymienia pakietu albo nie ma schematu', () => {
    expect(variantConfig({ ...BASE, scheme: 'ninerdeck' }, DEV_ENV).scheme).toEqual([
      'com.ninerdeck.app.dev',
      'ninerdeck',
    ]);
    expect(variantConfig({ ...BASE, scheme: undefined }, DEV_ENV).scheme).toEqual([
      'com.ninerdeck.app.dev',
    ]);
  });

  it('bez android.package odmawia - nie ma z czego złożyć pakietu dev', () => {
    expect(() => variantConfig({ ...BASE, android: {} }, DEV_ENV)).toThrow(/android\.package/);
  });
});

describe('app.json w repozytorium', () => {
  const appJson = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8')) as {
    expo: Record<string, any>;
  };

  it('wariant deweloperski z prawdziwej konfiguracji = com.ninerdeck.app.dev, „Ninerdeck Dev"', () => {
    const dev = variantConfig(appJson.expo, DEV_ENV);
    expect(dev.android.package).toBe('com.ninerdeck.app.dev');
    expect(dev.name).toBe('Ninerdeck Dev');
    expect(dev.scheme[0]).toBe('com.ninerdeck.app.dev');
    expect(dev.android.versionCode).toBe(appJson.expo.android.versionCode);
    expect(dev.version).toBe(appJson.expo.version);
  });
});
