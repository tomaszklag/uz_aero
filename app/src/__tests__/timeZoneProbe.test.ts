/**
 * Sonda stref czasowych (issue #157 A2) - testy.
 *
 * Node ma pełne dane ICU, więc sonda puszczona na prawdziwym `Intl` zawsze wypadnie
 * dobrze. Ten plik pilnuje więc czegoś innego: czy sonda UMIE ZAWIEŚĆ. Jej jedyne
 * zadanie to wykryć Hermesa bez ICU, a taki Hermes nie rzuca - przyjmuje `timeZone`
 * i po cichu formatuje w UTC. Sonda, która sprawdza tylko „czy się nie wywaliło",
 * odpowiedziałaby wtedy „działa" i wysłała nas w złą stronę na całym epiku #159.
 */

import {
  PROBE_ZONE,
  probeTimeZones,
  type FormatterFactory,
} from '../ui/screens/logic/timeZoneProbe';

describe('sonda stref czasowych', () => {
  it('na prawdziwym Intl (Node z ICU) orzeka, że strefy działają', () => {
    const result = probeTimeZones();

    expect(result.verdict).toBe('ok');
    expect(result.checks.every((c) => c.passed)).toBe(true);
    expect(result.summary).toContain('telefon policzy godziny klubu sam');
  });

  it('wykrywa Hermesa bez ICU, który przyjmuje strefę i formatuje w UTC', () => {
    // Dokładnie ten przypadek, dla którego sonda istnieje: żadnego wyjątku, poprawny
    // kształt odpowiedzi, wartości liczone tak, jakby strefy nie było.
    const bezIcu: FormatterFactory = () => ({
      format: (date: Date) =>
        `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`,
      resolvedOptions: () => ({ timeZone: 'UTC' }),
    });

    const result = probeTimeZones(bezIcu);

    expect(result.verdict).toBe('broken');
    expect(result.summary).toContain('offsety musi dosyłać serwer');
    // Lato i zima muszą wypaść RÓŻNIE od oczekiwań - to one dowodzą braku ICU.
    const lato = result.checks.find((c) => c.name.includes('letni'));
    expect(lato).toMatchObject({ passed: false, expected: '12:00', actual: '10:00' });
  });

  it('wykrywa formater, który zna offset, ale nie zna czasu letniego', () => {
    // Stały +1 h: wygląda sensownie w styczniu i kłamie w czerwcu. Bez przypadku
    // „lato" sonda przepuściłaby taki silnik.
    const stalyOffset: FormatterFactory = () => ({
      format: (date: Date) => {
        const t = new Date(date.getTime() + 60 * 60 * 1000);
        return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
      },
    });

    const result = probeTimeZones(stalyOffset);

    expect(result.verdict).toBe('broken');
    expect(result.checks.find((c) => c.name.includes('zimowy'))?.passed).toBe(true);
    expect(result.checks.find((c) => c.name.includes('letni'))?.passed).toBe(false);
  });

  it('wyjątek przy tworzeniu formatera znaczy brak stref, nie awarię sondy', () => {
    const rzuca: FormatterFactory = () => {
      throw new RangeError('Invalid time zone specified: ' + PROBE_ZONE);
    };

    const result = probeTimeZones(rzuca);

    expect(result.verdict).toBe('missing');
    expect(result.deviceZone).toBeNull();
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.actual).toContain('Invalid time zone');
  });

  it('podaje strefę urządzenia, gdy formater ją zna', () => {
    const result = probeTimeZones();
    // W Node to strefa systemowa - sonda ma ją tylko przepisać, bez interpretacji.
    expect(typeof result.deviceZone === 'string' || result.deviceZone === null).toBe(true);
  });
});
