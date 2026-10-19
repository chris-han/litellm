import { describe, expect, it, vi } from "vitest";
import { createSemantierClient, modelMutationBody } from "./semantier";

describe("Semantier cookie facade", () => {
  it("sends same-origin cookies and CSRF without a Proxy bearer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] })));
    const client = createSemantierClient(fetchImpl);
    await client.post("/api/admin/model-gateway/models", { body: { model_name: "test" } });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/admin/model-gateway/models");
    expect(options.credentials).toBe("same-origin");
    expect(options.headers["X-Semantier-CSRF"]).toBe("1");
    expect(options.headers.Authorization).toBeUndefined();
  });
  it("projects native model form values into the finite operation", () => {
    const body = modelMutationBody({
      model_name: "chat",
      litellm_params: {
        model: "azure/model",
        api_key: "os.environ/SEMANTIER_PROVIDER_AABBCCDDEEFF_API_KEY",
        custom_llm_provider: "azure",
      },
      model_info: {},
    });
    expect(body).toEqual({
      model_name: "chat",
      litellm_params: { model: "azure/model", api_key: "os.environ/SEMANTIER_PROVIDER_AABBCCDDEEFF_API_KEY" },
    });
    expect(() => modelMutationBody({ model_name: "chat", litellm_params: { model: "x", drop_params: true } })).toThrow(
      "Unsupported model setting",
    );
  });
});
