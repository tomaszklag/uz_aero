/**
 * UZ Aero - arkusz wyboru lotniska (krok 2 preflightu, issue #14).
 *
 * DLACZEGO ARKUSZ, A NIE POLE W FORMULARZU. Wcześniej trasa była zwykłym `TextField`,
 * a katalog podpowiadał listą pod wierszem. Zgłoszenie z urządzenia brzmiało: „trochę
 * nie widać, że tam jest przeszukiwanie" - pole z czterema kratkami wygląda jak miejsce
 * na przepisanie kodu z pamięci i niczym nie zdradza, że można wpisać „zielona".
 *
 * TO JEST WYSZUKIWARKA, NIE FORMULARZ Z LISTĄ POD SPODEM (druga tura przeglądu).
 * Wszystko, co arkusz robi, zamyka się w jednym ruchu: pilot pisze, lista się zawęża,
 * tapnięcie w pozycję JEST wyborem - arkusz się zamyka i wraca wartość. Stąd trzy
 * decyzje, które łatwo wziąć za przeoczenia:
 *
 *  • **nie ma przycisku „WYBIERZ"** - stałby obok pozycji, którą pilot właśnie tapnął,
 *    i pytał o zgodę na to, co już zrobił (`Sheet` bez `confirmLabel` daje sam „ANULUJ");
 *  • **nie ma linii z nazwą pod polem wpisu** - nazwa stoi w wierszu listy, czyli tam,
 *    gdzie pilot patrzy, wybierając. Ta sama nazwa dwa razy na jednym ekranie robiła
 *    stan „coś jest wybrane, a pod spodem nadal wiszą podpowiedzi", w którym nie było
 *    wiadomo, co właściwie obowiązuje;
 *  • **pole startuje PUSTE**, nawet gdy trasa jest już wpisana. Otwierasz wyszukiwarkę,
 *    żeby coś zmienić, a nie żeby oglądać poprzedni wpis; dotychczasowa wartość i tak
 *    stoi w formularzu pod arkuszem i zostaje, jeśli tapniesz „ANULUJ".
 *
 * DOTYCHCZASOWY WYBÓR WIDAĆ NA GÓRZE - sekcja „Wybrane" z zielonym obramowaniem
 * i ptaszkiem (zgłoszenie z urządzenia). Puste pole wpisu nie znaczy „nic nie wybrano",
 * więc arkusz otwarty ponownie musi to rozróżnienie pokazać, zamiast wyglądać identycznie
 * jak przy pierwszym wyborze. Sekcja znika przy pisaniu: wtedy pytaniem jest wpis, a nie
 * stan sprzed chwili - ale trafienie w wynikach i tak dostaje ten sam ptaszek.
 *
 * PUSTE PYTANIE MA ODPOWIEDŹ: bez wpisanego tekstu lista pokazuje lotniska NAJBLIŻSZE
 * pilotowi (`nearestAirfields`) - zwykle stoi na tym, z którego zaraz wystartuje, więc
 * pierwsza pozycja jest zwykle tą właściwą. Bez pozycji (brak fixa, uprawnienie jeszcze
 * niedane - o lokalizację prosimy dopiero na kroku 4) arkusz jest po prostu PUSTĄ
 * WYSZUKIWARKĄ i tak ma wyglądać: przypis „Wpisz kod ICAO albo nazwę lotniska" był
 * placeholderem pola powtórzonym dwa centymetry wyżej (issue #62).
 *
 * REZYGNACJA Z TRASY TO „×" NA WYBRANYM WIERSZU, w miejscu ptaszka (issue #62). Do tej
 * pory był to link „Wyczyść lotnisko (EPKK)" na dnie arkusza - napis stojący osobno,
 * powtarzający kod widoczny wyżej i nazywający czynność, którą ikona mówi krócej.
 * Akcja należy do WARTOŚCI, więc stoi przy niej.
 *
 * KOD SPOZA KATALOGU wchodzi osobnym wierszem („Użyj kodu EDDB"), a nie po cichu:
 * katalog obejmuje Polskę, przelot potrafi skończyć się w Berlinie i to jest normalny
 * dzień - ale świadome tapnięcie odróżnia „lecę do EDDB" od literówki w EPKK.
 *
 * ARKUSZ ROŚNIE W GÓRĘ, WIĘC POLE WPISU JEST NA DOLE (zgłoszenie z urządzenia). Arkusz
 * stoi przyklejony do dolnej krawędzi ekranu, a jego wysokość zależy od liczby wyników -
 * pole na górze przeskakiwało więc przy każdej literze, która zmieniała długość listy:
 * pisało się do celu, który ucieka pod palcem. Na dole (`Sheet` → `footer`, poza obszarem
 * przewijania) pole ma stałą odległość od klawiatury, a lista rośnie i kurczy się NAD nim.
 * Kolejność czytania zostaje naturalna: najtrafniejsze na górze listy, bo to porządek
 * odpowiedzi, a nie odległość od kciuka.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '../../theme';
import { useSheetInputFocus } from '../../hooks/useSheetInputFocus';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { AirfieldSuggestions } from '../input/AirfieldSuggestions';
import { PlaceholderOverlay } from '../input/PlaceholderOverlay';
import { Tag } from '../status/Tag';
import { toneColors } from '../tone';
import { airfieldRow } from '../input/airfieldRow';
import { FOREIGN_AIRFIELD_NOTE, FOREIGN_AIRFIELD_TAG } from '../input/airfieldMark';
import { Sheet } from './Sheet';
import { icaoToStore } from './airfieldEntry';
import { airfieldByIcao, nearestAirfields, searchAirfields, type LatLon } from '../../../domain';

export interface AirfieldSheetProps {
  visible: boolean;
  /** „Lotnisko skoków", „Lotnisko startu", „Lotnisko lądowania". */
  title: string;
  /** Wartość, którą pilot ma teraz w polu - potrzebna wyłącznie do „wyczyść". */
  currentIcao: string;
  /** Pozycja pilota do listy „najbliżej Ciebie"; `null` = nie znamy jej. */
  position: LatLon | null;
  onConfirm: (icao: string) => void;
  onCancel: () => void;
}

/** Ile pozycji mieści się nad klawiaturą, żeby nie trzeba było przewijać listy. */
const LIMIT = 6;

export function AirfieldSheet({
  visible,
  title,
  currentIcao,
  position,
  onConfirm,
  onCancel,
}: AirfieldSheetProps) {
  const { theme } = useTheme();
  const amber = toneColors(theme, 'amber');
  const [text, setText] = useState('');
  const { inputRef, onShow } = useSheetInputFocus();

  useEffect(() => {
    // Każde otwarcie zaczyna od pustego pola - patrz nota na górze pliku.
    if (visible) setText('');
  }, [visible]);

  const query = text.trim();
  const searching = query.length > 0;

  /**
   * Wiersz lotniska, które pilot ma już w polu - stoi na GÓRZE arkusza, ze znacznikiem
   * wyboru (zgłoszenie z urządzenia: „jak znów tam wejdę, to powinienem widzieć, że coś
   * jest zaznaczone"). Kod spoza katalogu też dostaje wiersz, tylko bez nazwy: pilot ma
   * zobaczyć SWÓJ wybór, a nie pustkę po nim.
   */
  const selectedRow = useMemo(() => {
    if (currentIcao.length === 0) return null;
    const known = airfieldByIcao(currentIcao);
    return known != null
      ? airfieldRow(known)
      : { icao: currentIcao, name: 'Kod spoza katalogu', meta: null };
  }, [currentIcao]);

  const rows = useMemo(() => {
    if (searching) return searchAirfields(query, { limit: LIMIT }).map(airfieldRow);
    // Puste pole: podpowiadamy po POŁOŻENIU, a odległość wchodzi w drugą linię wiersza,
    // bo to ona rozstrzyga wybór („EPRA 3 NM" vs „EPLL 61 NM"). Wybrane lotnisko wypada
    // z tej listy - stoi wyżej, we własnej sekcji, i dwa razy byłoby tylko myleniem.
    return nearestAirfields(position, { limit: LIMIT })
      .filter((near) => near.airfield.icao !== currentIcao)
      .map((near) => {
        const row = airfieldRow(near.airfield);
        const distance = `${near.distanceNm < 10 ? near.distanceNm.toFixed(1) : Math.round(near.distanceNm)} NM`;
        return { ...row, meta: row.meta == null ? distance : `${distance} · ${row.meta}` };
      });
  }, [searching, query, position, currentIcao]);

  /** Kod poprawny kształtem, którego katalog nie zna - do wzięcia osobnym wierszem. */
  const foreign = useMemo(() => {
    const code = icaoToStore(query);
    if (code == null || code.length === 0) return null;
    return airfieldByIcao(code) == null ? code : null;
  }, [query]);

  return (
    <Sheet
      visible={visible}
      title={title}
      cancelLabel="ANULUJ"
      onCancel={onCancel}
      /* Klawiatura od otwarcia - drabinka prób z `useSheetInputFocus` (issue #58
         pkt 7, druga tura: pojedynczy focus w onShow bywał nadal za wcześnie). */
      onShow={onShow}
      /* POLE WPISU JEST NA DOLE - patrz nota „ARKUSZ ROŚNIE W GÓRĘ" na górze pliku. */
      footer={
        <View
          style={[
            styles.inputRow,
            {
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: theme.radius.lg - 2,
              borderWidth: theme.borderWidthStrong,
              borderColor: theme.colors.borderStrong,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <Icon name="search" size={16} color={theme.colors.textMuted} />
          {/* POLE JEST MONO, PLACEHOLDER SKŁADEM TEKSTOWYM (issue #58): kod pisze
              się krojem kodu, ale zachęta jest instrukcją i idzie body 15
              w `textPlaceholder` - jak placeholder arkusza notatki. Natywnemu
              placeholderowi nie da się nadać osobnego kroju, a zmiana kroju POLA
              przy pustym stanie skakałaby wysokością - stąd `PlaceholderOverlay`
              POD polem: metryka pola stała, kursor i znaki malują się na wierzchu. */}
          <View style={styles.inputWrap}>
            <PlaceholderOverlay visible={text.length === 0} text="Kod ICAO albo nazwa…" />
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              autoCapitalize="characters"
              autoCorrect={false}
              selectionColor={theme.colors.selection}
              cursorColor={theme.colors.textPrimary}
              accessibilityLabel={title}
              style={{
                padding: 0,
                fontFamily: theme.fontFamily.mono,
                fontSize: 16,
                letterSpacing: 1.5,
                color: theme.colors.textPrimary,
              }}
            />
          </View>
        </View>
      }
    >
      {/* WYBRANE NA GÓRZE - pilot, który wraca do arkusza, ma od razu widzieć, co jest
          w polu, i nie musi tego szukać wzrokiem w propozycjach. Sekcja znika przy
          pisaniu: wtedy pytaniem jest wpis, a nie stan sprzed chwili (trafienie i tak
          zostanie oznaczone ptaszkiem, jeśli wpadnie w wyniki). */}
      {!searching && selectedRow != null && (
        <AirfieldSuggestions
          label="Wybrane"
          rows={[selectedRow]}
          selectedIcao={currentIcao}
          onPick={onConfirm}
          /* „×" W MIEJSCU ptaszka (issue #62) - rezygnacja z trasy była do tej pory
             linkiem „Wyczyść lotnisko (EPKK)" na dnie arkusza: napisem stojącym
             osobno i powtarzającym kod widoczny wyżej. Akcja należy do wartości,
             więc stoi przy niej. */
          onClear={() => onConfirm('')}
        />
      )}

      <AirfieldSuggestions
        label={searching ? 'Podpowiedzi' : 'Najbliżej Ciebie'}
        rows={rows}
        selectedIcao={currentIcao}
        onPick={onConfirm}
      />

      {/* KOD SPOZA KATALOGU - świadome tapnięcie, nie ciche przyjęcie literówki, ale
          od issue #62 pkt 1 także WIDOCZNIE inny od wierszy katalogu. Do #62 wiersz
          był szary jak każda podpowiedź i różnił się wyłącznie zdaniem obok, więc
          w liście wyników czytał się jak kolejne lotnisko. Bursztyn i plakietka mówią,
          że to jest wybór innego rodzaju - dokładnie ten sam znacznik, który zostanie
          potem przy wartości w formularzu (`airfieldValueProps`).

          Bursztyn, nie czerwień: kod jest poprawny i zapisze się bez przeszkód -
          to rzecz do wiedzy, nie do poprawienia. */}
      {foreign != null && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Użyj kodu ${foreign} - ${FOREIGN_AIRFIELD_TAG}`}
          onPress={() => onConfirm(foreign)}
          style={({ pressed }) => [
            styles.extra,
            {
              borderRadius: theme.radius.md,
              borderWidth: theme.borderWidthStrong,
              borderColor: amber.border,
              backgroundColor: amber.muted,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <AppText variant="mono" style={{ ...styles.extraCode, color: amber.accent }}>
            {foreign}
          </AppText>
          <View style={styles.extraBody}>
            <Tag label={FOREIGN_AIRFIELD_TAG} tone="amber" />
            {/* Zdanie mówi o SKUTKU tapnięcia, nie o zawartości katalogu (issue #62
                pkt 1): „katalog zna tylko polskie lotniska" opisywało budowę aplikacji
                komuś, kto wpisuje kod lotniska docelowego. */}
            <AppText variant="body" tone="secondary" style={styles.extraText}>
              {FOREIGN_AIRFIELD_NOTE}
            </AppText>
          </View>
        </Pressable>
      )}

      {/* PRZYPISU „Wpisz kod ICAO albo nazwę lotniska" TU NIE MA (issue #62): dokładnie
          to samo zdanie stoi w polu wpisu jako placeholder, dwa centymetry niżej.
          Bez pozycji i bez wpisu arkusz jest po prostu pustą wyszukiwarką - i tak ma
          wyglądać, bo tym jest. */}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Kotwica nakładki placeholdera: `absoluteFill` liczy się względem tego pudełka.
  inputWrap: { flex: 1, justifyContent: 'center' },
  extra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 11,
    paddingVertical: 9,
    minHeight: 48, // cel dotykowy dla rękawic
  },
  extraCode: { fontSize: 14, letterSpacing: 2, minWidth: 52 },
  // Plakietka nad zdaniem, nie obok: wiersz ma 48 px wysokości i oba naraz w jednej
  // linii wypychałyby kod poza kontrolkę na wąskim telefonie.
  extraBody: { flex: 1, gap: 3, alignItems: 'flex-start' },
  extraText: { fontSize: 11 },
});
