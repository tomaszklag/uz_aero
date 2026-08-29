/**
 * UZ Aero - panel: karta „zdarzenie korygowane · oryginalny odczyt" (moduł czysty).
 *
 * Cała treść scenariusza z mockupu mieści się w jednej różnicy: `gps_time` puste
 * (brak fixa), więc czas spadł na `device_time`, a ten spieszył dwanaście minut.
 * Testy pilnują, że karta mówi o tym wprost, zamiast pokazać jedną godzinę bez
 * wyjaśnienia, skąd się wzięła.
 */

import { describe, expect, it } from 'vitest';

import type { CorrectionTargetDto } from '../../api/dto';
import { targetRows } from './correctionTarget';

const DAY = Date.UTC(2026, 6, 30);
const at = (h: number, m: number, s = 0): number => DAY + ((h * 60 + m) * 60 + s) * 1000;

const target = (over: Partial<CorrectionTargetDto> = {}): CorrectionTargetDto =>
  ({
    uuid: 'b8d41f27-6c0a-4e93-a15b-2f7d9e604c18',
    type: 'engine_stop',
    deviceTime: at(13, 13, 33),
    gpsTime: null,
    effectiveTime: at(13, 13, 33),
    voided: false,
    sourceDevice: 'Pixel 7a · a41f9c',
    event: {} as CorrectionTargetDto['event'],
    ...over,
  }) as CorrectionTargetDto;

const find = (rows: ReturnType<typeof targetRows>, label: string) =>
  rows.find((row) => row.label === label)!;

describe('odczyt bez fixa GPS', () => {
  const rows = targetRows(target());

  it('mówi wprost, że GPS nie dał czasu', () => {
    expect(find(rows, 'gps_time')).toMatchObject({ value: 'brak fixa', tone: 'red' });
  });

  it('nazywa fallback po imieniu - to on tłumaczy złą liczbę dnia', () => {
    const row = find(rows, 'Czas użyty w projekcji');
    expect(row.value).toBe('13:13:33');
    expect(row.note).toContain('fallback na device_time');
    expect(row.tone).toBe('amber');
  });

  it('pokazuje pełną datę przy zegarze telefonu - korekta bywa przez północ UTC', () => {
    expect(find(rows, 'device_time').value).toBe('2026-07-30 13:13:33');
  });
});

describe('odczyt z GPS', () => {
  const rows = targetRows(target({ gpsTime: at(13, 1, 33), effectiveTime: at(13, 1, 33) }));

  it('nie straszy tonem tam, gdzie wszystko jest w porządku', () => {
    expect(find(rows, 'gps_time').tone).toBeUndefined();
    expect(find(rows, 'Czas użyty w projekcji').tone).toBeUndefined();
    expect(find(rows, 'Czas użyty w projekcji').note).toContain('gps_time');
  });
});

describe('zdarzenie już unieważnione', () => {
  const rows = targetRows(target({ voided: true, effectiveTime: null }));

  it('nie ma „czasu w projekcji", bo nie wchodzi do żadnej liczby', () => {
    expect(find(rows, 'Czas użyty w projekcji')).toMatchObject({ value: 'żaden', tone: 'red' });
  });

  it('dokłada wiersz o stanie i mówi, że retime je przywróci', () => {
    expect(find(rows, 'Stan').value).toBe('UNIEWAŻNIONE');
    expect(find(rows, 'Stan').note).toContain('retime');
  });
});

describe('urządzenie zapisujące', () => {
  it('przechodzi DOSŁOWNIE - to napis z telefonu, nie tożsamość konta', () => {
    const row = find(targetRows(target()), 'Zapisane przez');
    expect(row.value).toBe('Pixel 7a · a41f9c');
    expect(row.note).toContain('nie tożsamość konta');
  });

  it('brak pola przyznaje się do niewiedzy zamiast zgadywać', () => {
    const row = find(targetRows(target({ sourceDevice: null })), 'Zapisane przez');
    expect(row.value).toBe('-');
    expect(row.note).toContain('sprzed wprowadzenia');
  });

  it('wpis z panelu jest rozpoznawalny po treści, którą zapisał serwer', () => {
    // `admin:<pilotId>` stawia `AdminCorrectionCommands` - panel go nie interpretuje
    // i nie ma powodu: administrator czyta to jako napis i wie, co znaczy.
    expect(find(targetRows(target({ sourceDevice: 'admin:TMK' })), 'Zapisane przez').value).toBe(
      'admin:TMK',
    );
  });
});
