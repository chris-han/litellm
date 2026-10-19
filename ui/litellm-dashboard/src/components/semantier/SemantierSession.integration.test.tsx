import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { useEffect } from "react";
import { semantierApi } from "@/lib/http/semantier";
import { renderWithProviders, testQueryClient } from "../../../tests/test-utils";
import { SemantierSessionProvider, useSemantierSession } from "./SemantierSession";
import ModelInfoView from "@/components/model_info_view";
import { SemantierBudgetForm, SemantierPrices } from "./SemantierFinancialControls";
import { SemantierKeys } from "./SemantierKeys";
import { SemantierUsage } from "./SemantierUsage";

const originalSemantierMode = vi.hoisted(() => {
  const prior = process.env.NEXT_PUBLIC_SEMANTIER_GATEWAY;
  process.env.NEXT_PUBLIC_SEMANTIER_GATEWAY = "1";
  return prior;
});
afterAll(() => {
  if (originalSemantierMode === undefined) delete process.env.NEXT_PUBLIC_SEMANTIER_GATEWAY;
  else process.env.NEXT_PUBLIC_SEMANTIER_GATEWAY = originalSemantierMode;
});

vi.unmock("@/app/(dashboard)/hooks/useAuthorized");

vi.mock("next/navigation", () => ({ usePathname: () => "/models-and-endpoints" }));

function Scope() {
  const session = useSemantierSession();
  return (
    <>
      <p>{session.organization_id}</p>
      <input aria-label="Draft credential" />
    </>
  );
}
const session = (organization_id: string) => ({
  user_id: "operator",
  organization_id,
  organization: { id: organization_id, display_name: organization_id },
  permissions: ["provider_credentials:manage", "usage:read_org"],
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

afterEach(() => {
  cleanup();
  testQueryClient.clear();
  vi.unstubAllGlobals();
});

describe("Semantier organization and evidence wiring", () => {
  it("keeps the old organization assertion until old scoped callbacks have unmounted", async () => {
    let organization = "org-a";
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) =>
      json(url.endsWith("/context") ? session(organization) : {}),
    );
    vi.stubGlobal("fetch", fetchImpl);
    function RetiringScope() {
      const current = useSemantierSession();
      useEffect(() => () => {
        void semantierApi.post("/api/billing/budget", { retiredOrganization: current.organization_id });
      }, [current.organization_id]);
      return <p>{current.organization_id}</p>;
    }
    renderWithProviders(<SemantierSessionProvider><RetiringScope /></SemantierSessionProvider>);
    await screen.findByText("org-a");
    organization = "org-b";
    await act(async () => {
      await testQueryClient.refetchQueries({ queryKey: ["semantier-context"] });
    });
    await screen.findByText("org-b");
    const retired = fetchImpl.mock.calls.find(([url]) => url.endsWith("/budget"));
    expect((retired?.[1] as RequestInit)?.headers).toMatchObject({ "X-Semantier-Organization-Id": "org-a" });
  });

  it("remounts organization-bound drafts and clears data on a context switch", async () => {
    let organization = "org-a";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(session(organization))),
    );
    renderWithProviders(
      <SemantierSessionProvider>
        <Scope />
      </SemantierSessionProvider>,
    );
    expect(await screen.findByText("org-a")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Draft credential"), { target: { value: "private-draft" } });
    testQueryClient.setQueryData(["semantier", "org-a", "usage"], { private: "old" });
    organization = "org-b";
    await act(async () => {
      await testQueryClient.refetchQueries({ queryKey: ["semantier-context"] });
    });
    expect(await screen.findByText("org-b")).toBeInTheDocument();
    expect(screen.getByLabelText("Draft credential")).toHaveValue("");
    expect(testQueryClient.getQueryData(["semantier", "org-a", "usage"])).toBeUndefined();
  });

  it("clears retained account content when current organization access is revoked", async () => {
    let denied = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (denied ? json({ detail: "membership_revoked" }, 403) : json(session("org-a")))),
    );
    renderWithProviders(
      <SemantierSessionProvider>
        <Scope />
      </SemantierSessionProvider>,
    );
    expect(await screen.findByText("org-a")).toBeInTheDocument();
    denied = true;
    await act(async () => {
      await testQueryClient.refetchQueries({ queryKey: ["semantier-context"] });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in to Semantier");
    expect(screen.queryByLabelText("Draft credential")).not.toBeInTheDocument();
  });

  it("loads the native model detail with a cookie context and no Proxy token", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/context")) return json(session("org-a"));
      if (url.endsWith("/models"))
        return json({
          data: [
            {
              model_name: "organization-chat",
              litellm_params: { model: "azure/native" },
              model_info: { id: "native-exact", db_model: true },
            },
          ],
        });
      return json({});
    });
    vi.stubGlobal("fetch", fetchImpl);
    renderWithProviders(
      <SemantierSessionProvider>
        <ModelInfoView
          modelId="native-exact"
          onClose={() => {}}
          accessToken={null}
          userID="operator"
          userRole="Admin"
          isViewOnly
          modelAccessGroups={[]}
        />
      </SemantierSessionProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Public Model Name: organization-chat" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Test Connection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-use Credentials" })).not.toBeInTheDocument();
    expect(fetchImpl.mock.calls.every(([url]) => url.startsWith("/api/admin/model-gateway/"))).toBe(true);
  });

  it("posts exact decimal budget strings and immutable unbound tariff values", async () => {
    const fetchImpl = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/context"))
        return json({
          ...session("org-a"),
          permissions: ["provider_credentials:manage", "billing:read", "billing:manage", "budgets:manage"],
        });
      if (options?.method === "POST") return json({ version_id: "new-price", activation: "NOT_ACTIVATED" });
      return json({ data: [] });
    });
    vi.stubGlobal("fetch", fetchImpl);
    renderWithProviders(
      <SemantierSessionProvider>
        <SemantierBudgetForm currency="CNY" initialLimit="10" />
        <SemantierPrices />
      </SemantierSessionProvider>,
    );
    fireEvent.change(await screen.findByLabelText("Limit (CNY)"), { target: { value: "12.345678901234" } });
    fireEvent.click(screen.getByRole("button", { name: "Save budget limit" }));
    expect(await screen.findByText("Budget limit updated.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ordinary input per million tokens"), {
      target: { value: "0.123456789123" },
    });
    fireEvent.change(screen.getByLabelText("Output per million tokens"), { target: { value: "0.2" } });
    fireEvent.click(screen.getByRole("button", { name: "Create price version" }));
    expect(
      await screen.findByText("Created immutable price new-price. It is not active until bound by deployment policy."),
    ).toBeInTheDocument();
    const budget = fetchImpl.mock.calls.find(([url, init]) => url.endsWith("/budget") && init?.method === "POST")!;
    expect(JSON.parse(String(budget[1]?.body))).toEqual({ limit: { amount: "12.345678901234", currency: "CNY" } });
    expect((budget[1]?.headers as Record<string, string>)["X-Semantier-Organization-Id"]).toBe("org-a");
    const price = fetchImpl.mock.calls.find(([url, init]) => url.endsWith("/prices") && init?.method === "POST")!;
    expect(JSON.parse(String(price[1]?.body))).toEqual({
      currency: "USD",
      rates: { uncached_input: "0.123456789123", output_total: "0.2" },
      unit: 1000000,
      min_input: 0,
    });
  });

  it("issues only currently granted Hermes scopes and keeps the credential ephemeral", async () => {
    const fetchImpl = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/context"))
        return json({ ...session("org-a"), permissions: ["provider_credentials:manage", "model:invoke"] });
      if (url.endsWith("/credentials") && options?.method === "POST")
        return json({ secret: "smg_disposable", token_id: "fixture-id", expires_at: "2026-10-19T01:00:00Z" });
      return json({ keys: [] });
    });
    vi.stubGlobal("fetch", fetchImpl);
    renderWithProviders(
      <SemantierSessionProvider>
        <SemantierKeys />
      </SemantierSessionProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Create one-hour Hermes credential" }));
    expect(await screen.findByLabelText("Copy this credential before closing")).toHaveValue("smg_disposable");
    const issuance = fetchImpl.mock.calls.find(
      ([url, init]) => url.endsWith("/credentials") && init?.method === "POST",
    )!;
    expect(JSON.parse(String(issuance[1]?.body))).toEqual({ expires_in_seconds: 3600, permissions: ["model:invoke"] });
    fireEvent.click(screen.getByRole("button", { name: "Clear displayed credential" }));
    expect(screen.queryByLabelText("Copy this credential before closing")).not.toBeInTheDocument();
  });

  it("follows owner-provided invocation evidence with unresolved money visible", async () => {
    const invocation = {
      invocation_id: "abcdef1234567890",
      attempt_id: "attempt-exact",
      deployment_id: "deployment-exact",
      account_id: "account-exact",
      currency: "CNY",
      funding: "CUSTOMER_CLOUD",
      created_at: "2026-10-19T00:00:00Z",
      max_cost: "0.2",
      customer_debit: null,
      settlement_state: "PENDING_RECONCILIATION",
      usage_state: "MISSING",
      pricing_state: "UNPRICED",
      attribution: {},
      evidence_url: "/api/model-gateway/invocations/abcdef1234567890/evidence",
    };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/context")) return json(session("org-a"));
      if (url.endsWith("/evidence"))
        return json({
          bundle: {
            invocation,
            raw_observations: [],
            usage_observations: [],
            prices: [],
            fx_quotes: [],
            postings: [],
            sha256: "hash-exact",
          },
          hold_reference: {
            active: true,
            amount: { amount: "0.2", currency: "CNY" },
            settlement_state: "PENDING_RECONCILIATION",
          },
        });
      return json({ data: [invocation] });
    });
    vi.stubGlobal("fetch", fetchImpl);
    renderWithProviders(
      <SemantierSessionProvider>
        <SemantierUsage />
      </SemantierSessionProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: invocation.invocation_id }));
    expect(await screen.findByText("Attempt attempt-exact")).toBeInTheDocument();
    expect(await screen.findByText(/Hold active.*0.2 CNY/)).toBeInTheDocument();
    expect(screen.getByText("Provider-native observations")).toBeInTheDocument();
    expect(screen.getByText("Exact customer and supplier prices")).toBeInTheDocument();
    expect(screen.getByText("Balanced ledger postings")).toBeInTheDocument();
    expect(fetchImpl.mock.calls.some(([url]) => url === invocation.evidence_url)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to usage" }));
    expect(await screen.findByText("Unresolved")).toBeInTheDocument();
  });
});
