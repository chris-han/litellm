"use client";

import { isSemantierGateway } from "@/lib/http/semantier";
import { SemantierUsage } from "@/components/semantier/SemantierUsage";

import NewUsagePage from "./_components/components/UsagePageView";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { useTeams } from "@/app/(dashboard)/hooks/teams/useTeams";
import { useOrganizations } from "@/app/(dashboard)/hooks/organizations/useOrganizations";

function NativeUsagePage() {
  useAuthorized();
  const { data: teams } = useTeams();
  const { data: organizations } = useOrganizations();
  return <NewUsagePage teams={teams ?? []} organizations={organizations ?? []} />;
}

export default function UsagePage() {
  return isSemantierGateway ? <SemantierUsage /> : <NativeUsagePage />;
}
