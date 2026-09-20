/**
 * Ninerdeck - WSCHÓD I ZACHÓD SŁOŃCA (milestone 3.0.0, `docs/rezerwacje.md` §7.1).
 *
 * Doba lotna klubu nie ma stałych godzin: w grudniu trwa osiem godzin, w czerwcu
 * siedemnaście. Stała 06-21 kłamałaby w obie strony - latem odcinałaby pierwszy poranny
 * lot, zimą proponowała slot po zmroku. Granice liczą się więc z EFEMERYD nad lotniskiem
 * macierzystym klubu.
 *
 * ══ ALGORYTM NOAA, BEZ ANI JEDNEJ ZALEŻNOŚCI ══
 * Te same „równania niskiej dokładności" z Almanachu Astronomicznego, których używa
 * kalkulator NOAA. Dokładność rzędu minuty w naszych szerokościach - a pytanie brzmi
 * „czy proponować slot o 19:30 w listopadzie", nie „o której dokładnie co do sekundy".
 * Precedens w tym pakiecie stoi: `geoid/undulation.ts` liczy undulację geoidy,
 * `magneticDeclination.ts` deklinację - obliczenia astronomiczno-geodezyjne mieszkają
 * w domenie, są czyste i mają testy.
 *
 * ══ CO TA FUNKCJA ODDAJE, A CZEGO NIE ROZSTRZYGA ══
 * Oddaje SAM wschód i zachód. Margines zmierzchu cywilnego (30 min z każdej strony)
 * i okno domyślne klubu bez lotniska macierzystego stoją w `policy.ts` razem z resztą
 * progów DO KALIBRACJI, a składa je `flightDayWindow`. Rozdział jest celowy: efemerydy
 * są fizyką i nie podlegają kalibracji, a margines jest decyzją produktową.
 */

const DAY_MS = 86_400_000;
const DEG = Math.PI / 180;

/** Chwila wschodu i zachodu jako ms UTC. */
export interface SunTimes {
  sunriseAt: number;
  sunsetAt: number;
}

/**
 * Wschód i zachód dla DNIA, w którym wypada `instant`, nad punktem `lat`/`lon`.
 *
 * `null` w dwóch przypadkach, które są stanem świata, a nie błędem: dzień polarny
 * i noc polarna. Wołający schodzi wtedy do okna domyślnego - klub za kołem podbiegunowym
 * nie jest naszym przypadkiem użycia, ale funkcja nie ma prawa oddać `NaN`.
 */
export function sunTimes(lat: number, lon: number, instant: number): SunTimes | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(instant)) return null;

  // Dzień juliański południa UTC tej doby - liczymy względem niego, bo o północy
  // deklinacja Słońca zmienia się najszybciej względem granic dnia kalendarzowego.
  const midnight = Math.floor(instant / DAY_MS) * DAY_MS;
  const n = julianCenturies(midnight + DAY_MS / 2);

  const declination = sunDeclination(n);
  const equationOfTime = equationOfTimeMin(n);

  // Kąt godzinny wschodu: -0,833° to środek tarczy pod horyzontem o promień tarczy
  // (0,267°) plus refrakcja atmosferyczna (0,566°) - ta sama stała, co w NOAA.
  const cosH =
    (Math.cos(90.833 * DEG) - Math.sin(lat * DEG) * Math.sin(declination)) /
    (Math.cos(lat * DEG) * Math.cos(declination));
  // |cos| > 1 znaczy, że Słońce tego dnia nie przecina horyzontu.
  if (cosH > 1 || cosH < -1) return null;

  const hourAngleMin = (Math.acos(cosH) / DEG) * 4;
  // Południe słoneczne w minutach od północy UTC: 720 minut minus poprawka na długość
  // geograficzną i równanie czasu.
  const solarNoonMin = 720 - 4 * lon - equationOfTime;

  return {
    sunriseAt: midnight + (solarNoonMin - hourAngleMin) * 60_000,
    sunsetAt: midnight + (solarNoonMin + hourAngleMin) * 60_000,
  };
}

/** Wieki juliańskie od J2000.0 - argument wszystkich szeregów niżej. */
function julianCenturies(instant: number): number {
  const julianDay = instant / DAY_MS + 2_440_587.5;
  return (julianDay - 2_451_545) / 36_525;
}

/** Deklinacja Słońca w RADIANACH. */
function sunDeclination(t: number): number {
  const obliquity = obliquityCorrected(t);
  return Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude(t)));
}

/** Długość ekliptyczna Słońca z poprawką na nutację i aberrację, w radianach. */
function apparentLongitude(t: number): number {
  const trueLong = meanLongitude(t) + equationOfCenter(t);
  const omega = 125.04 - 1934.136 * t;
  return (trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG)) * DEG;
}

/** Średnia długość geometryczna Słońca (stopnie, zawinięta do 0–360). */
function meanLongitude(t: number): number {
  const l = 280.46646 + t * (36000.76983 + t * 0.0003032);
  return ((l % 360) + 360) % 360;
}

/** Anomalia średnia Słońca (stopnie). */
function meanAnomaly(t: number): number {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}

/** Równanie środka - poprawka na eliptyczność orbity (stopnie). */
function equationOfCenter(t: number): number {
  const m = meanAnomaly(t) * DEG;
  return (
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289
  );
}

/** Nachylenie ekliptyki z poprawką na nutację, w radianach. */
function obliquityCorrected(t: number): number {
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const mean = 23 + (26 + seconds / 60) / 60;
  const omega = 125.04 - 1934.136 * t;
  return (mean + 0.00256 * Math.cos(omega * DEG)) * DEG;
}

/**
 * Równanie czasu w MINUTACH - różnica między czasem słonecznym prawdziwym a średnim.
 * Sięga ±16 minut, więc pominięcie go przesuwałoby wschód o kwadrans w lutym.
 */
function equationOfTimeMin(t: number): number {
  const epsilon = obliquityCorrected(t);
  const l0 = meanLongitude(t) * DEG;
  const m = meanAnomaly(t) * DEG;
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const y = Math.tan(epsilon / 2) ** 2;
  const eTime =
    y * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m);

  return (eTime / DEG) * 4;
}
