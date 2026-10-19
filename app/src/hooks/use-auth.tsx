//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@/lib/data/kilde";
import type { AuthService } from "@/backend/kontrakt";
import { AuthContext, type AuthContextValue } from "./auth.context";

interface AuthProviderProps {
    children: ReactNode;
    authService: AuthService;
}

/**
 * AuthProvider — runs the backend's login once on mount (`@/backend/auth`):
 * rayfin = the Fabric embedded handoff below; rest = GET /api/session on the community server.
 *
 * Behavior (rayfin):
 * - When loaded inside a Fabric iframe (`?fabricEmbedded=true`), calls
 *   `initEmbeddedAuth` to acquire a Rayfin session via postMessage.
 * - When loaded standalone, `initEmbeddedAuth` returns `null` immediately
 *   and the provider settles in an unauthenticated state and `<AuthGate>` 
 *   renders the "not embedded" notice.
 *
 * Consume the session with the `useAuth` hook.
 */
export function AuthProvider({ children, authService }: AuthProviderProps) {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const result = await authService.initEmbeddedAuth();
                if (cancelled)
                    return;
                setSession(result);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error(String(err)));
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [authService]);

    if (error)
        throw error;

    const value = useMemo<AuthContextValue>(
        () => ({
            session,
            isAuthenticated: session?.isAuthenticated ?? false,
            isLoading,
            error,
        }),
        [session, isLoading, error],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}