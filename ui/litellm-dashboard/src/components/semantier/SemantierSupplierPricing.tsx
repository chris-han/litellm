"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { semantierApi } from "@/lib/http/semantier";
import { useSemantierSession } from "./SemantierSession";
import { Button } from "@/components/ui/button";
import PriceDataReload from "@/components/price_data_reload";

const path = "/api/admin/model-gateway/pricing";
interface Run {
  run_id: string;
  state: string;
  snapshot_version: string | null;
  created_at: string;
  reason: string | null;
}
interface Source {
  collected_version: string | null;
  capabilities: { sync: boolean };
  worker_convergence: string;
  selected: {
    projection_version: string;
    effective_revision: string | null;
    state: string;
    snapshot_version?: string;
    excluded?: Record<string, string>;
    coverage?: string;
  } | null;
  effective: { source_revision: string | null } | null;
  fx_quotes?: { quote_id: string; base: string; quote: string; rate: string; source: string }[];
  deployment_overrides: { model: string; fields: string[] }[];
}
interface Snapshot {
  version_id: string;
  collected_at: string;
  effective_from: string | null;
  api: { status: string; reason: string | null };
  document: {
    status: string;
    reason: string | null;
    url: string;
    matches?: Record<string, { status: string; reason: string | null }>;
  };
  normalized: {
    model: string;
    currency: string;
    region: string;
    range: string;
    prices: { type: string; price: string; price_unit: string; time_band: string }[];
  }[];
}

export function SemantierSupplierPricing() {
  const session = useSemantierSession();
  const client = useQueryClient();
  const key = ["semantier", session.organization_id, "supplier-pricing"];
  const [selected, setSelected] = useState<string | null>(null);
  const [fx, setFx] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const runs = useQuery({
    queryKey: [...key, "runs"],
    retry: false,
    queryFn: ({ signal }) => semantierApi.get<{ data: Run[] }>(path + "/collections", { signal }),
  });
  const source = useQuery({
    queryKey: [...key, "source"],
    retry: false,
    queryFn: ({ signal }) => semantierApi.get<Source>(path + "/source", { signal }),
  });
  const run = runs.data?.data.find((r) => r.run_id === selected) ?? runs.data?.data[0];
  const version = run?.snapshot_version;
  const detail = useQuery({
    queryKey: [...key, "catalog", version],
    enabled: Boolean(version),
    retry: false,
    queryFn: ({ signal }) => semantierApi.get<Snapshot>(path + "/catalogs/" + encodeURIComponent(version!), { signal }),
  });
  async function act(action: "collect" | "sync") {
    setBusy(true);
    setMessage(null);
    try {
      if (action === "collect") {
        const result = await semantierApi.post<Run>(path + "/collections", {
          body: {
            idempotency_key: crypto.randomUUID(),
            models: ["qwen3.5-plus", "qwen3.8-max", "deepseek-v4.1-flash-1017"],
          },
        });
        setSelected(result.run_id);
        setMessage(`Collection ${result.state}. Collected data does not change active prices.`);
      } else {
        const result = await semantierApi.post<{ effective: boolean; excluded: Record<string, string> }>(
          path + "/sync",
          {
            body: { run_id: run?.run_id, fx_quote_id: fx },
          },
        );
        setMessage(
          `${result.effective ? "Loaded on the observed worker" : "Synchronization failed, prior native prices retained"}. ${Object.entries(
            result.excluded,
          )
            .map(([m, reason]) => `${m}: ${reason}`)
            .join("; ")}`,
        );
      }
      await client.invalidateQueries({ queryKey: key });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Price operation failed. Saved data is retained.");
    } finally {
      setBusy(false);
    }
  }
  if (!session.permissions.includes("billing:manage"))
    return <p>Billing management permission is required to view supplier sources.</p>;
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Supplier price collection">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Alibaba supplier prices</h3>
          <p className="text-sm text-muted-foreground">
            Beijing public list prices in CNY, separate from customer tariffs and settled costs.
          </p>
        </div>
        <Button disabled={busy} onClick={() => void act("collect")}>
          {busy ? "Working…" : "Refresh supplier data"}
        </Button>
      </div>
      {(runs.isPending || source.isPending) && <p role="status">Loading saved price sources…</p>}
      {(runs.isError || source.isError) && (
        <p role="alert">Saved sources unavailable. Check billing access and refresh the page.</p>
      )}
      {message && (
        <p role="status" className="break-words text-sm">
          {message}
        </p>
      )}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt>Selected collection version</dt>
        <dd className="break-all font-mono">{version ?? "No collected version"}</dd>
        <dt>Native effective version</dt>
        <dd className="break-all font-mono">
          {source.data?.effective?.source_revision ?? "Not observed, platform access required"}
        </dd>
        <dt>Synchronization</dt>
        <dd>
          {source.data?.selected?.snapshot_version === version
            ? source.data?.selected?.state
            : "This collection is not the selected native source"}
          . Worker convergence {source.data?.worker_convergence ?? "UNKNOWN"}.
        </dd>
      </dl>
      {source.data?.selected?.excluded &&
        Object.entries(source.data.selected.excluded).map(([model, reason]) => (
          <p className="text-sm" key={model}>
            Native mapping unavailable for {model}: {reason}. Collected CNY prices are retained.
          </p>
        ))}
      {runs.isSuccess && !runs.data.data.length && (
        <p>
          No saved supplier collections. Refresh to collect metadata and the official price page. No model inference is
          sent.
        </p>
      )}
      {Boolean(runs.data?.data.length) && (
        <label className="flex flex-col gap-2 text-sm">
          Collection history
          <select
            className="h-9 max-w-full rounded-md border bg-background px-3"
            value={run?.run_id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {runs.data?.data.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {r.created_at} · {r.state}
              </option>
            ))}
          </select>
        </label>
      )}
      {run && (
        <p className="text-sm">
          Collection {run.state}
          {run.reason ? ` · ${run.reason}` : ""}
        </p>
      )}
      {detail.isError && (
        <p role="alert">This saved source could not be read. Select another collection or refresh access.</p>
      )}
      {detail.data && (
        <>
          <p className="text-sm">
            API {detail.data.api.status}
            {detail.data.api.reason ? ` · ${detail.data.api.reason}` : ""}. Official page {detail.data.document.status}
            {detail.data.document.reason ? ` · ${detail.data.document.reason}` : ""}.
          </p>
          {Object.entries(detail.data.document.matches ?? {})
            .filter(([, m]) => m.status !== "MATCH")
            .map(([model, m]) => (
              <p className="text-sm" key={model}>
                Official reference {model}: {m.status} · {m.reason}
              </p>
            ))}
          {!detail.data.normalized.length && (
            <p>No API rate rows were captured. Saved source evidence remains available.</p>
          )}
          <div
            className="max-h-96 max-w-full overflow-auto rounded-md border"
            tabIndex={0}
            aria-label="Supplier prices by tier"
          >
            <table className="w-full text-left text-sm">
              <caption className="p-3 text-left text-muted-foreground">
                Collected CNY rates. Effective date {detail.data.effective_from ?? "not supplied"}. Online, cache and
                batch dimensions remain separate.
              </caption>
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="p-3">Model / input tier</th>
                  <th className="p-3">Token dimension</th>
                  <th className="p-3">Time band</th>
                  <th className="p-3">CNY per million tokens</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.normalized.flatMap((r, i) =>
                  r.prices.map((p, j) => (
                    <tr key={`${i}-${j}`} className="border-b last:border-0">
                      <td className="p-3">
                        <span className="font-medium">{r.model}</span>
                        <br />
                        {r.range}
                      </td>
                      <td className="p-3">{p.type}</td>
                      <td className="p-3">{p.time_band ?? "Unknown"}</td>
                      <td className="p-3 font-mono tabular-nums">
                        {p.price ?? "Unknown"} {r.currency} / {p.price_unit ?? "unknown unit"}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer py-2">Source and version details</summary>
            <p className="break-all">{detail.data.version_id}</p>
            <p>Collected {detail.data.collected_at}</p>
            <a className="underline" href={detail.data.document.url} target="_blank" rel="noreferrer">
              Official Alibaba price page
            </a>
          </details>
        </>
      )}
      {source.data?.capabilities.sync ? (
        <div className="flex flex-col gap-4 border-t pt-4">
          <h3 className="font-semibold">Synchronize native USD catalogue</h3>
          <p className="text-sm text-muted-foreground">
            Requires an exact retained CNY/USD FX quote. Unsupported or conflicting entries are excluded. Deployment
            custom prices retain precedence.
          </p>
          <label className="flex max-w-lg flex-col gap-2 text-sm">
            FX version
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={fx}
              onChange={(e) => setFx(e.target.value)}
            >
              <option value="">Select retained FX quote</option>
              {source.data.fx_quotes?.map((q) => (
                <option key={q.quote_id} value={q.quote_id}>
                  {q.quote_id} · {q.base}/{q.quote} {q.rate} · {q.source}
                </option>
              ))}
            </select>
          </label>
          {!source.data.fx_quotes?.length && (
            <p className="text-sm">
              USD mapping unavailable until a governed FX version exists. CNY data remains viewable.
            </p>
          )}
          <Button className="self-start" disabled={busy || !fx || !version} onClick={() => void act("sync")}>
            Synchronize selected collection
          </Button>
          {source.data.deployment_overrides.map((o) => (
            <p className="text-sm" key={o.model}>
              Deployment override {o.model}: {o.fields.join(", ")}
            </p>
          ))}
          <PriceDataReload accessToken="" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Shared catalogue synchronization and schedules require platform operator access. Collection and CNY viewing
          remain available.
        </p>
      )}
    </section>
  );
}
