/**
 * UZ Aero — NoGpsBanner (`.no-gps` z mockupu 05g-cockpit-no-gps)
 *
 * Baner typu STATUS (przyrząd): nie zamyka się ręcznie, znika sam z pierwszym
 * świeżym fixem.
 *
 * ZAWSZE AMBER (decyzja 2026-08-12) — jeden stan, jeden kolor. Do 2026-08-12 baner
 * miał dwa tony: amber przy rozruchu odbiornika i CZERWIEŃ przy utracie fixa oraz
 * braku uprawnienia. Czerwień była wzięta z rejestru ryzyk (§8: niezauważony brak fixa
 * = niezapisane lądowanie), a on stopniuje SKUTKI, nie banery. Dla pilota wszystkie
 * trzy stany znaczą to samo — autodetekcja nie pracuje, zapisujesz sam z paska akcji —
 * więc stopniowanie kolorem sugerowało różnicę, której nie ma w jego robocie. Zostaje
 * ostrzeżenie: nic się nie zepsuło nieodwracalnie, ale trzeba wziąć sprawy w swoje ręce.
 * (Rozszerzenie decyzji z 2026-08-04, która tym samym argumentem — czerwień w pierwszej
 * sekundzie każdego cyklu uczy ignorować czerwień — zdjęła ją z rozruchu.)
 *
 * PRZYRZĄD, NIE PASEK AKCJI (decyzja 2026-08-12). Do 2026-08-12 baner niósł dwa
 * przyciski — „Zapisz zdarzenie" (arkusz 05f) i „Lista ręczna" (ekran 08) — pomyślane
 * jako dwie skale problemu. Na urządzeniu okazały się drugim miejscem, w którym pilot
 * ZAPISUJE zdarzenia: „Zapisz zdarzenie" otwierało dokładnie ten sam arkusz, co przycisk
 * główny paska akcji (Take off / Landing), tylko wyżej i mniejszą czcionką. Zapis mieszka
 * w pasku akcji i nigdzie indziej — baner mówi, CO SIĘ STAŁO z czujnikiem, a co z tym
 * zrobić, mówi jego treść. Odtwarzanie przegapionych lotów z ręki (08) należy do stanu
 * PO biegu: kafelek „Lista ręczna" stoi na 04 dopiero po STOP ENGINE i tam jest jedynym
 * wejściem (`groundActions` w `CockpitScreen`).
 *
 * Trzy stany różni więc TREŚĆ, nie kolor: „szukam nieba" (rozruch), „ostatni fix
 * o 15:58" (utrata) i „nadaj uprawnienie w ustawieniach" (jedyny, którego fix sam
 * nie naprawi) — to `gpsAcquiringText` / `gpsLossText` / `gpsPermissionText`.
 *
 * Degradacja CZUJNIKA to osobna oś od sieci — baner może wisieć obok zielonego
 * SyncChipa i to nie jest sprzeczność.
 */

import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';

export interface NoGpsBannerProps {
  /** Nagłówek mono — domyślnie utrata sygnału (05g). */
  title?: string;
  /** Treść pod nagłówkiem — czas i wiek ostatniego fixa (`gpsLossText`). */
  text: string;
}

export function NoGpsBanner({
  title = 'GPS: brak sygnału · autodetekcja wstrzymana',
  text,
}: NoGpsBannerProps) {
  const { theme } = useTheme();
  // Bez wyboru tonu — patrz nagłówek: jeden stan, jeden kolor.
  const accent = theme.colors.amber;
  const border = theme.colors.amberBorder;
  const muted = theme.colors.amberMuted;

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: theme.borderWidth,
        borderColor: border,
        backgroundColor: muted,
        paddingVertical: 11,
        paddingHorizontal: 13,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
        <AppText
          variant="mono"
          style={{ flex: 1, fontSize: 11, fontFamily: theme.fontFamily.monoBold, color: accent, letterSpacing: 0.5 }}
        >
          {title}
        </AppText>
      </View>
      <AppText variant="body" tone="secondary" style={{ fontSize: 11, lineHeight: 16.5 }}>
        {text}
      </AppText>
    </View>
  );
}
