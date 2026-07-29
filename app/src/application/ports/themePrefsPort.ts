/**
 * UZ Aero — PORT lokalnego zapisu preferencji motywu (decyzja 2026-07-29: motyw
 * jest preferencją PILOTA, nie telefonu).
 *
 * Rekord żyje PER PILOT (na wspólnym telefonie po przelogowaniu wchodzi motyw
 * nowego pilota) i niesie księgowość uzgadniania z serwerem: `updatedAt` to stempel
 * DECYZJI pilota (oś LWW po obu stronach), `dirty` — „zmiana lokalna czeka na
 * wysyłkę". Port istnieje, bo warstwa aplikacji nie może dotykać AsyncStorage
 * (moduł RN) — implementację wstrzykuje composition root, testy dają pamięć.
 *
 * Nazwa motywu jest tu NIEPRZEZROCZYSTA: listę motywów znają wyłącznie tokeny UI
 * (`ui/theme/tokens.ts`), a sens nazwy ocenia ThemeProvider przy nakładaniu.
 */

export interface ThemePrefRecord {
  theme: string;
  /** Epoch ms chwili, w której pilot WYBRAŁ ten motyw — nie chwili zapisu na dysk. */
  updatedAt: number;
  /** true = wybór nie dotarł jeszcze na serwer (`PUT /me/prefs` przy okazji). */
  dirty: boolean;
}

export interface ThemePrefsPort {
  /** Rekord pilota; `null` = pilot nigdy nie wybrał motywu na tym telefonie. */
  read(pilotId: string): Promise<ThemePrefRecord | null>;
  write(pilotId: string, record: ThemePrefRecord): Promise<void>;
}
