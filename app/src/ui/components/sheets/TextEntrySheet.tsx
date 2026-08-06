/**
 * UZ Aero — arkusz wpisu tekstowego z podpowiedziami (oznaczenie klienta, notatka dnia).
 *
 * Ten sam ruch, co przy trasie (issue #14): pole w formularzu jest PRZYCISKIEM
 * z wartością, a wpisywanie dzieje się w arkuszu.
 * Zysk jest tu jednak inny niż przy lotnisku — nie chodzi o to, żeby było widać
 * przeszukiwanie, tylko o to, żeby pilot NIE MUSIAŁ przepisywać tego samego
 * z pamięci: nad polem stoi lista wartości, których klub i on sam używali ostatnio.
 *
 * ARKUSZ ROŚNIE W GÓRĘ, WIĘC POLE WPISU JEST NA DOLE — dokładnie jak w arkuszu lotniska
 * i z tego samego powodu (zgłoszenie z urządzenia): arkusz stoi przyklejony do dolnej
 * krawędzi, a jego wysokość zmienia się razem z długością listy podpowiedzi. Pole na górze
 * przeskakiwało przy każdej literze, która listę zawężała — pisało się do celu, który
 * ucieka pod palcem. W stopce (`Sheet` → `footer`, poza obszarem przewijania) ma stałą
 * odległość od klawiatury, a lista rośnie i kurczy się NAD nim.
 *
 * OTWIERA SIĘ Z DOTYCHCZASOWĄ WARTOŚCIĄ, inaczej niż arkusz lotniska (tam pole startuje
 * puste). To nie jest niekonsekwencja: lotnisko się WYBIERA, a oznaczenie klienta i notatkę
 * często się POPRAWIA („zlec. 2026/114" → „…/118"), więc kasowanie wpisu przy otwarciu
 * kazałoby przepisywać całość od nowa. Lista startuje wtedy nieprzefiltrowana — filtr
 * włącza się przy pierwszej zmianie tekstu, bo dopiero ona jest pytaniem pilota.
 *
 * ARKUSZ SZUKA W HISTORII PRZY KAŻDEJ LITERZE. Wpis nie jest tylko nową wartością — jest
 * też zapytaniem do listy ostatnio używanych: „SKY" zawęża ją do zleceń tego klienta,
 * a pełna nazwa zwykle trafia w tę samą pozycję, którą pilot i tak chciał wybrać. Szukamy
 * LOKALNIE (`searchSuggestions`), po liście pobranej raz przy wejściu na ekran — bez ani
 * jednego dodatkowego zapytania do serwera i bez opóźnienia. Wpis, którego w historii nie
 * ma, zapisuje się normalnie: to wciąż pole tekstowe, a nie lista zamknięta.
 *
 * PODPOWIEDZI SĄ TYLKO ONLINE — i to jest decyzja, nie brak. Bez zasięgu arkusz działa
 * dokładnie tak jak wcześniej działało pole tekstowe: wpisujesz i potwierdzasz. Lista
 * to wygoda, nie warunek pracy (`CLAUDE.md`: „brak sieci NIGDY nie blokuje pracy pilota"),
 * dlatego jej brak mówi jedno spokojne zdanie zamiast ostrzeżenia — i dlatego nie
 * trzymamy jej w cache, którego i tak nie mielibyśmy jak unieważnić.
 *
 * Tryb `multiline` obsługuje notatkę dnia: to jedyne pole w preflightcie, w którym pilot
 * pisze zdania, a nie kod.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Sheet } from './Sheet';
import { EMPTY_SEARCH, searchSuggestions, type SuggestionSearchState } from './suggestionSearch';

/** Wiersz listy podpowiedzi: wartość + kontekst („skoki · 5 CZE"). */
export interface TextSuggestion {
  value: string;
  meta: string | null;
}

export interface TextEntrySheetProps {
  visible: boolean;
  title: string;
  initialText: string;
  placeholder?: string;
  /** Notatka dnia — pole na kilka linii zamiast jednej. */
  multiline?: boolean;
  maxLength?: number;
  /**
   * Ostatnio używane wartości. Trzy stany, bo trzy różne sytuacje:
   * `undefined` = właśnie pytamy serwer, `null` = nie udało się (offline, odmowa),
   * tablica = mamy odpowiedź, choćby pustą („klub nie ma jeszcze historii").
   */
  suggestions: readonly TextSuggestion[] | null | undefined;
  suggestionsLabel?: string;
  /** Pusty tekst = wyczyszczenie pola (wołający dostaje `''`). */
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

export function TextEntrySheet({
  visible,
  title,
  initialText,
  placeholder,
  multiline = false,
  maxLength = 200,
  suggestions,
  suggestionsLabel = 'Ostatnio używane',
  onConfirm,
  onCancel,
}: TextEntrySheetProps) {
  const { theme } = useTheme();
  const [text, setText] = useState(initialText);

  /**
   * Wynik ostatniego przeszukania historii + jego pamięć („od którego wpisu było pusto").
   * Trzymamy je w stanie, a nie liczymy w renderze, bo krótkie spięcie z `searchSuggestions`
   * ma sens tylko wtedy, gdy pamięta poprzedni wpis — a render tego nie pamięta.
   */
  const [matches, setMatches] = useState<TextSuggestion[]>([]);
  const search = useRef<SuggestionSearchState>(EMPTY_SEARCH);

  useEffect(() => {
    if (!visible) return;
    setText(initialText);
    // Otwarcie zaczyna od stanu spoczynku listy: cała historia, pusta pamięć spięcia.
    search.current = EMPTY_SEARCH;
    setMatches(suggestions == null ? [] : [...suggestions]);
  }, [visible, initialText, suggestions]);

  const change = useCallback(
    (next: string) => {
      setText(next);
      if (suggestions == null) return;
      const result = searchSuggestions(suggestions, next, search.current);
      search.current = result.state;
      setMatches(result.matches);
    },
    [suggestions],
  );

  return (
    <Sheet
      visible={visible}
      title={title}
      confirmLabel="ZAPISZ"
      onConfirm={() => onConfirm(text.trim())}
      onCancel={onCancel}
      /* POLE WPISU NA DOLE — patrz nota „ARKUSZ ROŚNIE W GÓRĘ" na górze pliku. */
      footer={
        <TextInput
          autoFocus
          value={text}
          onChangeText={change}
          multiline={multiline}
          maxLength={maxLength}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.selection}
          cursorColor={theme.colors.textPrimary}
          accessibilityLabel={title}
          // Notatka bywa kilkuzdaniowa, ale arkusz ma sufit wysokości i własne przewijanie
          // (`Sheet`), więc pole rośnie do rozsądnej granicy, a nie w nieskończoność.
          style={{
            minHeight: multiline ? 108 : 48,
            maxHeight: multiline ? 168 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidthStrong,
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surface,
            color: theme.colors.textPrimary,
            fontFamily: theme.fontFamily.body,
            fontSize: 15,
            lineHeight: 21,
          }}
        />
      }
    >
      {/* CZTERY POWODY PUSTEJ LISTY I CZTERY RÓŻNE ODPOWIEDZI. Milczący arkusz wyglądał jak
          niedziałające pobieranie — a „jeszcze pytamy", „brak sieci", „klub nie ma jeszcze
          historii" i „wpis do niczego nie pasuje" to cztery zupełnie różne sytuacje.
          Podczas pytania milczymy z rozmysłem: komunikat, który zaraz zniknie, jest gorszy
          niż chwila ciszy. */}
      {suggestions === undefined ? null : suggestions === null ? (
        // Brak sieci nie jest tu awarią i nie zasługuje na amber: pole działa bez zmian,
        // tylko bez listy. Jedno zdanie, żeby pilot nie szukał podpowiedzi, których nie ma.
        <AppText variant="mono" tone="muted" style={styles.note}>
          Podpowiedzi wymagają połączenia — wpisz wartość ręcznie
        </AppText>
      ) : suggestions.length === 0 ? (
        // Serwer odpowiedział, tylko nie ma czym: pierwszy dzień klubu albo pierwsza notatka.
        <AppText variant="mono" tone="muted" style={styles.note}>
          Historia jest pusta — to będzie pierwszy wpis
        </AppText>
      ) : matches.length === 0 ? (
        // Historia jest, ale wpis do niczego nie pasuje — wartość zapisze się jako nowa.
        text.trim().length > 0 && (
          <AppText variant="mono" tone="muted" style={styles.note}>
            Brak w historii — zapisze się jako nowy wpis
          </AppText>
        )
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="mono" tone="muted" style={styles.label}>
            {text.trim().length > 0 ? 'Z historii' : suggestionsLabel}
          </AppText>
          <View style={{ gap: 6 }}>
            {matches.map((row) => (
              <Pressable
                key={row.value}
                accessibilityRole="button"
                accessibilityLabel={row.value}
                onPress={() => onConfirm(row.value)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderRadius: theme.radius.md,
                    borderWidth: theme.borderWidth,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceRaised,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <AppText variant="body" tone="secondary" numberOfLines={2} style={styles.value}>
                  {row.value}
                </AppText>
                {row.meta != null && (
                  <AppText variant="mono" tone="muted" style={styles.meta}>
                    {row.meta}
                  </AppText>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  note: { fontSize: 9, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48, // cel dotykowy dla rękawic
  },
  value: { flex: 1, fontSize: 13 },
  meta: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 },
});
