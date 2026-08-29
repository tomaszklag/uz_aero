/**
 * UZ Aero - panel: wiersz rejestru zdarzeń (`A04`).
 *
 * Najważniejsze w tym pliku nie są plakietki, tylko UCZCIWOŚĆ WOBEC BRAKÓW - bo tutaj
 * brak jest treścią, a nie usterką:
 *
 *  • brak fixa GPS musi dać „brak fixa", nigdy „0 s". Zero powiedziałoby, że zegary
 *    się zgadzały, czyli wpisałoby telefonowi dokładność, której nie miał - a to jest
 *    dokładnie ta wielkość, przez którą korekta administratora w ogóle powstaje;
 *  • typ spoza katalogu, samolot spoza floty i konto spoza rejestru zostają widoczne.
 */

import { describe, expect, it } from 'vitest';

import type { EventEntryDto } from '../../api/dto';
import { driftSeconds, eventsRows, headerRows, shortUuid } from './eventsRows';

const DAY = Date.UTC(2026, 6, 30);
const at = (h: number, m: number, s = 0): number => DAY + ((h * 60 + m) * 60 + s) * 1000;
const THRESHOLD = 120_000;

function entry(over: Partial<EventEntryDto> = {}): EventEntryDto {
  const deviceTime = over.deviceTime ?? at(14, 18, 52);
  const gpsTime = over.gpsTime === undefined ? at(14, 18, 51) : over.gpsTime;
  return {
    uuid: '9f2c4e18-b073-4a56-8ce1-d2740f6e41ab',
    sessionUuid: 'e04b7712-0000-0000-0000-0000000009ac',
    aircraftId: 'ac-klm',
    reg: 'SP-KLM',
    picId: 'AWR',
    picCode: 'AWR',
    picName: 'Anna Wrzosek',
    dualId: null,
    dualCode: null,
    dualName: null,
    type: 'drop',
    deviceTime,
    gpsTime,
    driftMs: gpsTime == null ? null : Math.abs(deviceTime - gpsTime),
    effectiveTime: gpsTime ?? deviceTime,
    effectiveClock: gpsTime == null ? 'device' : 'gps',
    payload: { dropNumber: 9 },
    schemaVersion: 1,
    receivedAt: new Date(at(14, 19, 8)).toISOString(),
    sourceDevice: 'Pixel 7a · a41f9c',
    writtenByPanel: false,
    voided: false,
    corrected: false,
    correctedTime: null,
    adminCorrected: false,
    ...over,
  };
}

const row = (over: Partial<EventEntryDto> = {}, threshold: number | null = THRESHOLD) =>
  eventsRows([entry(over)], threshold)[0]!;

describe('wiersz rejestru: dwa zegary', () => {
  it('zgodne zegary - różnica w sekundach, ton neutralny', () => {
    const r = row();
    expect(r.device.text).toBe('14:18:52');
    expect(r.gps.text).toBe('14:18:51');
    expect(r.drift.text).toBe('1 s');
    expect(r.drift.tone).toBe('dim');
    expect(r.drift.missing).toBe(false);
  });

  it('BRAK FIXA daje „brak fixa", nie zero i nie samą kreskę', () => {
    // To jest cała treść kolumny `Δ zegarów`: bez GPS nie ma DRUGIEGO zegara, więc
    // różnica nie istnieje - a projekcja spadła na czas z telefonu.
    const r = row({ gpsTime: null });
    expect(r.gps.text).toBe('-');
    expect(r.gps.className).toBe('clock-val red');
    expect(r.drift.text).toBe('brak fixa');
    expect(r.drift.text).not.toContain('0');
    expect(r.drift.missing).toBe(true);
  });

  it('rozjazd ponad próg maluje ZEGAR TELEFONU, nie GPS', () => {
    // Bursztyn na obu sugerowałby błąd fixa; rozjechał się telefon, a GPS jest
    // odniesieniem.
    const r = row({ deviceTime: at(13, 34, 47), gpsTime: at(13, 22, 47) });
    expect(r.drift.text).toBe('720 s');
    expect(r.drift.tone).toBe('amber');
    expect(r.device.tone).toBe('amber');
    expect(r.gps.className).toBeNull();
  });

  it('próg przychodzi z SERWERA - bez niego nic nie jest ostrzeżeniem', () => {
    // Panel nie zna progu `CLOCK_DRIFT` i nie ma prawa go zgadnąć. Gdy odpowiedzi
    // nie ma (`counts: null`), wiersz pokazuje liczbę bez oceny.
    const r = row({ deviceTime: at(13, 34, 47), gpsTime: at(13, 22, 47) }, null);
    expect(r.drift.text).toBe('720 s');
    expect(r.drift.tone).toBe('dim');
    expect(r.device.tone).toBeNull();
  });

  it('rozjazd DOKŁADNIE równy progowi nie jest jeszcze ostrzeżeniem', () => {
    // Reguła domeny mówi `>`, nie `>=` - i panel ma mówić to samo, co skrzynka flag.
    const r = row({ deviceTime: at(13, 0, 0) + THRESHOLD, gpsTime: at(13, 0, 0) });
    expect(r.drift.tone).toBe('dim');
  });

  it('sekundy zaokrąglamy, bo do sekund odnosi się próg', () => {
    expect(driftSeconds(1_400)).toBe('1 s');
    expect(driftSeconds(1_600)).toBe('2 s');
    expect(driftSeconds(720_000)).toBe('720 s');
  });
});

describe('wiersz rejestru: nieznane i brakujące jedzie dosłownie', () => {
  it('typ SPOZA katalogu zostaje z surowym kodem i podpisem', () => {
    const r = row({ type: 'jakis_nowy_typ' });
    expect(r.type.code).toBe('jakis_nowy_typ');
    expect(r.type.known).toBe(false);
    expect(r.type.tone).toBe('dim');
    // Kontrola z drugiej strony: znany typ dostaje ton z katalogu, nie neutralny.
    expect(row({ type: 'engine_start' }).type.tone).toBe('green');
  });

  it('samolot spoza floty pokazuje IDENTYFIKATOR i mówi dlaczego', () => {
    const r = row({ reg: null, aircraftId: 'ac-znikniety' });
    expect(r.aircraft.reg).toBe('ac-znikniety');
    expect(r.aircraft.sub).toContain('nie ma już w rejestrze');
  });

  it('konto spoza rejestru pokazuje identyfikator, a wiersz zostaje', () => {
    const r = row({ picName: null, picCode: null, picId: 'XXX' });
    expect(r.pilot.name).toBe('XXX');
    expect(r.pilot.sub).toContain('konta nie ma już w rejestrze');
  });

  it('lot szkolny wypisuje Duala w drugiej linii', () => {
    const r = row({ dualId: 'KNO', dualCode: 'KNO', dualName: 'Karol Nowak' });
    expect(r.pilot.sub).toBe('AWR · dual KNO');
  });

  it('nieczytelny stempel przyjęcia nie daje „Invalid Date"', () => {
    const r = row({ receivedAt: 'nie-data' });
    expect(r.received.text).toBe('-');
    expect(r.received.sub).toContain('nieczytelny');
  });
});

describe('wiersz rejestru: korekta przekreśla, nie usuwa', () => {
  it('unieważnione zdarzenie ZOSTAJE, oznaczone', () => {
    const r = row({ voided: true, corrected: true, adminCorrected: true });
    expect(r.voided).toBe(true);
    expect(r.adminCorrected).toBe(true);
    expect(r.gps.note).toBe('unieważnione korektą');
  });

  it('`retime` niesie NOWY czas, a zdarzenie nie jest unieważnione', () => {
    const r = row({ corrected: true, correctedTime: at(6, 33), voided: false });
    expect(r.correctedTime).toBe('06:33:00');
    expect(r.corrected).toBe(true);
    expect(r.voided).toBe(false);
  });

  it('korekta WIDAĆ w kolumnie `gps_time`: wartość przekreślona, nowy czas pod spodem', () => {
    // Bez tego zdarzenie z korektą było w tabeli nieodróżnialne od nietkniętego -
    // jedyna wzmianka mieszkała w rozwinięciu, otwieranym osobno dla każdego wiersza.
    const r = row({ corrected: true, correctedTime: at(6, 33) });
    expect(r.gps.className).toBe('clock-val struck');
    expect(r.gps.note).toBe('korekta → 06:33:00');

    // Zdarzenie BEZ fixa, któremu korekta NADAŁA czas, niesie obie klasy naraz.
    const noFix = row({ gpsTime: null, corrected: true, correctedTime: at(6, 33) });
    expect(noFix.gps.text).toBe('-');
    expect(noFix.gps.className).toBe('clock-val red struck');

    // Kontrola z drugiej strony: wiersz nietknięty nie dostaje ani klasy, ani podpisu.
    expect(row().gps.className).toBeNull();
    expect(row().gps.note).toBeNull();
  });

  it('korekta na czas PIERWOTNY zostawia ślad, choć nie zmienia ani jednej liczby', () => {
    // Para `void` → `retime` na czas pierwotny: `correctedTime` jest `null`, bo czasu
    // nie nadano, ale zdarzenie ktoś RUSZAŁ - i wiersz ma to powiedzieć. Inaczej ekran
    // sam sobie przeczy: kolumna mówi o korekcie, a rozwinięcie „nikt nie ruszał".
    const r = row({ corrected: true, correctedTime: null, voided: false });
    expect(r.corrected).toBe(true);
    expect(r.gps.note).toBe('korekta · czas bez zmiany');
    expect(r.gps.className).toBeNull();
  });

  it('„zapisał panel" bierze się z POCHODZENIA wiersza, nie z pochodzenia jego korekty', () => {
    // Zdarzenie z telefonu, którego korektę zapisał panel - kolumna `source_device`
    // opisuje telefon i nie ma prawa twierdzić niczego o panelu.
    const target = row({ adminCorrected: true, corrected: true, writtenByPanel: false });
    expect(target.sourceDevice.fromPanel).toBe(false);

    // I odwrotnie: sam wiersz korekty zapisany przez panel - podpis należy się JEMU.
    const correction = row({
      type: 'event_correction',
      sourceDevice: 'admin:TMK',
      writtenByPanel: true,
      adminCorrected: false,
    });
    expect(correction.sourceDevice.fromPanel).toBe(true);
  });

  it('typ niekorygowalny odbiera przycisk „Popraw" - lustro reguły domeny', () => {
    // Panel tej reguły NIE egzekwuje (robi to serwer przy każdym żądaniu); kopia jest
    // po to, żeby nie zapraszać człowieka w formularz, który i tak odbije.
    expect(row({ type: 'landing' }).correctable).toBe(true);
    expect(row({ type: 'session_claim' }).correctable).toBe(false);
    expect(row({ type: 'event_correction' }).correctable).toBe(false);
    // Typ spoza katalogu też nie - domena go nie zna, więc nie umie go poprawić.
    expect(row({ type: 'jakis_nowy_typ' }).correctable).toBe(false);
  });
});

describe('wiersz rejestru: skrót uuid-a', () => {
  it('długi uuid skraca się rozpoznawalnie, krótki zostaje w całości', () => {
    expect(shortUuid('9f2c4e18-b073-4a56-8ce1-d2740f6e41ab')).toBe('9f2c…41ab');
    expect(shortUuid('ev-1')).toBe('ev-1');
  });
});

describe('nagłówek zdarzenia: rozwinięcie mówi, KTÓRY zegar liczy', () => {
  it('przy fixie GPS - „z GPS", przy jego braku - „z zegara telefonu"', () => {
    const withFix = headerRows(entry(), THRESHOLD).find((r) => r.label === 'czas efektywny')!;
    expect(withFix.unit).toContain('z GPS');
    expect(withFix.tone).toBeNull();

    const noFix = headerRows(entry({ gpsTime: null }), THRESHOLD).find(
      (r) => r.label === 'czas efektywny',
    )!;
    expect(noFix.unit).toContain('zegara telefonu');
    expect(noFix.tone).toBe('amber');
  });

  it('po korekcie podpis mówi o KOREKCIE, a nie o zegarze, którego nie było', () => {
    // Domena wpisuje nadany czas w `gpsTime`, więc `effectiveClock` mówi wtedy „gps"
    // także dla zdarzenia, które fixa nigdy nie miało. Podpis „z GPS" byłby nieprawdą
    // o pochodzeniu liczby - na ekranie, który istnieje po to, żeby ją wytłumaczyć.
    const of = (over: Partial<EventEntryDto>) =>
      headerRows(entry(over), THRESHOLD).find((r) => r.label === 'czas efektywny')!;

    const retimed = of({
      gpsTime: null,
      effectiveTime: at(6, 33),
      effectiveClock: 'gps',
      corrected: true,
      correctedTime: at(6, 33),
    });
    expect(retimed.value).toBe('06:33:00');
    expect(retimed.unit).toContain('nadany korektą');
    expect(retimed.unit).not.toContain('z GPS');
    expect(retimed.tone).toBe('amber');

    // Zdarzenie unieważnione: projekcja go NIE liczy i podpis ma to powiedzieć,
    // zamiast wskazywać zegar, którego wynik i tak nie wchodzi do rachunku.
    const voided = of({ voided: true, corrected: true });
    expect(voided.unit).toContain('NIE liczy');
    expect(voided.tone).toBe('red');
  });

  it('`gps_time` bez fixa to jawny `null` z wyjaśnieniem, nie pusta komórka', () => {
    const gps = headerRows(entry({ gpsTime: null }), THRESHOLD).find((r) => r.label === 'gps_time')!;
    expect(gps.value).toBe('null');
    expect(gps.unit).toBe('brak fixa');
    expect(gps.tone).toBe('red');
  });

  it('czasy niosą SUROWĄ epokę obok zapisu czytelnego', () => {
    // `14:18:52` nie da się wkleić do `WHERE device_time = …`, a rejestr czyta się
    // razem z bazą.
    const device = headerRows(entry(), THRESHOLD).find((r) => r.label === 'device_time')!;
    expect(device.unit).toContain(String(at(14, 18, 52)));
  });

  it('wiersz „korekta" ma CZTERY różne stany, nie jeden', () => {
    const of = (over: Partial<EventEntryDto>) =>
      headerRows(entry(over), THRESHOLD).find((r) => r.label === 'korekta')!;

    expect(of({}).value).toBe('brak');
    expect(of({ voided: true, corrected: true }).value).toBe('unieważnione');
    expect(of({ corrected: true, correctedTime: at(6, 33) }).value).toContain('06:33:00');
    // Czwarty stan: korekta BYŁA, ale czasu nie zmieniła (`void` → `retime` na czas
    // pierwotny). Liczone porównaniem wartości wychodziło tu „zdarzenia nikt nie
    // ruszał" - po dwóch decyzjach administratora.
    expect(of({ corrected: true, correctedTime: null }).value).toBe('czas bez zmiany');
    // Skąd korekta przyszła - panel czy telefon pilota.
    expect(of({ voided: true, corrected: true, adminCorrected: true }).unit).toContain('panelu');
    expect(of({ voided: true, corrected: true, adminCorrected: false }).unit).toContain('telefonu');
  });

  it('`source_device` pusty mówi, że pola nie było - a nie że nie wiadomo', () => {
    const src = headerRows(entry({ sourceDevice: null }), THRESHOLD).find(
      (r) => r.label === 'source_device',
    )!;
    expect(src.value).toBe('-');
    expect(src.unit).toContain('sprzed wprowadzenia kolumny');
  });

  it('kontrola samego testu: nagłówek ma komplet pól i żadnego pustego', () => {
    // Bez tego asercje `find(...)` mogłyby przechodzić na liście, z której coś wypadło.
    const rows = headerRows(entry(), THRESHOLD);
    expect(rows.length).toBeGreaterThanOrEqual(11);
    for (const r of rows) expect(r.value.length).toBeGreaterThan(0);
  });
});
