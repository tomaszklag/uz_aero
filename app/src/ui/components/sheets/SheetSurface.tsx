/**
 * UZ Aero - RAMA ARKUSZA wysuwanego od dołu (`.modal-overlay` + `.modal-sheet`).
 *
 * ══ PO CO OSOBNY KOMPONENT ══
 * Bo arkuszy jest osiem, a rama była kopiowana: `Modal`, przyciemnione tło z tapnięciem
 * „anuluj", kontener przyklejony do dołu, panel z promieniem 24 i akcentowaną krawędzią
 * górną. Kopia numer siedem gubiła zwykle to samo - SUFIT WYSOKOŚCI. Arkusz korekty
 * zdarzenia z kompletem wierszy odniesienia dobijał przez to do samej góry telefonu
 * i przestawał wyglądać jak wstawka NAD ekranem: bez pasa przyciemnionego tła czytał się
 * jak nowy ekran, a jedyną poszlaką zostawał uchwyt, którego nikt nie szuka
 * (zgłoszenie z urządzenia, 2026-08-14).
 *
 * ══ CO RAMA GWARANTUJE KAŻDEMU ARKUSZOWI ══
 *  • **widać ekran pod spodem** - sufit `sheetMaxHeight` zostawia `SHEET_TOP_GAP` ponad
 *    bezpiecznym obszarem, więc arkusz nigdy nie dobija do krawędzi;
 *  • **treść się przewija, a akcje zostają** - gdy zabraknie miejsca, skraca się to, co
 *    pilot może doczytać przewinięciem, a nie to, czym arkusz się zamyka. Rząd akcji idzie
 *    do `pinned`, poza obszar przewijania;
 *  • **dolna krawędź nie wpada pod klawiaturę ani pod pasek nawigacji** (`sheetBottomPad`);
 *  • **„wstecz" Androida zamyka arkusz, nie ekran** - `Modal` z RN, nie własna nakładka.
 *
 * Rama NIE zna treści: tytuł, pola i przyciski należą do konkretnego arkusza. Zmienne
 * zostają tylko te, które mockupy naprawdę różnicują - odstęp wewnętrzny, zapas dolny
 * z projektu i kolor akcentu górnej krawędzi.
 *
 * ══ ARKUSZ I KLAWIATURA WCHODZĄ RAZEM (issue #62, szósta tura z urządzenia) ══
 * Zgłoszenie: „otwiera się popup i po krótkiej chwili otwiera się klawiatura". To nie
 * było złe wyczucie czasu w JS - to była kolejność wymuszona przez system.
 *
 * `Modal` na Androidzie jest OSOBNYM OKNEM natywnym (`Dialog` z własnym `Window`),
 * a klawiatura może przyczepić się wyłącznie do okna, które ma fokus wejścia. Dopóki
 * animacja wjazdu okna trwa, `focus()` ustawia fokus WIDOKU bez IME - dokładnie to
 * odkryła druga tura issue #58 („fokus IME dostaje dopiero po dojechaniu animacji
 * wjazdu", `hooks/keyboardFocus.ts`). Animacja `Modal`-a leżała więc na krytycznej
 * ścieżce klawiatury i kosztowała te „krótką chwilę".
 *
 * Odtąd okno pojawia się BEZ animacji (`animationType="none"`), więc `onShow` pada
 * natychmiast i drabinka fokusu łapie klawiaturę w PIERWSZEJ próbie. Wysunięcie panelu
 * animujemy sami - i dzięki temu biegnie RÓWNOLEGLE z wjeżdżającą klawiaturą, zamiast
 * przed nią. Bez modułu natywnego: `Animated` po `transform` i `opacity` z
 * `useNativeDriver`, tak samo jak puls skeletonów.
 *
 * Drabinka fokusu ZOSTAJE. Nie jest już wprawdzie protezą na animację okna, ale nadal
 * broni przed drugą przyczyną z tamtej historii: `onShow` potrafi wyprzedzić commit
 * dzieci modala, a wtedy pierwsza próba nie ma na czym zadziałać.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';
import { sheetBottomPad, sheetMaxHeight } from '../../hooks/keyboardGeometry';
import { registerSheet } from '../../hooks/sheetPresence';

/**
 * Czas wysunięcia panelu. Dobrany pod animację klawiatury Androida (~250 ms): dwie
 * bliskie sobie krzywe czyta się jak JEDEN ruch, a nie jak dwa zdarzenia po sobie.
 */
const ENTER_MS = 220;

/** Zamknięcie jest szybsze od otwarcia - tak działa każdy dobrze zrobiony arkusz. */
const EXIT_MS = 160;

export interface SheetSurfaceProps {
  visible: boolean;
  /** Tapnięcie w tło i „wstecz" Androida. Potwierdzenie wymaga celowego przycisku. */
  onCancel: () => void;
  /**
   * Chwila, w której okno modala JUŻ ISTNIEJE (issue #58 pkt 7 i 8). Arkusz z polem
   * wpisu startuje stąd drabinkę fokusu `useSheetInputFocus` - nie pojedyncze
   * `focus()` i nie `autoFocus`: oba zawiodły, historia w `hooks/keyboardFocus.ts`.
   */
  onShow?: () => void;
  /** Odstęp między elementami arkusza - mockupy dają 12–16 dp. */
  gap?: number;
  paddingHorizontal?: number;
  paddingTop?: number;
  /** Zapas dolny Z MOCKUPU; nad paskiem nawigacji rama ustąpi więcej (`sheetBottomPad`). */
  designPad?: number;
  /**
   * Wysokość klawiatury. Arkusz bez pól tekstowych podaje 0 - nie dlatego, że klawiatura
   * go nie dotyczy, tylko dlatego, że nigdy się przy nim nie pojawi.
   */
  keyboardHeight?: number;
  /** Kolor górnej krawędzi - akcent typu arkusza (błękit zrzutu, amber wpisu ręcznego). */
  accentColor?: string;
  /** Numpad PIN-u centruje treść; reszta arkuszy rozciąga ją na szerokość. */
  align?: 'stretch' | 'center';
  /**
   * Akcja w PRAWYM GÓRNYM ROGU panelu, w rzędzie uchwytu.
   *
   * Powstała dla przycisku zgłoszenia błędu (issue #87: „w każdym popup, w prawym
   * górnym rogu"). Nie w linii tytułu, bo tam mieszka kosz - akcja destrukcyjna
   * arkusza korekty (issue #43) - a dwie ikony obok siebie kazałyby celować.
   * Rama nie wie, co tu wchodzi: przycisk podaje `Sheet` i każdy arkusz budowany
   * wprost na niej. Gdyby rama importowała go sama, arkusz zgłoszenia domknąłby
   * cykl importów (patrz nagłówek `BugReportSheet`).
   */
  topRight?: React.ReactNode;
  /**
   * Treść PRZYPIĘTA pod obszarem przewijania: rząd akcji, pole wpisu wyszukiwarki,
   * strefa destrukcyjna. To ona ma zostać widoczna, gdy treści jest za dużo.
   */
  pinned?: React.ReactNode;
  children?: React.ReactNode;
}

export function SheetSurface({
  visible,
  onCancel,
  onShow,
  gap,
  paddingHorizontal,
  paddingTop,
  designPad,
  keyboardHeight = 0,
  accentColor,
  align = 'stretch',
  topRight,
  pinned,
  children,
}: SheetSurfaceProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  /**
   * 0 = panel schowany pod dolną krawędzią, 1 = na miejscu. Jedna wartość napędza
   * i wysunięcie panelu, i przyciemnienie tła - bo to jest jeden ruch, nie dwa.
   */
  const enter = useRef(new Animated.Value(0)).current;
  /**
   * Okno modala żyje DŁUŻEJ niż `visible`: przy zamykaniu trzyma je animacja wyjazdu,
   * a bez tego panel znikałby skokiem (`Modal` odmontowuje dzieci natychmiast).
   */
  const [mounted, setMounted] = useState(visible);
  /** Wysokość panelu - dystans wysunięcia. Do pomiaru animujemy z całego ekranu. */
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  /*
   * Wysunięcie rusza w PÓŹNIEJSZYM z dwóch zdarzeń: okno pokazane i panel zmierzony.
   * Ta sama koniunkcja, co przy drabince fokusu (`shouldStartLadder`) i z tego samego
   * powodu - kolejność bywa OBIE strony, zależnie od urządzenia i obciążenia JS.
   * Bez pomiaru animowalibyśmy z wysokości całego ekranu, czyli za daleko i za szybko.
   */
  const shown = useRef(false);
  const measured = useRef(false);

  const startEnter = (): void => {
    if (!shown.current || !measured.current) return;
    Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (visible) {
      /* Otwarcie W TRAKCIE wyjazdu musi ubić tamtą animację - inaczej jej callback
         odmontowałby arkusz, który pilot właśnie otworzył. `stopAnimation` sprawia,
         że callback dostaje `finished: false`, a bramka niżej go ignoruje. */
      enter.stopAnimation();
      // Nowe otwarcie zaczyna od zera - bramki i pomiar też, bo okno powstaje od nowa.
      enter.setValue(0);
      shown.current = false;
      measured.current = false;
      /* Wysokość ZERUJEMY, choć znamy poprzednią: gdyby panel urósł między otwarciami,
         start z krótszego dystansu odsłoniłby jego górny pasek na jedną klatkę. Przed
         pomiarem lepszy jest dystans na pewno za duży niż na pewno za mały. */
      setPanelHeight(null);
      setMounted(true);
      return;
    }
    if (!mounted) return;
    Animated.timing(enter, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    // `mounted` świadomie poza zależnościami: to stan WYNIKOWY tego efektu, a jego
    // dopisanie zapętliłoby zamykanie na samym sobie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, enter]);

  /*
   * EKRAN POD SPODEM NIE MA REAGOWAĆ NA KLAWIATURĘ TEGO ARKUSZA (zgłoszenie
   * z urządzenia, 2026-09-04). Zgłaszamy się na czas życia OKNA, nie na czas
   * `visible`: przy zamykaniu okno stoi jeszcze przez animację wyjazdu, a klawiatura
   * schodzi dłużej niż ono - gdyby rejestracja gasła wcześniej, ekran odzyskałby
   * cudzą klawiaturę na te kilkaset milisekund i przycisk pod arkuszem podskoczyłby
   * dokładnie w chwili, w której pilot w niego celuje. Reszta: `sheetPresence.ts`.
   */
  useEffect(() => {
    if (!mounted) return;
    return registerSheet();
  }, [mounted]);

  const maxHeight = sheetMaxHeight(windowHeight, keyboardHeight, insets.top);
  const bottomPad = sheetBottomPad(
    designPad ?? theme.spacing.xxxl,
    insets.bottom,
    keyboardHeight,
    theme.spacing.lg,
  );

  return (
    <Modal
      visible={mounted}
      transparent
      /* BEZ animacji okna - patrz nota „ARKUSZ I KLAWIATURA WCHODZĄ RAZEM" na górze
         pliku. Okno pojawia się natychmiast, `onShow` pada od razu i drabinka fokusu
         łapie klawiaturę w pierwszej próbie; wysunięcie panelu robimy sami niżej. */
      animationType="none"
      onRequestClose={onCancel}
      onShow={() => {
        shown.current = true;
        startEnter();
        onShow?.();
      }}
      statusBarTranslucent
    >
      {/* Tapnięcie w tło = anuluj. Potwierdzenie wymaga celowego tapnięcia w przycisk.

          W TRAKCIE WYJAZDU NAKŁADKA NIE ŁAPIE DOTYKU (zgłoszenie z urządzenia: „jakby
          2× muszę wcisnąć DALEJ"). Odkąd okno żyje dłużej niż `visible`, przez ~160 ms
          po zamknięciu arkusza pełnoekranowa nakładka wciąż stała nad ekranem i zjadała
          pierwsze tapnięcie - pilot trafiał w gasnące tło zamiast w przycisk pod nim.
          Zamykany arkusz ma być już tylko OBRAZEM. */}
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[styles.overlay, { backgroundColor: theme.colors.overlay, opacity: enter }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityLabel="Zamknij"
        />
      </Animated.View>

      {/* Klawiatura podnosi arkusz zamiast go zasłaniać - patrz `useKeyboardHeight`. */}
      <View
        style={[styles.bottom, { paddingBottom: keyboardHeight }]}
        pointerEvents={visible ? 'box-none' : 'none'}
      >
        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h <= 0 || measured.current) return;
            setPanelHeight(h);
            measured.current = true;
            startEnter();
          }}
          style={{
            transform: [
              {
                /* Do pomiaru panel stoi poniżej całego ekranu - czyli i tak niewidoczny,
                   więc nie mruga w złym miejscu. Po pomiarze dystans jest dokładnie
                   jego wysokością i wysunięcie czyta się jak jeden ruch od krawędzi. */
                translateY: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [panelHeight ?? windowHeight, 0],
                }),
              },
            ],
            maxHeight,
            gap: gap ?? theme.spacing.md,
            paddingHorizontal: paddingHorizontal ?? theme.spacing.lg,
            paddingTop: paddingTop ?? theme.spacing.lg,
            paddingBottom: bottomPad,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            borderTopWidth: theme.borderWidthStrong,
            borderTopColor: accentColor ?? theme.colors.borderStrong,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          {/* Uchwyt zostaje WYŚRODKOWANY niezależnie od akcji obok: pozycja
              bezwzględna nie zabiera mu miejsca, więc panel bez `topRight`
              wygląda dokładnie tak, jak wyglądał. */}
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
            {topRight != null && <View style={styles.topRight}>{topRight}</View>}
          </View>

          {/* `flexShrink` bez `flexGrow` - krótka treść nie rozciąga arkusza na siłę. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{
              gap: gap ?? theme.spacing.md,
              alignItems: align === 'center' ? 'center' : undefined,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {pinned}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  /**
   * Rząd MIEŚCI przycisk (36 dp), a ujemne marginesy oddają z powrotem to, czego
   * uchwyt nie potrzebuje - w pionie zajmuje więc dalej 4 dp i żaden arkusz nie
   * zmienił przez to odstępów.
   *
   * Wysokość jest tu CELEM DOTYKOWYM, nie ozdobą: Android nie dostarcza dotknięć
   * poza granice rodzica, więc przycisk wystający z rzędu o wysokości 4 dp miałby
   * 4 dp aktywnej wysokości - i wyglądałby na zepsuty, choć byłby narysowany dobrze.
   * Z tego samego powodu `right: 0`, a nie wartość ujemna wchodząca w padding panelu.
   */
  handleRow: { height: 36, marginTop: -16, marginBottom: -16, justifyContent: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  topRight: { position: 'absolute', right: 0, top: 2 },
});
