"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { KeyRound, Server, Activity, SunMoon } from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/shared/Sidebar";
import { Button } from "@/components/ui/button";
import { uiHref, routeSegmentForPathname } from "@/utils/uiHref";
import { useSemantierSession } from "./SemantierSession";

const destinations = [
  { segment: "models-and-endpoints", label: "Models", icon: Server },
  { segment: "api-keys", label: "Keys", icon: KeyRound },
  { segment: "usage", label: "Usage", icon: Activity },
];

export function SemantierShell({ children }: { children: ReactNode }) {
  const session = useSemantierSession();
  const { resolvedTheme, setTheme } = useTheme();
  const segment = routeSegmentForPathname(usePathname());
  const allowed = destinations.some((item) => item.segment === segment);
  return (
    <div className="flex h-dvh min-w-0 overflow-hidden bg-background text-foreground max-md:flex-col">
      <div className="hidden h-full md:flex">
        <Sidebar collapsed={false}>
          <SidebarHeader>
            <Link href={uiHref("models-and-endpoints")} className="text-lg font-semibold">
              Semantier
            </Link>
            <span className="text-xs text-muted-foreground">Model Gateway</span>
          </SidebarHeader>
          <SidebarGroup>
            <SidebarMenu>
              {destinations.map((item) => (
                <SidebarMenuItem key={item.segment}>
                  <SidebarMenuButton render={<Link href={uiHref(item.segment)} />} isActive={segment === item.segment}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarFooter>
            <p className="break-words text-xs text-muted-foreground">
              {session.organization.display_name || session.organization_id}
            </p>
          </SidebarFooter>
        </Sidebar>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-6 py-3">
          <p className="min-w-0 break-words text-sm">
            <span className="font-medium">{session.organization.display_name || session.organization_id}</span>
            <span className="text-muted-foreground"> · Semantier Model Gateway</span>
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle color theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <SunMoon />
          </Button>
          <nav aria-label="Gateway navigation" className="flex w-full gap-4 md:hidden">
            {destinations.map((item) => (
              <Link
                key={item.segment}
                href={uiHref(item.segment)}
                aria-current={segment === item.segment ? "page" : undefined}
                className="py-2 text-sm font-medium"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          {allowed ? (
            children
          ) : (
            <div className="p-8">
              <h1 className="mb-3 text-xl font-semibold">Model Gateway</h1>
              <p className="mb-4 text-muted-foreground">
                Manage organization models, operational keys and metered usage.
              </p>
              <Button render={<Link href={uiHref("models-and-endpoints")} />}>Open Models</Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
