/**
 * UZ Aero - panel: ekran, którego jeszcze nie ma.
 *
 * Sidebar jest KANONICZNY od pierwszego przekroju (11 pozycji, `SZABLON.html`) -
 * i to jest decyzja, nie niedopatrzenie: rama ma być identyczna wszędzie, zanim
 * powstaną ekrany. Pozycja, która prowadzi w pustkę, byłaby jednak gorsza od
 * pozycji, która mówi wprost, że jej ekran dopiero powstanie.
 *
 * Czego tu NIE ROBIMY: uproszczonej wersji docelowego ekranu. Mockupy w `design/admin/`
 * są zatwierdzoną specyfikacją wdrażaną 1:1 - „prawie A02" byłoby trudniejsze do
 * usunięcia niż jego brak i myliłoby przy odbiorze.
 */

import { EmptyState } from '../../ui/components';
import { WrenchIcon } from '../../ui/components/icons';

interface UnderConstructionScreenProps {
  /** Nazwa ekranu z nawigacji - ta sama, którą człowiek właśnie kliknął. */
  title: string;
  /** Plik mockupu, z którego ekran powstanie; `null` dla adresu spoza nawigacji. */
  mockup: string | null;
}

export function UnderConstructionScreen({ title, mockup }: UnderConstructionScreenProps) {
  return (
    <EmptyState
      icon={<WrenchIcon size={22} />}
      title={title.toUpperCase()}
      note={
        mockup == null ? (
          <>Tego adresu nie ma w panelu. Wybierz sekcję z nawigacji po lewej.</>
        ) : (
          <>
            Ekran powstanie z mockupu <code className="code-ref">{mockup}</code>. Ten przekrój wdraża ramę panelu,
            sesję w przeglądarce i logowanie - reszta wchodzi kolejnymi przekrojami.
          </>
        )
      }
    />
  );
}
