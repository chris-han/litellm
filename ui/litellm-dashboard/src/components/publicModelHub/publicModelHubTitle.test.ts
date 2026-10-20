import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "@/lib/branding";
import { publicModelHubTitle } from "./publicModelHubTitle";

describe("publicModelHubTitle", () => {
  it.each([undefined, null, "", "  ", "LiteLLM Gateway", "LiteLLM API", " LiteLLM API "])(
    "uses the product default for %s",
    (title) => expect(publicModelHubTitle(title)).toBe(PRODUCT_NAME),
  );

  it.each(["Engineering model catalog", "LiteLLM API for Research", "  Custom gateway  ", PRODUCT_NAME])(
    "preserves the explicitly configured title %s",
    (title) => expect(publicModelHubTitle(title)).toBe(title),
  );
});
