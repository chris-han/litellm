import { ApiError, createApiClient, type ApiClient, type RequestOptions } from "./client";

export const isSemantierGateway = process.env.NEXT_PUBLIC_SEMANTIER_GATEWAY === "1";

let organizationAssertion: string | null = null;
export const setSemantierOrganization = (organizationId: string | null) => {
  organizationAssertion = organizationId;
};

export function createSemantierClient(fetchImpl?: typeof fetch): ApiClient {
  const client = createApiClient({ getBaseUrl: () => "", fetchImpl });
  const options = (path: string, input: RequestOptions = {}): RequestOptions => ({
    body: input.body,
    query: input.query,
    signal: input.signal,
    credentials: "same-origin",
    headers: {
      "X-Semantier-CSRF": "1",
      ...(organizationAssertion && path !== "/api/admin/model-gateway/context"
        ? { "X-Semantier-Organization-Id": organizationAssertion }
        : {}),
    },
  });
  const request: ApiClient["request"] = async (method, path, input) => {
    try {
      return await client.request(method, path, options(path, input));
    } catch (error) {
      if (
        path !== "/api/admin/model-gateway/context" &&
        error instanceof ApiError &&
        [401, 403, 409].includes(error.status) &&
        typeof window !== "undefined"
      )
        window.dispatchEvent(new Event("semantier-context-invalidated"));
      throw error;
    }
  };
  return {
    request,
    get: (path, input) => request("GET", path, input),
    getBlob: (path, input) => client.getBlob(path, options(path, input)),
    post: (path, input) => request("POST", path, input),
    put: (path, input) => request("PUT", path, input),
    delete: (path, input) => request("DELETE", path, input),
    patch: (path, input) => request("PATCH", path, input),
  };
}

export const semantierApi = createSemantierClient();

export interface NativeModelInput {
  model_name?: string;
  litellm_params?: object;
  model_info?: object | null;
}

const SECRET_FIELDS = new Set(["api_key", "aws_access_key_id", "aws_secret_access_key", "aws_session_token"]);

const MODEL_FIELDS = new Set([
  "model",
  "api_key",
  "api_base",
  "api_version",
  "aws_region_name",
  "aws_access_key_id",
  "aws_secret_access_key",
  "aws_session_token",
]);

export function modelMutationBody(input: NativeModelInput) {
  const entries = Object.entries(input.litellm_params ?? {});
  const invalidReference = entries.find(
    ([key, value]) =>
      SECRET_FIELDS.has(key) &&
      value !== "[REDACTED]" &&
      (typeof value !== "string" || !/^os[.]environ\/SEMANTIER_PROVIDER_[A-F0-9]{12}_[A-Z][A-Z0-9_]*$/.test(value)),
  );
  if (invalidReference) throw new Error("Use an organization-scoped private-server credential reference");
  const id = input.model_info && "id" in input.model_info ? input.model_info.id : undefined;
  const controlled: Record<string, unknown> = { timeout: 10, num_retries: 0, max_retries: 0, fallbacks: [] };
  const unsupported = entries.find(
    ([key, value]) =>
      !MODEL_FIELDS.has(key) &&
      key !== "custom_llm_provider" &&
      !(key in controlled && JSON.stringify(value) === JSON.stringify(controlled[key])),
  );
  if (unsupported) throw new Error(`Unsupported model setting: ${unsupported[0]}`);
  return {
    model_name: input.model_name,
    litellm_params: Object.fromEntries(
      entries.filter(([key, value]) => MODEL_FIELDS.has(key) && !(SECRET_FIELDS.has(key) && value === "[REDACTED]")),
    ),
    ...(id ? { model_info: { id } } : {}),
  };
}
