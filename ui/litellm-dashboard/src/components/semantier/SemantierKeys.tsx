"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { KeyRound } from "lucide-react";
import { useSemantierSession } from "./SemantierSession";
import { semantierApi } from "@/lib/http/semantier";
import { Page, PageContent } from "@/components/shared/Page";
import { PageHeader, PageHeaderTitle, PageHeaderDescription } from "@/components/shared/PageHeader";
import { DataTable, DataTableToolbar } from "@/components/shared/DataTable";
import { getKeyTableColumns } from "@/components/VirtualKeysPage/keyTableColumns";
import { type KeyResponse } from "@/components/key_team_helpers/key_list";
import { MultiSelect } from "@/components/shared/MultiSelect";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";

interface OperationalKey extends KeyResponse {
  semantier_key_id: string;
}

export function SemantierKeys() {
  const session = useSemantierSession();
  const client = useQueryClient();
  const key = ["semantier", session.organization_id, "keys"];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => semantierApi.get<{ keys: OperationalKey[] }>("/api/admin/model-gateway/keys", { signal }),
  });
  const [search, setSearch] = useQueryState("key_search", parseAsString.withDefault(""));
  const [selected, setSelected] = useState<KeyResponse | null>(null);
  const [alias, setAlias] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<{ secret: string; token_id: string; expires_at: string } | null>(null);
  const columns = useMemo(
    () =>
      getKeyTableColumns({
        allTeams: [],
        organizations: [],
        teamMemberBudgets: {},
        onSelectKey: setSelected,
        applyUserBudgetToTeamKeys: false,
      }).filter((column) => ["key_alias", "models", "created_at", "expires"].includes(String(column.id))),
    [],
  );
  const rows = (query.data?.keys ?? []).filter((row) =>
    `${row.key_alias ?? ""} ${row.semantier_key_id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await semantierApi.post("/api/admin/model-gateway/keys", { body: { key_alias: alias, models, duration: "24h" } });
      setAlias("");
      setModels([]);
      await client.invalidateQueries({ queryKey: key });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Key creation failed. Retry.");
    } finally {
      setBusy(false);
    }
  };
  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      setCredential(
        await semantierApi.post("/api/model-gateway/credentials", {
          body: {
            expires_in_seconds: 3600,
            permissions: ["model:invoke", "usage:read_self", "billing:read"].filter((scope) =>
              session.permissions.includes(scope),
            ),
          },
        }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Credential issuance failed. Retry.");
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    if (!credential) return;

    setBusy(true);
    setError(null);
    try {
      await semantierApi.delete(`/api/model-gateway/credentials/${encodeURIComponent(credential.token_id)}`);
      setCredential(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Revocation failed. Retry.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page>
      <PageContent>
        <PageHeader>
          <PageHeaderTitle>
            <KeyRound />
            Keys
          </PageHeaderTitle>
          <PageHeaderDescription>
            Organization operational keys stay on the server. Hermes connects using a scoped Semantier credential.
          </PageHeaderDescription>
        </PageHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {session.permissions.includes("model:invoke") && (
          <section className="flex flex-col gap-3 border-b pb-5">
            <h2 className="text-base font-semibold">Hermes access</h2>
            {credential ? (
              <>
                <Field>
                  <FieldLabel htmlFor="gateway-secret">Copy this credential before closing</FieldLabel>
                  <PasswordInput id="gateway-secret" value={credential.secret} readOnly />
                </Field>
                <p className="text-sm text-muted-foreground">
                  Expires {new Date(credential.expires_at).toLocaleString()}. Configure it only in the Semantier
                  connection.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setCredential(null)}>
                    Clear displayed credential
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => void revoke()}>
                    Revoke this credential
                  </Button>
                </div>
              </>
            ) : (
              <Button className="self-start" disabled={busy} onClick={() => void issue()}>
                Create one-hour Hermes credential
              </Button>
            )}
          </section>
        )}
        <details className="border-b pb-5">
          <summary className="cursor-pointer text-base font-semibold">Create an operational key</summary>
          <form onSubmit={(event) => void create(event)} className="mt-4 flex max-w-xl flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="operational-alias">Key alias</FieldLabel>
              <Input
                id="operational-alias"
                required
                maxLength={100}
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="operational-models">Allowed models</FieldLabel>
              <MultiSelect
                id="operational-models"
                options={(session.allowed_key_models ?? []).map((model) => ({ value: model, label: model }))}
                value={models}
                onValueChange={setModels}
                placeholder="Select enabled organization models"
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              Expires in 24 hours. Native keys do not authorize bypassing Semantier billing.
            </p>
            <Button className="self-start" type="submit" disabled={busy || !models.length}>
              {busy ? "Creating…" : "Create operational key"}
            </Button>
          </form>
        </details>
        {selected ? (
          <section className="flex flex-col gap-3">
            <Button variant="outline" className="self-start" onClick={() => setSelected(null)}>
              Back to keys
            </Button>
            <h2 className="font-semibold">{selected.key_alias || "Operational key"}</h2>
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-4 text-xs">
              {JSON.stringify(selected, null, 2)}
            </pre>
          </section>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(row) => (row as OperationalKey).semantier_key_id}
            isLoading={query.isPending}
            isError={query.isError}
            noDataMessage="No operational keys in this organization"
            toolbar={(table) => (
              <DataTableToolbar
                table={table}
                searchValue={search}
                onSearchChange={(value) => void setSearch(value)}
                searchPlaceholder="Search key alias or ID"
                onRefresh={() => void query.refetch()}
                isRefreshing={query.isFetching}
              />
            )}
          />
        )}
      </PageContent>
    </Page>
  );
}
