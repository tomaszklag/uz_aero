/**
 * UZ Aero — katalog polskich lotnisk (dane statyczne).
 *
 * PO CO: mapa śladu rysuje trasę na siatce współrzędnych, bez kafelków (decyzja
 * 2026-08-04). Sama linia w pustce nie mówi jednak, GDZIE lot się odbył — dopiero
 * pas startowy z podpisem daje odniesienie, które pilot rozpoznaje bez zastanowienia.
 *
 * ŹRÓDŁO: OurAirports (`ourairports.com`), zbiór w DOMENIE PUBLICZNEJ — bez klucza,
 * bez limitów i bez wymogu atrybucji, choć ją podajemy. Wygenerowane z `airports.csv`
 * i `runways.csv`; filtr: Polska, kod ICAO `EP**`, lotniska czynne (bez heliportów
 * i zamkniętych), najdłuższy czynny pas każdego z nich.
 *
 * DLACZEGO STATYCZNIE, A NIE Z BAZY: lotniska zmieniają się w skali lat, a ekran śladu
 * ma działać bez sieci — pobieranie katalogu z serwera dokładałoby zależność sieciową
 * dokładnie tam, gdzie jej świadomie nie ma. Odświeżenie to ponowne uruchomienie
 * generatora i jeden commit.
 *
 * PLIK GENEROWANY — nie edytuj ręcznie.
 * Rekordów: 106.
 */

/** Pas startowy: kierunek geograficzny i długość. Null, gdy dane go nie podają. */
export interface AirfieldRunway {
  /** Kurs geograficzny progu (stopnie 0–360). */
  headingDeg: number;
  lengthM: number;
}

/** Lotnisko z katalogu. */
export interface Airfield {
  /** Kod ICAO — ten sam, który pilot wpisuje w preflighcie (`departureIcao`). */
  icao: string;
  name: string;
  lat: number;
  lon: number;
  /** Elewacja (stopy AMSL); null, gdy źródło jej nie podaje. */
  elevationFt: number | null;
  runway: AirfieldRunway | null;
}

export const POLISH_AIRFIELDS: readonly Airfield[] = [
  { icao: 'EPAR', name: "Arłamów Airfield", lat: 49.6575, lon: 22.5143, elevationFt: 1455, runway: { headingDeg: 167, lengthM: 1193 } },
  { icao: 'EPBA', name: "Bielsko-Biała Aleksandrowice Airfield", lat: 49.805, lon: 19.0019, elevationFt: 1319, runway: { headingDeg: 93, lengthM: 510 } },
  { icao: 'EPBB', name: "Babięta", lat: 53.6679, lon: 21.25543, elevationFt: 512, runway: { headingDeg: 145, lengthM: 600 } },
  { icao: 'EPBC', name: "Warsaw Babice Airport", lat: 52.2692, lon: 20.9072, elevationFt: 352, runway: { headingDeg: 103, lengthM: 1300 } },
  { icao: 'EPBK', name: "Białystok-Krywlany Airfield", lat: 53.1014, lon: 23.1706, elevationFt: 502, runway: { headingDeg: 0, lengthM: 950 } },
  { icao: 'EPBY', name: "Ignacy Jan Paderewski Bydgoszcz Airport", lat: 53.0968, lon: 17.9777, elevationFt: 235, runway: { headingDeg: 82, lengthM: 2500 } },
  { icao: 'EPCD', name: "Depułtycze Królewskie Airfield", lat: 51.08207, lon: 23.43701, elevationFt: 712, runway: { headingDeg: 0, lengthM: 1020 } },
  { icao: 'EPCE', name: "Cewice Naval Air Base", lat: 54.41653, lon: 17.76573, elevationFt: 495, runway: { headingDeg: 76, lengthM: 2504 } },
  { icao: 'EPDA', name: "Darłówo Naval Air Base", lat: 54.4047, lon: 16.3531, elevationFt: 10, runway: null },
  { icao: 'EPDE', name: "Deblin Military Air Base", lat: 51.55102, lon: 21.89232, elevationFt: 392, runway: { headingDeg: 121, lengthM: 2500 } },
  { icao: 'EPDK', name: "Debowa Klada Airfield", lat: 51.6126, lon: 23.0072, elevationFt: null, runway: null },
  { icao: 'EPDS', name: "Witków Airfield", lat: 50.79686, lon: 16.11448, elevationFt: null, runway: null },
  { icao: 'EPEL', name: "Elbląg Airfield", lat: 54.1408, lon: 19.4233, elevationFt: 10, runway: { headingDeg: 80, lengthM: 913 } },
  { icao: 'EPGD', name: "Gdańsk Lech Wałęsa Airport", lat: 54.3776, lon: 18.4662, elevationFt: 489, runway: { headingDeg: 113, lengthM: 2800 } },
  { icao: 'EPGE', name: "Giże Airfield", lat: 53.98244, lon: 22.40315, elevationFt: null, runway: null },
  { icao: 'EPGI', name: "Grudziądz Lisie Kąty Airfield", lat: 53.5244, lon: 18.8492, elevationFt: 121, runway: { headingDeg: 135, lengthM: 1060 } },
  { icao: 'EPGL', name: "Gliwice-Trynek Airfield", lat: 50.26874, lon: 18.67247, elevationFt: 830, runway: { headingDeg: 87, lengthM: 900 } },
  { icao: 'EPGM', name: "Giżycko-Mazury Residence", lat: 54.00645, lon: 21.81824, elevationFt: 410, runway: null },
  { icao: 'EPGR', name: "Łańsk / Gryźliny Airfield", lat: 53.60807, lon: 20.34969, elevationFt: 538, runway: null },
  { icao: 'EPGS', name: "Grójec-Słomczyn Airfield", lat: 51.87549, lon: 20.93774, elevationFt: null, runway: null },
  { icao: 'EPGY', name: "Grądy Airfield", lat: 52.83698, lon: 21.77764, elevationFt: 407, runway: null },
  { icao: 'EPHN', name: "Narew", lat: 52.90878, lon: 23.54134, elevationFt: null, runway: null },
  { icao: 'EPIN', name: "Inowrocław Airfield", lat: 52.80615, lon: 18.28313, elevationFt: 279, runway: null },
  { icao: 'EPIR', name: "Inowroclaw Military Air Base", lat: 52.8294, lon: 18.3306, elevationFt: 259, runway: { headingDeg: 0, lengthM: 400 } },
  { icao: 'EPJA', name: "Jastarnia Airfield", lat: 54.71028, lon: 18.64528, elevationFt: 3, runway: null },
  { icao: 'EPJG', name: "Jelenia Góra Airfield", lat: 50.8989, lon: 15.7856, elevationFt: 1119, runway: null },
  { icao: 'EPJL', name: "Laszki Field", lat: 50.0085, lon: 22.9189, elevationFt: 607, runway: null },
  { icao: 'EPJS', name: "Jeżów Sudecki Airfield", lat: 50.94403, lon: 15.76653, elevationFt: 1834, runway: null },
  { icao: 'EPKA', name: "Kielce-Masłów Airfield", lat: 50.8967, lon: 20.7317, elevationFt: 1010, runway: { headingDeg: 0, lengthM: 1155 } },
  { icao: 'EPKB', name: "Kazimierz Biskupi Airfield", lat: 52.31955, lon: 18.16432, elevationFt: 361, runway: null },
  { icao: 'EPKD', name: "Końskie-Komaszyce", lat: 51.25532, lon: 20.47132, elevationFt: null, runway: null },
  { icao: 'EPKE', name: "Kȩtrzyn-Wilamowo Airfield", lat: 54.04714, lon: 21.42612, elevationFt: 417, runway: null },
  { icao: 'EPKI', name: "Kikity", lat: 53.9829, lon: 20.87722, elevationFt: 564, runway: { headingDeg: 0, lengthM: 732 } },
  { icao: 'EPKK', name: "Kraków John Paul II International Airport", lat: 50.0777, lon: 19.7848, elevationFt: 791, runway: { headingDeg: 78, lengthM: 2550 } },
  { icao: 'EPKL', name: "Krasocin Field", lat: 50.89932, lon: 20.12804, elevationFt: 820, runway: null },
  { icao: 'EPKM', name: "Katowice-Muchowiec Airfield", lat: 50.23818, lon: 19.03368, elevationFt: 909, runway: { headingDeg: 49, lengthM: 1109 } },
  { icao: 'EPKN', name: "Opole-Kamień Śląski Airfield", lat: 50.5306, lon: 18.07928, elevationFt: 683, runway: { headingDeg: 112, lengthM: 1200 } },
  { icao: 'EPKP', name: "Pobiednik Wielki Airfield", lat: 50.08644, lon: 20.20025, elevationFt: 650, runway: { headingDeg: 0, lengthM: 1000 } },
  { icao: 'EPKR', name: "Krosno Airfield", lat: 49.68381, lon: 21.74095, elevationFt: 922, runway: { headingDeg: 0, lengthM: 1100 } },
  { icao: 'EPKS', name: "Krzesiny Military Air Base", lat: 52.3317, lon: 16.9664, elevationFt: 265, runway: { headingDeg: 118, lengthM: 2500 } },
  { icao: 'EPKT', name: "Katowice Wojciech Korfanty International Airport", lat: 50.47601, lon: 19.0807, elevationFt: 995, runway: { headingDeg: 90, lengthM: 3200 } },
  { icao: 'EPKW', name: "Bielsko-Biała Kaniów Airfield", lat: 49.94159, lon: 19.01957, elevationFt: 839, runway: { headingDeg: 0, lengthM: 995 } },
  { icao: 'EPLB', name: "Lublin Airport", lat: 51.24016, lon: 22.71346, elevationFt: 633, runway: { headingDeg: 72, lengthM: 2520 } },
  { icao: 'EPLK', name: "Łask Air Base", lat: 51.5517, lon: 19.1791, elevationFt: 633, runway: { headingDeg: 108, lengthM: 3000 } },
  { icao: 'EPLL', name: "Łódź Władysław Reymont Airport", lat: 51.7219, lon: 19.3981, elevationFt: 604, runway: { headingDeg: 71, lengthM: 2500 } },
  { icao: 'EPLR', name: "Lublin Radwiec Airfield", lat: 51.2219, lon: 22.3947, elevationFt: 791, runway: null },
  { icao: 'EPLS', name: "Leszno-Strzyzewice Airfield", lat: 51.835, lon: 16.5219, elevationFt: 310, runway: { headingDeg: 53, lengthM: 1320 } },
  { icao: 'EPLU', name: "Lubin Airfield", lat: 51.423, lon: 16.1962, elevationFt: 512, runway: { headingDeg: 130, lengthM: 1000 } },
  { icao: 'EPLY', name: "Leźnica Wielka Air Base", lat: 52.00494, lon: 19.14379, elevationFt: 404, runway: { headingDeg: 0, lengthM: 2500 } },
  { icao: 'EPMB', name: "Malbork Królewo Air Base", lat: 54.0266, lon: 19.13572, elevationFt: 16, runway: { headingDeg: 79, lengthM: 2500 } },
  { icao: 'EPMI', name: "Miroslawiec Military Air Base", lat: 53.3951, lon: 16.0828, elevationFt: 459, runway: { headingDeg: 125, lengthM: 2500 } },
  { icao: 'EPML', name: "Mielec Airfield", lat: 50.3223, lon: 21.4621, elevationFt: 548, runway: { headingDeg: 90, lengthM: 2492 } },
  { icao: 'EPMM', name: "Minsk Mazowiecki Military Air Base", lat: 52.1955, lon: 21.6559, elevationFt: 604, runway: { headingDeg: 90, lengthM: 2513 } },
  { icao: 'EPMO', name: "Warsaw Modlin Airport", lat: 52.4511, lon: 20.6518, elevationFt: 341, runway: { headingDeg: 82, lengthM: 2500 } },
  { icao: 'EPMR', name: "Mirosławice Private Airfield", lat: 50.9578, lon: 16.7703, elevationFt: 495, runway: { headingDeg: 175, lengthM: 845 } },
  { icao: 'EPMX', name: "Milewo Airfield", lat: 52.66521, lon: 20.42842, elevationFt: 325, runway: null },
  { icao: 'EPMY', name: "Myślibórz-Giżyn Airfield", lat: 52.94116, lon: 15.02981, elevationFt: 230, runway: { headingDeg: 153, lengthM: 920 } },
  { icao: 'EPNA', name: "Nadarzyce Air Base", lat: 53.45488, lon: 16.48946, elevationFt: null, runway: null },
  { icao: 'EPNL', name: "Nowy Sącz-Łososina Dolna Airfield", lat: 49.74532, lon: 20.62347, elevationFt: 830, runway: { headingDeg: 0, lengthM: 800 } },
  { icao: 'EPNM', name: "Nowe Miasto nad Pilicą Airfield", lat: 51.62833, lon: 20.54123, elevationFt: 512, runway: null },
  { icao: 'EPNT', name: "Nowy Targ Airfield", lat: 49.4628, lon: 20.0503, elevationFt: 2060, runway: { headingDeg: 0, lengthM: 1680 } },
  { icao: 'EPOD', name: "Olsztyn-Dajtki Airfield", lat: 53.77389, lon: 20.41347, elevationFt: 440, runway: { headingDeg: 0, lengthM: 850 } },
  { icao: 'EPOK', name: "Oksywie Air Base / Gdynia-Kosakowo Airfield", lat: 54.5797, lon: 18.5172, elevationFt: 144, runway: { headingDeg: 136, lengthM: 2496 } },
  { icao: 'EPOM', name: "Ostrów Wielkopolski Michałków Airfield", lat: 51.70077, lon: 17.84663, elevationFt: 476, runway: null },
  { icao: 'EPOP', name: "Opole-Polska Nowa Wieś Airfield", lat: 50.6333, lon: 17.7817, elevationFt: 620, runway: null },
  { icao: 'EPPC', name: "Pińczów Airfield", lat: 50.51744, lon: 20.51676, elevationFt: 610, runway: null },
  { icao: 'EPPI', name: "Piła Airfield", lat: 53.1701, lon: 16.71109, elevationFt: 259, runway: { headingDeg: 35, lengthM: 2401 } },
  { icao: 'EPPK', name: "Poznań-Kobylnica Airfield", lat: 52.43458, lon: 17.04404, elevationFt: 279, runway: { headingDeg: 68, lengthM: 750 } },
  { icao: 'EPPL', name: "Płock Airfield", lat: 52.56222, lon: 19.72032, elevationFt: 331, runway: null },
  { icao: 'EPPO', name: "Poznań-Ławica Airport", lat: 52.4216, lon: 16.82336, elevationFt: 308, runway: { headingDeg: 108, lengthM: 2504 } },
  { icao: 'EPPR', name: "Pruszcz Gdański Air Base", lat: 54.248, lon: 18.6716, elevationFt: 17, runway: { headingDeg: 0, lengthM: 1166 } },
  { icao: 'EPPT', name: "Piotrków Trybunalski-Bujny Airfield", lat: 51.3831, lon: 19.6883, elevationFt: 673, runway: { headingDeg: 0, lengthM: 950 } },
  { icao: 'EPPW', name: "Powidz Military Air Base", lat: 52.38009, lon: 17.85316, elevationFt: 371, runway: { headingDeg: 107, lengthM: 3525 } },
  { icao: 'EPRA', name: "Warsaw Radom Airport", lat: 51.38937, lon: 21.21474, elevationFt: 610, runway: { headingDeg: 75, lengthM: 2500 } },
  { icao: 'EPRD', name: "Mazury Air Camp Airfield", lat: 54.13437, lon: 21.59875, elevationFt: 398, runway: null },
  { icao: 'EPRG', name: "Rybnik-Gotartowice Glider Field", lat: 50.0708, lon: 18.6283, elevationFt: 840, runway: null },
  { icao: 'EPRJ', name: "Rzeszów Sports Airfield", lat: 50.10417, lon: 22.04703, elevationFt: 655, runway: { headingDeg: 89, lengthM: 900 } },
  { icao: 'EPRP', name: "Radom-Piastrów Airfield", lat: 51.4789, lon: 21.11, elevationFt: 479, runway: null },
  { icao: 'EPRS', name: "Sochaczew-Rybno", lat: 52.24279, lon: 20.12658, elevationFt: 280, runway: null },
  { icao: 'EPRU', name: "Częstochowa-Rudniki Airport", lat: 50.88472, lon: 19.20184, elevationFt: 860, runway: { headingDeg: 83, lengthM: 2000 } },
  { icao: 'EPRZ', name: "Rzeszów-Jasionka Airport", lat: 50.10979, lon: 22.02416, elevationFt: 693, runway: { headingDeg: 91, lengthM: 3200 } },
  { icao: 'EPSC', name: "Solidarity Szczecin–Goleniów Airport", lat: 53.5847, lon: 14.9022, elevationFt: 154, runway: { headingDeg: 131, lengthM: 2500 } },
  { icao: 'EPSD', name: "Szczecin-Dąbie Airfield", lat: 53.39066, lon: 14.63277, elevationFt: 3, runway: { headingDeg: 94, lengthM: 1000 } },
  { icao: 'EPSJ', name: "Sobienie Field", lat: 51.95114, lon: 21.35253, elevationFt: null, runway: null },
  { icao: 'EPSK', name: "Słupsk-Krȩpa Airfield", lat: 54.41004, lon: 17.09057, elevationFt: 249, runway: null },
  { icao: 'EPSN', name: "Swidwin Military Air Base", lat: 53.7906, lon: 15.8263, elevationFt: 394, runway: { headingDeg: 111, lengthM: 2499 } },
  { icao: 'EPSS', name: "Świdnica - Krzczonów Airstrip", lat: 50.81718, lon: 16.58186, elevationFt: 833, runway: null },
  { icao: 'EPST', name: "Stalowa Wola-Turbia Airfield", lat: 50.62638, lon: 21.99896, elevationFt: 492, runway: { headingDeg: 126, lengthM: 930 } },
  { icao: 'EPSU', name: "Suwałki Airfield", lat: 54.0728, lon: 22.8992, elevationFt: 581, runway: { headingDeg: 0, lengthM: 1319 } },
  { icao: 'EPSW', name: "Świdnik Airfield", lat: 51.2319, lon: 22.6903, elevationFt: 659, runway: { headingDeg: 72, lengthM: 2520 } },
  { icao: 'EPSY', name: "Olsztyn-Mazury Airport", lat: 53.4819, lon: 20.9377, elevationFt: 463, runway: { headingDeg: 19, lengthM: 2500 } },
  { icao: 'EPTM', name: "Tomaszów Mazowiecki Military Air Base", lat: 51.5844, lon: 20.0978, elevationFt: 571, runway: { headingDeg: 116, lengthM: 1999 } },
  { icao: 'EPTO', name: "Toruń Airfield", lat: 53.0292, lon: 18.5459, elevationFt: 164, runway: { headingDeg: 104, lengthM: 1269 } },
  { icao: 'EPVA', name: "Roszczep Airstrip", lat: 52.4359, lon: 21.33, elevationFt: 325, runway: { headingDeg: 0, lengthM: 1355 } },
  { icao: 'EPWA', name: "Warsaw Chopin Airport", lat: 52.1657, lon: 20.9671, elevationFt: 362, runway: { headingDeg: 152, lengthM: 3690 } },
  { icao: 'EPWK', name: "Włocławek-Kruszyn Airfield", lat: 52.5847, lon: 19.0156, elevationFt: 220, runway: { headingDeg: 0, lengthM: 1000 } },
  { icao: 'EPWR', name: "Copernicus Wrocław Airport", lat: 51.10372, lon: 16.8821, elevationFt: 404, runway: { headingDeg: 116, lengthM: 2503 } },
  { icao: 'EPWS', name: "Wrocław-Szymanów Airfield", lat: 51.2061, lon: 16.9986, elevationFt: 390, runway: { headingDeg: 0, lengthM: 770 } },
  { icao: 'EPZA', name: "Zamość-Mokre Airfield", lat: 50.7017, lon: 23.2044, elevationFt: 751, runway: { headingDeg: 0, lengthM: 800 } },
  { icao: 'EPZB', name: "Zborowo Airfield", lat: 52.36206, lon: 16.63872, elevationFt: 268, runway: null },
  { icao: 'EPZG', name: "Zielona Góra-Babimost Airport", lat: 52.1385, lon: 15.7986, elevationFt: 194, runway: { headingDeg: 65, lengthM: 2500 } },
  { icao: 'EPZI', name: "Zieleń Airfield", lat: 53.1885, lon: 18.9617, elevationFt: 315, runway: null },
  { icao: 'EPZK', name: "Konopnica Airfield", lat: 51.36018, lon: 18.82206, elevationFt: null, runway: null },
  { icao: 'EPZL', name: "Zdziar-Lopatki Airfield", lat: 52.63547, lon: 20.07036, elevationFt: 440, runway: null },
  { icao: 'EPZP', name: "Zielona Góra-Przylep Airfield", lat: 51.9789, lon: 15.4639, elevationFt: 249, runway: { headingDeg: 0, lengthM: 880 } },
  { icao: 'EPZR', name: "Żar Airfield", lat: 49.7711, lon: 19.2181, elevationFt: 1260, runway: null },
];

/** Wyszukanie po kodzie ICAO (bez rozróżniania wielkości liter). */
export function airfieldByIcao(icao: string | null | undefined): Airfield | null {
  if (icao == null) return null;
  const key = icao.trim().toUpperCase();
  return POLISH_AIRFIELDS.find((a) => a.icao === key) ?? null;
}
