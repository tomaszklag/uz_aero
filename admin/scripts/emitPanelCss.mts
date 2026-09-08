/**
 * UZ Aero - panel: zapisuje `design/panel/panel.css` (arkusz makiet) ze źródeł.
 *
 * Uruchomienie: `npm run panel:css` w `admin/`. Treść składa `panelCss.ts` - ten sam
 * podział, co `emitCss.ts` / `tokensCss.ts` w pakiecie tokenów: skrypt tylko pisze,
 * a to, CO pisze, jest funkcją, którą porównuje test.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composePanelCss } from './panelCss';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', '..', 'design', 'panel', 'panel.css');

writeFileSync(target, composePanelCss(), 'utf8');
console.log(`zapisano ${relative(process.cwd(), target)}`);
