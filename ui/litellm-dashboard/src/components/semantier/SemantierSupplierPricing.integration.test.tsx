import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders, testQueryClient } from "../../../tests/test-utils";
import { SemantierSessionProvider } from "./SemantierSession";
import { SemantierSupplierPricing } from "./SemantierSupplierPricing";

vi.mock("next/navigation", () => ({ usePathname: () => "/models-and-endpoints" }));
vi.mock("@/components/price_data_reload", () => ({ default: () => <p>Native reload controls</p> }));
afterEach(() => {
  cleanup();
  testQueryClient.clear();
  vi.unstubAllGlobals();
});

it("collects and restores CNY history without FX or native reload rights", async () => {
  let collected = false;
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (url.endsWith("/context"))
      return json({
        user_id: "operator",
        organization_id: "A",
        organization: { id: "A" },
        permissions: ["billing:manage"],
      });
    if (url.endsWith("/source"))
      return json({
        collected_version: collected ? "v1" : null,
        capabilities: { sync: false },
        effective: null,
        selected: null,
        deployment_overrides: [],
        worker_convergence: "UNKNOWN",
      });
    if (url.endsWith("/collections")) {
      if (init?.method === "POST") {
        collected = true;
        return json({ run_id: "r1", state: "COLLECTED" });
      }
      return json({
        data: collected
          ? [
              {
                run_id: "r1",
                state: "COLLECTED",
                snapshot_version: "v1",
                created_at: "2026-10-29T00:00:00Z",
                reason: null,
              },
            ]
          : [],
      });
    }
    if (url.endsWith("/catalogs/v1"))
      return json({
        version_id: "v1",
        collected_at: "2026-10-29T00:00:00Z",
        effective_from: null,
        api: { status: "COMPLETE" },
        document: { status: "COMPLETE", url: "https://help.aliyun.com/zh/model-studio/model-pricing" },
        normalized: [
          {
            model: "fixture-model",
            currency: "CNY",
            region: "cn-beijing",
            range: "Default",
            prices: [
              { type: "input_token", price: "2", price_unit: "每百万tokens", time_band: "peak" },
              { type: "input_token", price: "1", price_unit: "每百万tokens", time_band: "offpeak" },
            ],
          },
        ],
      });
    throw new Error("unexpected request");
  });
  vi.stubGlobal("fetch", fetchImpl);
  const view = renderWithProviders(
    <SemantierSessionProvider>
      <SemantierSupplierPricing />
    </SemantierSessionProvider>,
  );
  await screen.findByText(/No saved supplier collections/);
  fireEvent.click(screen.getByRole("button", { name: "Refresh supplier data" }));
  expect(await screen.findByText("2 CNY / 每百万tokens")).toBeInTheDocument();
  expect(screen.getByText("1 CNY / 每百万tokens")).toBeInTheDocument();
  expect(screen.getByText("peak")).toBeInTheDocument();
  expect(screen.getByText("offpeak")).toBeInTheDocument();
  expect(screen.queryByText("Native reload controls")).not.toBeInTheDocument();
  const post = fetchImpl.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(post?.[1]?.body)).models).toHaveLength(3);
  expect(post?.[1]?.headers).toMatchObject({ "X-Semantier-CSRF": "1", "X-Semantier-Organization-Id": "A" });
  view.unmount();
  renderWithProviders(
    <SemantierSessionProvider>
      <SemantierSupplierPricing />
    </SemantierSessionProvider>,
  );
  expect(await screen.findByText("2 CNY / 每百万tokens")).toBeInTheDocument();
});
