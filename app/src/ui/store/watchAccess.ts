/**
 * Ninerdeck - PAMIĘĆ ODPOWIEDZI „czy ta osoba obserwuje samoloty" (obserwowanie 3.2.0,
 * sekcja „Obserwowane samoloty" w Ustawieniach, §6.6).
 *
 * ══ TO NIE JEST CACHE LISTY ══
 * Cały moduł wymaga sieci (§2.2): stan wierszy i sam zapis przychodzą z serwera, a bez
 * połączenia w miejscu listy stoi jedno zdanie. Ale ZDANIE ma stać wyłącznie u osoby
 * ze zdolnością - pilot bez niej sekcji nie widzi WCALE (brak sekcji, nie sekcja
 * wyszarzona). Bez sieci serwer nie odpowie, kto pyta, więc telefon pamięta OSTATNIĄ
 * ODPOWIEDŹ serwera na to jedno pytanie: `true` po liście, `false` po odmowie 403.
 * Zapamiętana jest zdolność, nie dane; z listy nie zostaje w telefonie nic.
 *
 * Per pilot i klub, jak filtr kalendarza: ta sama osoba bywa technikiem w jednym
 * klubie i zwykłym pilotem w drugim.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (pilotId: string, orgId: string): string => `ninerdeck.watch.access.${pilotId}.${orgId}`;

/** `null` = serwer jeszcze nigdy nie odpowiedział tej osobie w tym klubie. */
export async function readWatchAccess(pilotId: string, orgId: string): Promise<boolean | null> {
  try {
    const value = await AsyncStorage.getItem(key(pilotId, orgId));
    return value === '1' ? true : value === '0' ? false : null;
  } catch {
    return null;
  }
}

export async function rememberWatchAccess(pilotId: string, orgId: string, can: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(key(pilotId, orgId), can ? '1' : '0');
  } catch {
    // Nieudany zapis nie ma prawa zabrać ustawień - sekcja pojawi się przy następnej odpowiedzi.
  }
}
