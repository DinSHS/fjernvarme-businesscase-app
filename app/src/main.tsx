//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from "react-error-boundary";

import App from './App.tsx';
import { ErrorFallback } from './ErrorFallback';
import { AuthProvider } from './hooks/use-auth';
import { bootstrapAuth } from '@/backend/auth';
import { installérIndlaesningsvagt } from '@/lib/genindlaes';
import { AuthGate } from './components/auth-gate.component';

import "./global.css";
import "./styles/layout.css";

// Før alt andet: en lazy-chunk/CSS, der ikke kan hentes, giver "Genindlæs appen" i stedet for en død side.
installérIndlaesningsvagt();

const authService = bootstrapAuth();

// Tema og lys/mørk ejes af src/styles/tema.ts (temavælgeren i App.tsx); her er ingen tema-kontekst.
function Root() {
    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            <AuthProvider authService={authService}>
                <AuthGate>
                    <App />
                </AuthGate>
            </AuthProvider>
        </ErrorBoundary>
    );
}

createRoot(document.getElementById('root')!).render(<Root />)
