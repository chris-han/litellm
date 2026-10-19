"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { Activity } from "lucide-react";
import { SemantierBudgetForm, SemantierPrices, SemantierScenario } from "./SemantierFinancialControls";
import { useSemantierSession } from "./SemantierSession";
import { semantierApi } from "@/lib/http/semantier";
import { Page, PageContent } from "@/components/shared/Page";
import { PageHeader, PageHeaderTitle, PageHeaderDescription } from "@/components/shared/PageHeader";
import { DataTable, DataTableToolbar } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Invocation {
  invocation_id: string;
  attempt_id: string;
  deployment_id: string;
  account_id: string;
  currency: string;
  funding: string;
  created_at: string;
  max_cost: string;
  customer_debit: string | null;
  settlement_state: string;
  usage_state: string;
  pricing_state: string;
  evidence_url?: string;
  attribution: Record<string, string | null>;
}
interface BillingState {
  funding_source: string;
  billing_account_id: string;
  balances: Array<{ amount: string; currency: string }>;
  account: {
    held: { amount: string; currency: string };
    available: { amount: string; currency: string } | null;
    budget: { limit: string; spent: string; currency: string };
    unresolved_attempts: number;
    blocked: boolean;
  };
  usage: { status: string; known_cost: { amount: string; currency: string } };
}
interface Evidence {
  bundle: {
    invocation: Invocation;
    usage_observations: unknown[];
    raw_observations: Array<{ provider: string; raw_usage: Record<string, unknown>; completion_state: string }>;
    prices: unknown[];
    fx_quotes: unknown[];
    postings: unknown[];
    sha256: string;
  };
  hold_reference: { active: boolean; amount: { amount: string; currency: string }; settlement_state: string };
}
const URL_STATE = {
  invocation: parseAsString,
  usage_search: parseAsString.withDefault(""),
  billing_tab: parseAsStringLiteral(["usage", "account", "pricing", "reconciliation"] as const).withDefault("usage"),
};

function JsonEvidence({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="border-b py-4">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-4 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function SemantierUsage() {
  const session = useSemantierSession();
  const [state, setState] = useQueryStates(URL_STATE);
  const query = useQuery({
    queryKey: ["semantier", session.organization_id, "usage"],
    queryFn: ({ signal }) => semantierApi.get<{ data: Invocation[] }>("/api/admin/model-gateway/usage", { signal }),
  });
  const account = useQuery({
    queryKey: ["semantier", session.organization_id, "account"],
    queryFn: ({ signal }) => semantierApi.get<BillingState>("/api/billing/state", { signal }),
    enabled: session.permissions.includes("billing:read"),
  });
  const selected = query.data?.data.find((row) => row.invocation_id === state.invocation);
  const evidenceUrl = selected?.evidence_url;
  const evidence = useQuery({
    queryKey: ["semantier", session.organization_id, "evidence", state.invocation],
    queryFn: ({ signal }) => semantierApi.get<Evidence>(evidenceUrl!, { signal }),
    enabled: Boolean(
      evidenceUrl &&
        evidenceUrl === `/api/model-gateway/invocations/${encodeURIComponent(state.invocation ?? "")}/evidence`,
    ),
  });
  const finalNative = evidence.data?.bundle.raw_observations.findLast(
    (receipt) => receipt.completion_state === "FINAL",
  );
  const columns = useMemo<ColumnDef<Invocation>[]>(
    () => [
      {
        id: "invocation",
        header: "Invocation",
        accessorKey: "invocation_id",
        cell: ({ row }) => (
          <Button
            variant="link"
            className="max-w-64 truncate p-0"
            onClick={() => void setState({ invocation: row.original.invocation_id }, { history: "push" })}
          >
            {row.original.invocation_id}
          </Button>
        ),
      },
      { header: "Funding", accessorKey: "funding" },
      { header: "Model deployment", accessorKey: "deployment_id" },
      {
        header: "Customer debit",
        accessorKey: "customer_debit",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.customer_debit === null
              ? "Unresolved"
              : `${row.original.customer_debit} ${row.original.currency}`}
          </span>
        ),
      },
      { header: "Settlement", accessorKey: "settlement_state" },
      { header: "Usage", accessorKey: "usage_state" },
      { header: "Price", accessorKey: "pricing_state" },
      {
        header: "Time",
        accessorKey: "created_at",
        cell: ({ row }) => new Date(row.original.created_at).toLocaleString(),
      },
    ],
    [setState],
  );
  const rows = (query.data?.data ?? []).filter(
    (row) =>
      JSON.stringify(row).toLowerCase().includes(state.usage_search.toLowerCase()) &&
      (state.billing_tab !== "reconciliation" || row.settlement_state === "PENDING_RECONCILIATION"),
  );
  return (
    <Page>
      <PageContent>
        <PageHeader>
          <PageHeaderTitle>
            <Activity />
            Usage and billing
          </PageHeaderTitle>
          <PageHeaderDescription>
            Semantier owns customer credits and budgets. Native provider amounts remain estimates until reconciled. CNY
            and USD remain separate.
          </PageHeaderDescription>
        </PageHeader>
        <Tabs
          value={state.billing_tab}
          onValueChange={(value) => {
            if (["usage", "account", "pricing", "reconciliation"].includes(value))
              void setState({ billing_tab: value as typeof state.billing_tab });
          }}
        >
          <TabsList variant="line">
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="account">Credits and budgets</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            <h2 className="mb-3 font-semibold">Account, currency and current exposure</h2>
            {account.isPending && account.fetchStatus === "fetching" && <p role="status">Loading billing account…</p>}
            {account.isError && (
              <p role="alert">
                Billing account unavailable. Check billing access and the active account binding, then refresh.
              </p>
            )}
            {account.data && (
              <>
                <dl className="grid max-w-3xl grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-6 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Billing account</dt>
                  <dd className="break-all">{account.data.billing_account_id}</dd>
                  <dt className="text-muted-foreground">Funding</dt>
                  <dd>{account.data.funding_source}</dd>
                  <dt className="text-muted-foreground">Credit balance</dt>
                  <dd className="tabular-nums">
                    {account.data.balances.length
                      ? account.data.balances.map((money) => `${money.amount} ${money.currency}`).join(" · ")
                      : "No platform wallet for customer cloud funding"}
                  </dd>
                  <dt className="text-muted-foreground">Available credits</dt>
                  <dd className="tabular-nums">
                    {account.data.account.available
                      ? `${account.data.account.available.amount} ${account.data.account.available.currency}`
                      : "Not applicable"}
                  </dd>
                  <dt className="text-muted-foreground">Active holds</dt>
                  <dd className="tabular-nums">
                    {account.data.account.held.amount} {account.data.account.held.currency}
                  </dd>
                  <dt className="text-muted-foreground">Budget consumed / limit</dt>
                  <dd className="tabular-nums">
                    {account.data.account.budget.spent} / {account.data.account.budget.limit}{" "}
                    {account.data.account.budget.currency}
                  </dd>
                  <dt className="text-muted-foreground">Pending attempts</dt>
                  <dd>
                    {account.data.account.unresolved_attempts} · {account.data.usage.status}
                  </dd>
                </dl>
                {account.data.account.blocked && (
                  <p role="alert" className="mt-4 text-sm text-destructive">
                    New dispatch is paused while a cost variance is reconciled.
                  </p>
                )}
                <SemantierBudgetForm
                  currency={account.data.account.budget.currency}
                  initialLimit={account.data.account.budget.limit}
                />
                <JsonEvidence title="Account evidence" value={account.data} />
              </>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              Payment, subscription and automatic top-up are unavailable. Budget and tariff actions follow explicit
              organization permissions.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void account.refetch()}
              disabled={!session.permissions.includes("billing:read")}
            >
              Refresh account
            </Button>
          </TabsContent>
          <TabsContent value="pricing">
            <h2 className="mb-3 font-semibold">Immutable prices and fixed FX</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Select an invocation in Usage to inspect its exact price versions and retained FX quote. Missing prices
              remain unpriced. Scenario comparisons do not establish an invoice or task quality.
            </p>
            {evidence.data ? (
              <>
                <JsonEvidence title="Bound customer and supplier price versions" value={evidence.data.bundle.prices} />
                <JsonEvidence title="Fixed FX quotes" value={evidence.data.bundle.fx_quotes} />
              </>
            ) : (
              <Button variant="outline" onClick={() => void setState({ billing_tab: "usage" })}>
                Select usage evidence
              </Button>
            )}
            <SemantierPrices />
            {finalNative && state.invocation && (
              <SemantierScenario invocationId={state.invocation} native={finalNative} />
            )}
          </TabsContent>
          {["usage", "reconciliation"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {state.invocation ? (
                <section>
                  <Button variant="outline" onClick={() => void setState({ invocation: null }, { history: "push" })}>
                    Back to usage
                  </Button>
                  <h2 className="my-4 break-all text-base font-semibold">Invocation {state.invocation}</h2>
                  {evidence.isPending && evidence.fetchStatus === "fetching" && (
                    <p role="status">Loading exact metering evidence…</p>
                  )}
                  {(evidence.isError || evidence.fetchStatus === "idle") && !evidence.data && (
                    <p role="alert">Evidence unavailable in this organization. Return to usage and refresh.</p>
                  )}
                  {evidence.data && (
                    <>
                      <p className="break-all text-sm">Attempt {evidence.data.bundle.invocation.attempt_id}</p>
                      <p className="mt-2 text-sm">
                        Hold {evidence.data.hold_reference.active ? "active" : "closed"} ·{" "}
                        {evidence.data.hold_reference.amount.amount} {evidence.data.hold_reference.amount.currency} ·{" "}
                        {evidence.data.hold_reference.settlement_state}
                      </p>
                      <JsonEvidence title="Attribution, deployment and state" value={evidence.data.bundle.invocation} />
                      <JsonEvidence
                        title="Provider-native observations"
                        value={evidence.data.bundle.raw_observations}
                      />
                      <JsonEvidence
                        title="Normalized counters and rated lines"
                        value={evidence.data.bundle.usage_observations}
                      />
                      <JsonEvidence title="Exact customer and supplier prices" value={evidence.data.bundle.prices} />
                      <JsonEvidence title="FX quotes" value={evidence.data.bundle.fx_quotes} />
                      <JsonEvidence title="Balanced ledger postings" value={evidence.data.bundle.postings} />
                      <p className="mt-4 break-all text-xs text-muted-foreground">
                        Evidence SHA-256 {evidence.data.bundle.sha256}
                      </p>
                    </>
                  )}
                </section>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {tab === "reconciliation"
                      ? "Possibly executed calls keep their holds. Recovery uses retained evidence and never resends model requests."
                      : "Select an invocation to follow its exact attempt, native counters, price, hold and posting references."}
                  </p>
                  <DataTable
                    data={rows}
                    columns={columns}
                    getRowId={(row) => row.invocation_id}
                    isLoading={query.isPending}
                    isError={query.isError}
                    noDataMessage={
                      tab === "reconciliation"
                        ? "No pending reconciliation in the loaded organization usage"
                        : "No usage in this organization"
                    }
                    toolbar={(table) => (
                      <DataTableToolbar
                        table={table}
                        searchValue={state.usage_search}
                        onSearchChange={(value) => void setState({ usage_search: value })}
                        onRefresh={() => void query.refetch()}
                        isRefreshing={query.isFetching}
                        searchPlaceholder="Search invocation, model or funding"
                      />
                    )}
                  />
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </PageContent>
    </Page>
  );
}
