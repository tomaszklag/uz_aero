/**
 * UZ Aero - panel: INICJAŁY do kółka przy nazwisku zalogowanego (`.avatar`).
 *
 * Panel nie ma zdjęć i nie ciągnie awatarów z Google; kółko istnieje po to, żeby oko
 * znalazło „kto" w tym samym rogu, co w każdej innej aplikacji web. Dwie litery
 * z dwóch pierwszych słów - imię i nazwisko - a przy jednym słowie jedna litera.
 * Pusty napis daje pusty wynik, nie wyjątek: nazwisko przychodzi z sesji i bywa puste
 * na ułamek sekundy.
 */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
