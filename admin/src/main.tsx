/**
 * UZ Aero - panel 2.0: COMPOSITION ROOT.
 *
 * Jedyne miejsce, które zna wszystkie konkrety naraz: klienta zapytań, router,
 * kontekst sesji i arkusze stylów. Reszta kodu dostaje wszystko propsami albo hookiem -
 * dokładnie jak `server/src/index.ts` i `app/src/bootstrap/`.
 *
 * Kolejność arkuszy jest ZNACZĄCA i dlatego stoi tu, a nie w `index.html`:
 * `fonts.css` (@font-face, self-host) → `tokens.css` (generowany z `@uzaero/tokens`)
 * → `base.css` (reset i korzeń) → `layout.css` (rama) → komponenty. Zmienne i kroje
 * muszą istnieć, zanim ktokolwiek po nie sięgnie.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components/shell.css';
import './styles/components/controls.css';
import './styles/components/surfaces.css';
import './styles/components/page.css';
import './styles/components/filters.css';
import './styles/components/table.css';
import './styles/components/drawer.css';
import './styles/components/skeleton.css';
import './styles/components/login.css';
import './styles/components/logbook.css';

import { SessionProvider } from './auth/SessionProvider';
import { createQueryClient } from './queries/client';
import { router } from './routes';

const container = document.getElementById('root');
if (container == null) throw new Error('Brak elementu #root - sprawdź admin/index.html');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      {/* Sesja stoi NAD routerem, bo o tym, czy pokazać ramę czy logowanie,
          rozstrzygają trasy - a nie mogą tego zrobić, nie znając odpowiedzi. */}
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
