"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routeSegmentForPathname, uiHref } from "@/utils/uiHref";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { semantierApi, setSemantierOrganization } from "@/lib/http/semantier";
import LoadingScreen from "@/components/common_components/LoadingScreen";
import { Button } from "@/components/ui/button";

export interface SemantierSession {
  user_id: string;
  organization_id: string;
  organization: { id: string; display_name: string | null };
  permissions: string[];
  allowed_key_models?: string[];
  provider_credential_prefix?: string;
}

const SessionContext = createContext<SemantierSession | null>(null);

export function useOptionalSemantierSession() {
  return useContext(SessionContext);
}

export function useSemantierSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Semantier organization context unavailable");
  return session;
}

export function SemantierSessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const segment = routeSegmentForPathname(usePathname());
  const [activeScope, setActiveScope] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["semantier-context"],
    queryFn: ({ signal }) => semantierApi.get<SemantierSession>("/api/admin/model-gateway/context", { signal }),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });
  const session = query.isError ? null : query.data;
  const organizationId = session?.organization_id ?? null;
  const scope = session
    ? JSON.stringify([session.user_id, session.organization_id, [...session.permissions].sort()])
    : null;
  useEffect(() => {
    if (scope !== activeScope) {
      let current = true;
      void client.cancelQueries({ predicate: (q) => q.queryKey[0] !== "semantier-context" }).then(() => {
        if (!current) return;
        client.removeQueries({ predicate: (q) => q.queryKey[0] !== "semantier-context" });
        setSemantierOrganization(organizationId);
        setActiveScope(scope);
      });
      return () => {
        current = false;
      };
    }
  }, [client, scope, activeScope, organizationId]);
  useEffect(() => {
    const invalidate = () => {
      void client.invalidateQueries({ queryKey: ["semantier-context"] });
    };
    window.addEventListener("semantier-context-invalidated", invalidate);
    return () => window.removeEventListener("semantier-context-invalidated", invalidate);
  }, [client]);
  if (query.isPending || (session && activeScope !== scope)) return <LoadingScreen />;
  if (!session)
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-4 p-8" role="alert">
        <h1 className="text-xl font-semibold">Semantier administration unavailable</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to Semantier with the required organization permissions, then retry.
        </p>
        <Button className="self-start" onClick={() => void query.refetch()}>
          Retry organization access
        </Button>
      </main>
    );
  if (!["", "models-and-endpoints", "api-keys", "usage"].includes(segment))
    return (
      <main className="p-8">
        <h1 className="mb-4 text-xl font-semibold">Semantier Model Gateway</h1>
        <Link className="text-primary underline" href={uiHref("models-and-endpoints")}>
          Open organization models
        </Link>
      </main>
    );
  return (
    <SessionContext.Provider value={session}>
      <div key={scope} className="contents">
        {children}
      </div>
    </SessionContext.Provider>
  );
}
