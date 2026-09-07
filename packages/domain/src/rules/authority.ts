/**
 * UZ Aero - UPRAWNIENIE ZAPISU widziane przez REGUŁY (`docs/architektura-panelu-serwer.md` §6).
 *
 * Domena nie zna ról, kont, tokenów ani panelu - i nie ma ich poznać. To jest odpowiedź
 * na jedno, wąskie pytanie: **czy 24-godzinne okno samodzielnej korekty pilota obowiązuje
 * tego, kto właśnie dopisuje zdarzenie**. Nic więcej z tego typu nie wynika i nic więcej
 * nie ma z niego wynikać.
 *
 * DLACZEGO PARAMETR, A NIE JEDNO Z DWÓCH ŁATWIEJSZYCH ROZWIĄZAŃ:
 *
 *  • filtrowanie naruszeń z zewnątrz (`checkAppend(...).filter(v => v.code !== '…')`) -
 *    reguła omijana spoza domeny przestaje być regułą; nie ma jednego miejsca
 *    z odpowiedzią „kto może pominąć co", a następna osoba odfiltruje dwa kody,
 *    bo „to przecież ten sam wzorzec";
 *  • druga funkcja `checkAdminAppend` - dwie funkcje, które muszą pozostać identyczne
 *    poza jedną gałęzią, rozjadą się przy pierwszej nowej regule, i to niewidocznie.
 *
 * WARTOŚĆ DOMYŚLNA JEST CZĘŚCIĄ ZABEZPIECZENIA. `checkAppend` przyjmuje `'pilot'`, gdy
 * argument pominięto: zapomnienie go NIGDY nie poszerza uprawnień. Poszerzenie musi być
 * jawnie wpisane w kod - i dlatego literał `'administrative'` wolno mieć wyłącznie
 * komendzie korekty administracyjnej (pilnuje tego test architektury serwera).
 */
export type WriteAuthority = 'pilot' | 'administrative';
