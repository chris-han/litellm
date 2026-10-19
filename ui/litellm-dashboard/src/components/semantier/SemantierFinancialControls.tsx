"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSemantierSession } from "./SemantierSession";
import { semantierApi } from "@/lib/http/semantier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

export function SemantierBudgetForm({ currency, initialLimit }: { currency: string; initialLimit: string }) {
  const session = useSemantierSession();
  const client = useQueryClient();
  const [amount, setAmount] = useState(initialLimit);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await semantierApi.post("/api/billing/budget", { body: { limit: { amount, currency } } });
      setMessage("Budget limit updated.");
      await client.invalidateQueries({ queryKey: ["semantier", session.organization_id, "account"] });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Budget update failed. Retry.");
    } finally {
      setBusy(false);
    }
  };
  if (!session.permissions.includes("budgets:manage")) return null;
  return (
    <form onSubmit={(event) => void submit(event)} className="mt-6 flex max-w-md flex-col gap-3">
      <h3 className="font-semibold">Update account budget</h3>
      <Field>
        <FieldLabel htmlFor="budget-limit">Limit ({currency})</FieldLabel>
        <Input
          id="budget-limit"
          inputMode="decimal"
          required
          pattern="[0-9]+([.][0-9]{1,12})?"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <p className="text-sm text-muted-foreground">
        A limit cannot be lower than consumed usage plus active holds. This does not issue service credits.
      </p>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <Button type="submit" className="self-start" disabled={busy}>
        {busy ? "Saving…" : "Save budget limit"}
      </Button>
    </form>
  );
}

interface Price {
  version_id: string;
  currency: string;
  rates: Record<string, string>;
  provider: string;
  model: string;
  unit: number;
  min_input: number;
  max_input: number | null;
  provenance: string;
}

export function SemantierPrices() {
  const session = useSemantierSession();
  const client = useQueryClient();
  const key = ["semantier", session.organization_id, "prices"];
  const prices = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      semantierApi.get<{ data: Array<{ version_id: string; payload: Price }> }>("/api/billing/prices", { signal }),
  });
  const [currency, setCurrency] = useState("USD");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [cacheRead, setCacheRead] = useState("");
  const [cacheWrite, setCacheWrite] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [maximum, setMaximum] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await semantierApi.post<Price>("/api/billing/prices", {
        body: {
          currency,
          rates: {
            uncached_input: input,
            output_total: output,
            ...(cacheRead ? { cache_read_input: cacheRead } : {}),
            ...(cacheWrite ? { cache_write_input: cacheWrite } : {}),
          },
          unit: 1000000,
          min_input: Number(minimum),
          ...(maximum ? { max_input: Number(maximum) } : {}),
        },
      });
      setMessage(`Created immutable price ${result.version_id}. It is not active until bound by deployment policy.`);
      setInput("");
      setOutput("");
      await client.invalidateQueries({ queryKey: key });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Price creation failed. Retry.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-6 flex flex-col gap-4">
      <h3 className="font-semibold">Organization customer tariff versions</h3>
      {prices.isPending && <p role="status">Loading prices…</p>}
      {prices.isError && <p role="alert">Prices unavailable. Refresh after checking billing access.</p>}
      {prices.isSuccess && Boolean(prices.data?.data.length) && (
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Version</th>
                <th className="p-2">Currency</th>
                <th className="p-2">Native unit rates</th>
                <th className="p-2">Context band</th>
              </tr>
            </thead>
            <tbody>
              {prices.data.data.map(({ version_id, payload: price }) => (
                <tr key={version_id} className="border-b">
                  <td className="break-all p-2">{version_id}</td>
                  <td className="p-2">{price.currency}</td>
                  <td className="p-2 tabular-nums">
                    {Object.entries(price.rates)
                      .map(([unit, value]) => `${unit}: ${value} per ${price.unit} tokens`)
                      .join(" · ")}
                  </td>
                  <td className="p-2">
                    {price.min_input}–{price.max_input ?? "unbounded"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {prices.isSuccess && !prices.data?.data.length && (
        <p className="text-sm text-muted-foreground">No customer price versions in this organization.</p>
      )}
      {session.permissions.includes("billing:manage") && (
        <form onSubmit={(event) => void submit(event)} className="flex max-w-md flex-col gap-3 border-t pt-4">
          <h3 className="font-semibold">Create a customer tariff version</h3>
          <Field>
            <FieldLabel htmlFor="price-currency">Currency</FieldLabel>
            <select
              id="price-currency"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="input-rate">Ordinary input per million tokens</FieldLabel>
            <Input
              id="input-rate"
              inputMode="decimal"
              required
              pattern="[0-9]+([.][0-9]{1,12})?"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="output-rate">Output per million tokens</FieldLabel>
            <Input
              id="output-rate"
              inputMode="decimal"
              required
              pattern="[0-9]+([.][0-9]{1,12})?"
              value={output}
              onChange={(event) => setOutput(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cache-read-rate">Cache read per million tokens (optional)</FieldLabel>
            <Input
              id="cache-read-rate"
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{1,12})?"
              value={cacheRead}
              onChange={(event) => setCacheRead(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cache-write-rate">Cache write per million tokens (optional)</FieldLabel>
            <Input
              id="cache-write-rate"
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{1,12})?"
              value={cacheWrite}
              onChange={(event) => setCacheWrite(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="minimum-input">Minimum input tokens</FieldLabel>
            <Input
              id="minimum-input"
              type="number"
              required
              min={0}
              step={1}
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="maximum-input">Maximum input tokens (optional)</FieldLabel>
            <Input
              id="maximum-input"
              type="number"
              min={Number(minimum)}
              step={1}
              value={maximum}
              onChange={(event) => setMaximum(event.target.value)}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Listed versions may be unbound. Applied prices are pinned in invocation evidence. New versions require a
            separate deployment-policy binding. All request tokens use the applicable full context band. Cache usage
            remains unpriced unless the applicable version explicitly includes cache rates.
          </p>
          {message && (
            <p role="status" className="break-all text-sm">
              {message}
            </p>
          )}
          <Button className="self-start" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create price version"}
          </Button>
        </form>
      )}
    </section>
  );
}

interface Comparison {
  data: Array<{
    deployment_id: string;
    status?: string;
    comparison?: Array<{
      price_version: string;
      native_currency: string;
      standard_usd_per_million: Record<string, string> | null;
      scenario: {
        known_cost: { amount: string | null; currency: string };
        usd_per_million: string | null;
        reason: string | null;
      };
      realized: { usd_per_million: string | null; reason: string | null };
    }>;
  }>;
}

export function SemantierScenario({
  invocationId,
  native,
}: {
  invocationId: string;
  native: { provider: string; raw_usage: Record<string, unknown> };
}) {
  const session = useSemantierSession();
  const query = useQuery({
    queryKey: ["semantier", session.organization_id, "comparison", invocationId],
    queryFn: ({ signal }) =>
      semantierApi.get<Comparison>("/api/billing/comparison", {
        signal,
        query: { provider: native.provider, raw_usage: JSON.stringify(native.raw_usage) },
      }),
    enabled: session.permissions.includes("billing:read"),
  });
  return (
    <section className="mt-6 flex flex-col gap-3">
      <h3 className="font-semibold">Compare this request workload</h3>
      <p className="text-sm text-muted-foreground">
        Costs use the retained native token mix and current authorized tariff versions. Token volume does not establish
        task quality.
      </p>
      {query.isPending && query.fetchStatus === "fetching" && <p role="status">Calculating scenario prices…</p>}
      {query.isError && <p role="alert">Comparison unavailable for this account or provider scope.</p>}
      {query.data &&
        query.data.data.map((deployment) => (
          <div key={deployment.deployment_id} className="border-b py-3">
            <p className="break-all text-sm font-medium">Deployment {deployment.deployment_id}</p>
            {deployment.comparison?.map((comparison) => (
              <dl
                key={comparison.price_version}
                className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 text-sm"
              >
                <dt className="text-muted-foreground">Price version</dt>
                <dd className="break-all">{comparison.price_version}</dd>
                <dt className="text-muted-foreground">Scenario native cost</dt>
                <dd className="tabular-nums">
                  {comparison.scenario.known_cost.amount ?? "Unknown"} {comparison.native_currency}
                </dd>
                <dt className="text-muted-foreground">Scenario USD / million tokens</dt>
                <dd className="tabular-nums">
                  {comparison.scenario.usd_per_million ?? comparison.scenario.reason ?? "Unavailable"}
                </dd>
                <dt className="text-muted-foreground">Standard USD / million tokens</dt>
                <dd>
                  {comparison.standard_usd_per_million
                    ? Object.entries(comparison.standard_usd_per_million)
                        .map(([unit, amount]) => `${unit}: ${amount}`)
                        .join(" · ")
                    : "FX or price unavailable"}
                </dd>
                <dt className="text-muted-foreground">Realized period price</dt>
                <dd>{comparison.realized.usd_per_million ?? comparison.realized.reason ?? "Unavailable"}</dd>
              </dl>
            )) ?? <p className="text-sm">{deployment.status ?? "Unpriced"}</p>}
          </div>
        ))}
    </section>
  );
}
