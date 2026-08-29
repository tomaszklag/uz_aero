/**
 * UZ Aero - katalog polskich lotnisk (dane statyczne).
 *
 * PO CO: mapa śladu rysuje trasę na siatce współrzędnych, bez kafelków (decyzja
 * 2026-08-04). Sama linia w pustce nie mówi jednak, GDZIE lot się odbył - dopiero
 * pas startowy z podpisem daje odniesienie, które pilot rozpoznaje bez zastanowienia.
 *
 * ŹRÓDŁA (dwa, w tej kolejności - uzasadnienie i odrzucone warianty: `docs/dane-lotnisk.md`):
 *
 *   1. OurAirports (`ourairports.com`) - DOMENA PUBLICZNA. Szkielet katalogu: kod ICAO,
 *      nazwa, pozycja, elewacja, a także pas wszędzie tam, gdzie źródło go podaje.
 *   2. OpenStreetMap (`aeroway=runway`) - licencja **ODbL**. Wyłącznie pasy lotnisk,
 *      których OurAirports nie ma; w praktyce lotniska aeroklubowe i lądowiska.
 *
 * ATRYBUCJA I ODbL: ten plik jest bazą pochodną od OSM, więc jest udostępniony na ODbL,
 * a ekran śladu podaje „© współtwórcy OpenStreetMap". Pole `source` przy każdym pasie
 * mówi, którego rekordu to dotyczy.
 *
 * DLACZEGO STATYCZNIE, A NIE Z BAZY: lotniska zmieniają się w skali lat, a ekran śladu
 * ma działać bez sieci - pobieranie katalogu z serwera dokładałoby zależność sieciową
 * dokładnie tam, gdzie jej świadomie nie ma. Odświeżenie to ponowne uruchomienie
 * generatora (`packages/domain/scripts/generateAirfields.ts`) i jeden commit.
 *
 * PLIK GENEROWANY - nie edytuj ręcznie.
 * Rekordów: 106, z pasem: 106 (z tego z OSM: 57).
 */

/** Skąd pochodzi pas - atrybucja ODbL dotyczy wyłącznie rekordów `'osm'`. */
export type RunwaySource = 'ourairports' | 'osm';

/** Pas startowy: kierunek geograficzny i długość. Null, gdy żadne źródło go nie podaje. */
export interface AirfieldRunway {
  /** Kurs geograficzny progu (stopnie 0–360). */
  headingDeg: number;
  lengthM: number;
  source: RunwaySource;
}

/** Lotnisko z katalogu. */
export interface Airfield {
  /** Kod ICAO - ten sam, który pilot wpisuje w preflighcie (`departureIcao`). */
  icao: string;
  name: string;
  lat: number;
  lon: number;
  /** Elewacja (stopy AMSL); null, gdy źródło jej nie podaje. */
  elevationFt: number | null;
  runway: AirfieldRunway | null;
}

export const POLISH_AIRFIELDS: readonly Airfield[] = [
  { icao: 'EPAR', name: "Arłamów Airfield", lat: 49.6575, lon: 22.5143, elevationFt: 1455, runway: { headingDeg: 167, lengthM: 1193, source: 'ourairports' } },
  { icao: 'EPBA', name: "Bielsko-Biała Aleksandrowice Airfield", lat: 49.805, lon: 19.0019, elevationFt: 1319, runway: { headingDeg: 93, lengthM: 510, source: 'ourairports' } },
  { icao: 'EPBB', name: "Babięta", lat: 53.6679, lon: 21.25543, elevationFt: 512, runway: { headingDeg: 145, lengthM: 600, source: 'ourairports' } },
  { icao: 'EPBC', name: "Warsaw Babice Airport", lat: 52.2692, lon: 20.9072, elevationFt: 352, runway: { headingDeg: 103, lengthM: 1300, source: 'ourairports' } },
  { icao: 'EPBK', name: "Białystok-Krywlany Airfield", lat: 53.1014, lon: 23.1706, elevationFt: 502, runway: { headingDeg: 92, lengthM: 1328, source: 'osm' } },
  { icao: 'EPBY', name: "Ignacy Jan Paderewski Bydgoszcz Airport", lat: 53.0968, lon: 17.9777, elevationFt: 235, runway: { headingDeg: 82, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPCD', name: "Depułtycze Królewskie Airfield", lat: 51.08207, lon: 23.43701, elevationFt: 712, runway: { headingDeg: 191, lengthM: 1020, source: 'osm' } },
  { icao: 'EPCE', name: "Cewice Naval Air Base", lat: 54.41653, lon: 17.76573, elevationFt: 495, runway: { headingDeg: 76, lengthM: 2504, source: 'ourairports' } },
  { icao: 'EPDA', name: "Darłówo Naval Air Base", lat: 54.4047, lon: 16.3531, elevationFt: 10, runway: { headingDeg: 43, lengthM: 588, source: 'osm' } },
  { icao: 'EPDE', name: "Deblin Military Air Base", lat: 51.55102, lon: 21.89232, elevationFt: 392, runway: { headingDeg: 121, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPDK', name: "Debowa Klada Airfield", lat: 51.6126, lon: 23.0072, elevationFt: null, runway: { headingDeg: 12, lengthM: 920, source: 'osm' } },
  { icao: 'EPDS', name: "Witków Airfield", lat: 50.79686, lon: 16.11448, elevationFt: null, runway: { headingDeg: 154, lengthM: 901, source: 'osm' } },
  { icao: 'EPEL', name: "Elbląg Airfield", lat: 54.1408, lon: 19.4233, elevationFt: 10, runway: { headingDeg: 80, lengthM: 913, source: 'ourairports' } },
  { icao: 'EPGD', name: "Gdańsk Lech Wałęsa Airport", lat: 54.3776, lon: 18.4662, elevationFt: 489, runway: { headingDeg: 113, lengthM: 2800, source: 'ourairports' } },
  { icao: 'EPGE', name: "Giże Airfield", lat: 53.98244, lon: 22.40315, elevationFt: null, runway: { headingDeg: 137, lengthM: 766, source: 'osm' } },
  { icao: 'EPGI', name: "Grudziądz Lisie Kąty Airfield", lat: 53.5244, lon: 18.8492, elevationFt: 121, runway: { headingDeg: 135, lengthM: 1060, source: 'ourairports' } },
  { icao: 'EPGL', name: "Gliwice-Trynek Airfield", lat: 50.26874, lon: 18.67247, elevationFt: 830, runway: { headingDeg: 87, lengthM: 900, source: 'ourairports' } },
  { icao: 'EPGM', name: "Giżycko-Mazury Residence", lat: 54.00645, lon: 21.81824, elevationFt: 410, runway: { headingDeg: 111, lengthM: 857, source: 'osm' } },
  { icao: 'EPGR', name: "Łańsk / Gryźliny Airfield", lat: 53.60807, lon: 20.34969, elevationFt: 538, runway: { headingDeg: 119, lengthM: 941, source: 'osm' } },
  { icao: 'EPGS', name: "Grójec-Słomczyn Airfield", lat: 51.87549, lon: 20.93774, elevationFt: null, runway: { headingDeg: 74, lengthM: 1123, source: 'osm' } },
  { icao: 'EPGY', name: "Grądy Airfield", lat: 52.83698, lon: 21.77764, elevationFt: 407, runway: { headingDeg: 96, lengthM: 803, source: 'osm' } },
  { icao: 'EPHN', name: "Narew", lat: 52.90878, lon: 23.54134, elevationFt: null, runway: { headingDeg: 136, lengthM: 1494, source: 'osm' } },
  { icao: 'EPIN', name: "Inowrocław Airfield", lat: 52.80615, lon: 18.28313, elevationFt: 279, runway: { headingDeg: 83, lengthM: 756, source: 'osm' } },
  { icao: 'EPIR', name: "Inowroclaw Military Air Base", lat: 52.8294, lon: 18.3306, elevationFt: 259, runway: { headingDeg: 53, lengthM: 1913, source: 'osm' } },
  { icao: 'EPJA', name: "Jastarnia Airfield", lat: 54.71028, lon: 18.64528, elevationFt: 3, runway: { headingDeg: 121, lengthM: 599, source: 'osm' } },
  { icao: 'EPJG', name: "Jelenia Góra Airfield", lat: 50.8989, lon: 15.7856, elevationFt: 1119, runway: { headingDeg: 115, lengthM: 803, source: 'osm' } },
  { icao: 'EPJL', name: "Laszki Field", lat: 50.0085, lon: 22.9189, elevationFt: 607, runway: { headingDeg: 79, lengthM: 793, source: 'osm' } },
  { icao: 'EPJS', name: "Jeżów Sudecki Airfield", lat: 50.94403, lon: 15.76653, elevationFt: 1834, runway: { headingDeg: 96, lengthM: 357, source: 'osm' } },
  { icao: 'EPKA', name: "Kielce-Masłów Airfield", lat: 50.8967, lon: 20.7317, elevationFt: 1010, runway: { headingDeg: 110, lengthM: 1154, source: 'osm' } },
  { icao: 'EPKB', name: "Kazimierz Biskupi Airfield", lat: 52.31955, lon: 18.16432, elevationFt: 361, runway: { headingDeg: 91, lengthM: 639, source: 'osm' } },
  { icao: 'EPKD', name: "Końskie-Komaszyce", lat: 51.25532, lon: 20.47132, elevationFt: null, runway: { headingDeg: 89, lengthM: 653, source: 'osm' } },
  { icao: 'EPKE', name: "Kȩtrzyn-Wilamowo Airfield", lat: 54.04714, lon: 21.42612, elevationFt: 417, runway: { headingDeg: 152, lengthM: 1179, source: 'osm' } },
  { icao: 'EPKI', name: "Kikity", lat: 53.9829, lon: 20.87722, elevationFt: 564, runway: { headingDeg: 112, lengthM: 854, source: 'osm' } },
  { icao: 'EPKK', name: "Kraków John Paul II International Airport", lat: 50.0777, lon: 19.7848, elevationFt: 791, runway: { headingDeg: 78, lengthM: 2550, source: 'ourairports' } },
  { icao: 'EPKL', name: "Krasocin Field", lat: 50.89932, lon: 20.12804, elevationFt: 820, runway: { headingDeg: 130, lengthM: 1072, source: 'osm' } },
  { icao: 'EPKM', name: "Katowice-Muchowiec Airfield", lat: 50.23818, lon: 19.03368, elevationFt: 909, runway: { headingDeg: 49, lengthM: 1109, source: 'ourairports' } },
  { icao: 'EPKN', name: "Opole-Kamień Śląski Airfield", lat: 50.5306, lon: 18.07928, elevationFt: 683, runway: { headingDeg: 112, lengthM: 1200, source: 'ourairports' } },
  { icao: 'EPKP', name: "Pobiednik Wielki Airfield", lat: 50.08644, lon: 20.20025, elevationFt: 650, runway: { headingDeg: 94, lengthM: 1097, source: 'osm' } },
  { icao: 'EPKR', name: "Krosno Airfield", lat: 49.68381, lon: 21.74095, elevationFt: 922, runway: { headingDeg: 16, lengthM: 730, source: 'ourairports' } },
  { icao: 'EPKS', name: "Krzesiny Military Air Base", lat: 52.3317, lon: 16.9664, elevationFt: 265, runway: { headingDeg: 118, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPKT', name: "Katowice Wojciech Korfanty International Airport", lat: 50.47601, lon: 19.0807, elevationFt: 995, runway: { headingDeg: 90, lengthM: 3200, source: 'ourairports' } },
  { icao: 'EPKW', name: "Bielsko-Biała Kaniów Airfield", lat: 49.94159, lon: 19.01957, elevationFt: 839, runway: { headingDeg: 133, lengthM: 989, source: 'osm' } },
  { icao: 'EPLB', name: "Lublin Airport", lat: 51.24016, lon: 22.71346, elevationFt: 633, runway: { headingDeg: 72, lengthM: 2520, source: 'ourairports' } },
  { icao: 'EPLK', name: "Łask Air Base", lat: 51.5517, lon: 19.1791, elevationFt: 633, runway: { headingDeg: 108, lengthM: 3000, source: 'ourairports' } },
  { icao: 'EPLL', name: "Łódź Władysław Reymont Airport", lat: 51.7219, lon: 19.3981, elevationFt: 604, runway: { headingDeg: 71, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPLR', name: "Lublin Radwiec Airfield", lat: 51.2219, lon: 22.3947, elevationFt: 791, runway: { headingDeg: 117, lengthM: 897, source: 'osm' } },
  { icao: 'EPLS', name: "Leszno-Strzyzewice Airfield", lat: 51.835, lon: 16.5219, elevationFt: 310, runway: { headingDeg: 53, lengthM: 1320, source: 'ourairports' } },
  { icao: 'EPLU', name: "Lubin Airfield", lat: 51.423, lon: 16.1962, elevationFt: 512, runway: { headingDeg: 130, lengthM: 1000, source: 'ourairports' } },
  { icao: 'EPLY', name: "Leźnica Wielka Air Base", lat: 52.00494, lon: 19.14379, elevationFt: 404, runway: { headingDeg: 104, lengthM: 2482, source: 'osm' } },
  { icao: 'EPMB', name: "Malbork Królewo Air Base", lat: 54.0266, lon: 19.13572, elevationFt: 16, runway: { headingDeg: 79, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPMI', name: "Miroslawiec Military Air Base", lat: 53.3951, lon: 16.0828, elevationFt: 459, runway: { headingDeg: 125, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPML', name: "Mielec Airfield", lat: 50.3223, lon: 21.4621, elevationFt: 548, runway: { headingDeg: 90, lengthM: 2492, source: 'ourairports' } },
  { icao: 'EPMM', name: "Minsk Mazowiecki Military Air Base", lat: 52.1955, lon: 21.6559, elevationFt: 604, runway: { headingDeg: 90, lengthM: 2513, source: 'ourairports' } },
  { icao: 'EPMO', name: "Warsaw Modlin Airport", lat: 52.4511, lon: 20.6518, elevationFt: 341, runway: { headingDeg: 82, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPMR', name: "Mirosławice Private Airfield", lat: 50.9578, lon: 16.7703, elevationFt: 495, runway: { headingDeg: 175, lengthM: 845, source: 'ourairports' } },
  { icao: 'EPMX', name: "Milewo Airfield", lat: 52.66521, lon: 20.42842, elevationFt: 325, runway: { headingDeg: 179, lengthM: 931, source: 'osm' } },
  { icao: 'EPMY', name: "Myślibórz-Giżyn Airfield", lat: 52.94116, lon: 15.02981, elevationFt: 230, runway: { headingDeg: 153, lengthM: 920, source: 'ourairports' } },
  { icao: 'EPNA', name: "Nadarzyce Air Base", lat: 53.45488, lon: 16.48946, elevationFt: null, runway: { headingDeg: 166, lengthM: 1992, source: 'osm' } },
  { icao: 'EPNL', name: "Nowy Sącz-Łososina Dolna Airfield", lat: 49.74532, lon: 20.62347, elevationFt: 830, runway: { headingDeg: 42, lengthM: 964, source: 'osm' } },
  { icao: 'EPNM', name: "Nowe Miasto nad Pilicą Airfield", lat: 51.62833, lon: 20.54123, elevationFt: 512, runway: { headingDeg: 76, lengthM: 2387, source: 'osm' } },
  { icao: 'EPNT', name: "Nowy Targ Airfield", lat: 49.4628, lon: 20.0503, elevationFt: 2060, runway: { headingDeg: 121, lengthM: 1419, source: 'osm' } },
  { icao: 'EPOD', name: "Olsztyn-Dajtki Airfield", lat: 53.77389, lon: 20.41347, elevationFt: 440, runway: { headingDeg: 95, lengthM: 848, source: 'osm' } },
  { icao: 'EPOK', name: "Oksywie Air Base / Gdynia-Kosakowo Airfield", lat: 54.5797, lon: 18.5172, elevationFt: 144, runway: { headingDeg: 136, lengthM: 2496, source: 'ourairports' } },
  { icao: 'EPOM', name: "Ostrów Wielkopolski Michałków Airfield", lat: 51.70077, lon: 17.84663, elevationFt: 476, runway: { headingDeg: 114, lengthM: 958, source: 'osm' } },
  { icao: 'EPOP', name: "Opole-Polska Nowa Wieś Airfield", lat: 50.6333, lon: 17.7817, elevationFt: 620, runway: { headingDeg: 74, lengthM: 722, source: 'osm' } },
  { icao: 'EPPC', name: "Pińczów Airfield", lat: 50.51744, lon: 20.51676, elevationFt: 610, runway: { headingDeg: 116, lengthM: 732, source: 'osm' } },
  { icao: 'EPPI', name: "Piła Airfield", lat: 53.1701, lon: 16.71109, elevationFt: 259, runway: { headingDeg: 35, lengthM: 2401, source: 'ourairports' } },
  { icao: 'EPPK', name: "Poznań-Kobylnica Airfield", lat: 52.43458, lon: 17.04404, elevationFt: 279, runway: { headingDeg: 68, lengthM: 750, source: 'ourairports' } },
  { icao: 'EPPL', name: "Płock Airfield", lat: 52.56222, lon: 19.72032, elevationFt: 331, runway: { headingDeg: 123, lengthM: 736, source: 'osm' } },
  { icao: 'EPPO', name: "Poznań-Ławica Airport", lat: 52.4216, lon: 16.82336, elevationFt: 308, runway: { headingDeg: 108, lengthM: 2504, source: 'ourairports' } },
  { icao: 'EPPR', name: "Pruszcz Gdański Air Base", lat: 54.248, lon: 18.6716, elevationFt: 17, runway: { headingDeg: 100, lengthM: 1328, source: 'osm' } },
  { icao: 'EPPT', name: "Piotrków Trybunalski-Bujny Airfield", lat: 51.3831, lon: 19.6883, elevationFt: 673, runway: { headingDeg: 32, lengthM: 955, source: 'osm' } },
  { icao: 'EPPW', name: "Powidz Military Air Base", lat: 52.38009, lon: 17.85316, elevationFt: 371, runway: { headingDeg: 107, lengthM: 3525, source: 'ourairports' } },
  { icao: 'EPRA', name: "Warsaw Radom Airport", lat: 51.38937, lon: 21.21474, elevationFt: 610, runway: { headingDeg: 75, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPRD', name: "Mazury Air Camp Airfield", lat: 54.13437, lon: 21.59875, elevationFt: 398, runway: { headingDeg: 5, lengthM: 500, source: 'osm' } },
  { icao: 'EPRG', name: "Rybnik-Gotartowice Glider Field", lat: 50.0708, lon: 18.6283, elevationFt: 840, runway: { headingDeg: 94, lengthM: 616, source: 'osm' } },
  { icao: 'EPRJ', name: "Rzeszów Sports Airfield", lat: 50.10417, lon: 22.04703, elevationFt: 655, runway: { headingDeg: 89, lengthM: 900, source: 'ourairports' } },
  { icao: 'EPRP', name: "Radom-Piastrów Airfield", lat: 51.4789, lon: 21.11, elevationFt: 479, runway: { headingDeg: 57, lengthM: 777, source: 'osm' } },
  { icao: 'EPRS', name: "Sochaczew-Rybno", lat: 52.24279, lon: 20.12658, elevationFt: 280, runway: { headingDeg: 183, lengthM: 571, source: 'osm' } },
  { icao: 'EPRU', name: "Częstochowa-Rudniki Airport", lat: 50.88472, lon: 19.20184, elevationFt: 860, runway: { headingDeg: 83, lengthM: 2000, source: 'ourairports' } },
  { icao: 'EPRZ', name: "Rzeszów-Jasionka Airport", lat: 50.10979, lon: 22.02416, elevationFt: 693, runway: { headingDeg: 91, lengthM: 3200, source: 'ourairports' } },
  { icao: 'EPSC', name: "Solidarity Szczecin–Goleniów Airport", lat: 53.5847, lon: 14.9022, elevationFt: 154, runway: { headingDeg: 131, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPSD', name: "Szczecin-Dąbie Airfield", lat: 53.39066, lon: 14.63277, elevationFt: 3, runway: { headingDeg: 94, lengthM: 1000, source: 'ourairports' } },
  { icao: 'EPSJ', name: "Sobienie Field", lat: 51.95114, lon: 21.35253, elevationFt: null, runway: { headingDeg: 96, lengthM: 773, source: 'osm' } },
  { icao: 'EPSK', name: "Słupsk-Krȩpa Airfield", lat: 54.41004, lon: 17.09057, elevationFt: 249, runway: { headingDeg: 104, lengthM: 1031, source: 'osm' } },
  { icao: 'EPSN', name: "Swidwin Military Air Base", lat: 53.7906, lon: 15.8263, elevationFt: 394, runway: { headingDeg: 111, lengthM: 2499, source: 'ourairports' } },
  { icao: 'EPSS', name: "Świdnica - Krzczonów Airstrip", lat: 50.81718, lon: 16.58186, elevationFt: 833, runway: { headingDeg: 113, lengthM: 465, source: 'osm' } },
  { icao: 'EPST', name: "Stalowa Wola-Turbia Airfield", lat: 50.62638, lon: 21.99896, elevationFt: 492, runway: { headingDeg: 126, lengthM: 930, source: 'ourairports' } },
  { icao: 'EPSU', name: "Suwałki Airfield", lat: 54.0728, lon: 22.8992, elevationFt: 581, runway: { headingDeg: 84, lengthM: 1303, source: 'osm' } },
  { icao: 'EPSW', name: "Świdnik Airfield", lat: 51.2319, lon: 22.6903, elevationFt: 659, runway: { headingDeg: 72, lengthM: 2520, source: 'ourairports' } },
  { icao: 'EPSY', name: "Olsztyn-Mazury Airport", lat: 53.4819, lon: 20.9377, elevationFt: 463, runway: { headingDeg: 19, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPTM', name: "Tomaszów Mazowiecki Military Air Base", lat: 51.5844, lon: 20.0978, elevationFt: 571, runway: { headingDeg: 116, lengthM: 1999, source: 'ourairports' } },
  { icao: 'EPTO', name: "Toruń Airfield", lat: 53.0292, lon: 18.5459, elevationFt: 164, runway: { headingDeg: 104, lengthM: 1269, source: 'ourairports' } },
  { icao: 'EPVA', name: "Roszczep Airstrip", lat: 52.4359, lon: 21.33, elevationFt: 325, runway: { headingDeg: 138, lengthM: 1350, source: 'osm' } },
  { icao: 'EPWA', name: "Warsaw Chopin Airport", lat: 52.1657, lon: 20.9671, elevationFt: 362, runway: { headingDeg: 152, lengthM: 3690, source: 'ourairports' } },
  { icao: 'EPWK', name: "Włocławek-Kruszyn Airfield", lat: 52.5847, lon: 19.0156, elevationFt: 220, runway: { headingDeg: 87, lengthM: 981, source: 'osm' } },
  { icao: 'EPWR', name: "Copernicus Wrocław Airport", lat: 51.10372, lon: 16.8821, elevationFt: 404, runway: { headingDeg: 116, lengthM: 2503, source: 'ourairports' } },
  { icao: 'EPWS', name: "Wrocław-Szymanów Airfield", lat: 51.2061, lon: 16.9986, elevationFt: 390, runway: { headingDeg: 144, lengthM: 771, source: 'osm' } },
  { icao: 'EPZA', name: "Zamość-Mokre Airfield", lat: 50.7017, lon: 23.2044, elevationFt: 751, runway: { headingDeg: 125, lengthM: 950, source: 'osm' } },
  { icao: 'EPZB', name: "Zborowo Airfield", lat: 52.36206, lon: 16.63872, elevationFt: 268, runway: { headingDeg: 101, lengthM: 846, source: 'osm' } },
  { icao: 'EPZG', name: "Zielona Góra-Babimost Airport", lat: 52.1385, lon: 15.7986, elevationFt: 194, runway: { headingDeg: 65, lengthM: 2500, source: 'ourairports' } },
  { icao: 'EPZI', name: "Zieleń Airfield", lat: 53.1885, lon: 18.9617, elevationFt: 315, runway: { headingDeg: 120, lengthM: 498, source: 'osm' } },
  { icao: 'EPZK', name: "Konopnica Airfield", lat: 51.36018, lon: 18.82206, elevationFt: null, runway: { headingDeg: 154, lengthM: 555, source: 'osm' } },
  { icao: 'EPZL', name: "Zdziar-Lopatki Airfield", lat: 52.63547, lon: 20.07036, elevationFt: 440, runway: { headingDeg: 57, lengthM: 564, source: 'osm' } },
  { icao: 'EPZP', name: "Zielona Góra-Przylep Airfield", lat: 51.9789, lon: 15.4639, elevationFt: 249, runway: { headingDeg: 61, lengthM: 1066, source: 'osm' } },
  { icao: 'EPZR', name: "Żar Airfield", lat: 49.7711, lon: 19.2181, elevationFt: 1260, runway: { headingDeg: 45, lengthM: 429, source: 'osm' } },
];

/** Wyszukanie po kodzie ICAO (bez rozróżniania wielkości liter). */
export function airfieldByIcao(icao: string | null | undefined): Airfield | null {
  if (icao == null) return null;
  const key = icao.trim().toUpperCase();
  return POLISH_AIRFIELDS.find((a) => a.icao === key) ?? null;
}
