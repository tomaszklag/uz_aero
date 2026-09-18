/**
 * Ninerdeck - etykieta urządzenia w nagłówku `X-Ninerdeck-Device` (2.1.0, issue #135 E1).
 *
 * Napis czyta CZŁOWIEK na liście sesji w panelu, więc testujemy dokładnie to, co tam
 * stanie - razem z kolejnością członów, która jest kontraktem serwera.
 */

import { deviceLabel } from '../application/auth/deviceLabel';
import type { DeviceFacts } from '../application/auth/deviceLabel';

const PIXEL: DeviceFacts = {
  platform: 'android',
  osVersion: '14',
  deviceModel: 'Pixel 7a',
  appVersion: '1.1.0 (build 2)',
};

describe('deviceLabel', () => {
  it('składa system, model i wydanie w kolejności z kontraktu serwera', () => {
    expect(deviceLabel(PIXEL)).toBe('Android 14 · Pixel 7a · Ninerdeck 1.1.0 (build 2)');
  });

  it('nazywa w etykiecie aplikację - to telefon podaje się sam', () => {
    // Przy wierszu przeglądarki człon powierzchni dokleja panel; przy telefonie
    // musi stać w napisie, bo panel nie ma skąd go wziąć.
    expect(deviceLabel(PIXEL)).toContain('Ninerdeck');
  });

  it('podnosi nazwę systemu do postaci dla człowieka', () => {
    expect(deviceLabel({ ...PIXEL, platform: 'ios', osVersion: '17.4', deviceModel: 'iPhone' })).toBe(
      'iOS 17.4 · iPhone · Ninerdeck 1.1.0 (build 2)',
    );
  });

  it('pomija człon, którego nie zna, zamiast zostawiać pustkę', () => {
    // Expo Go nie zna wydania, a RN bez modułu natywnego bywa nie zna modelu.
    expect(deviceLabel({ ...PIXEL, deviceModel: null, appVersion: null })).toBe('Android 14');
    expect(deviceLabel({ ...PIXEL, appVersion: null })).toBe('Android 14 · Pixel 7a');
    expect(deviceLabel({ ...PIXEL, deviceModel: null })).toBe('Android 14 · Ninerdeck 1.1.0 (build 2)');
  });

  it('bez wersji systemu zostawia samą nazwę', () => {
    expect(deviceLabel({ platform: 'android', osVersion: null, deviceModel: null, appVersion: null })).toBe(
      'Android',
    );
  });

  it('nieznaną platformę nazywa z grubsza dobrze, zamiast ją gubić', () => {
    expect(deviceLabel({ platform: 'harmony', osVersion: '4', deviceModel: null, appVersion: null })).toBe(
      'Harmony 4',
    );
  });
});
