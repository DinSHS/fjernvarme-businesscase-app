//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { type ReactNode } from "react";

import { useAuth } from "@/hooks/auth.context";
import { UDGAVETEKSTER } from "@/backend/auth";

interface AuthGateProps {
    children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
    const { isLoading, isAuthenticated } = useAuth();

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="text-sm text-muted-foreground">
                    {UDGAVETEKSTER.forbinder}
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-4">
                <div className="w-full max-w-md text-center">
                    <h2 className="mb-2 text-lg font-semibold text-foreground">
                        {UDGAVETEKSTER.ikkeLoggetIndTitel}
                    </h2>
                    <p className="mb-4 text-sm text-muted-foreground">
                        {UDGAVETEKSTER.ikkeLoggetIndTekst}
                    </p>
                </div>
            </div>
        );
    };
    
    return <>{children}</>;
}