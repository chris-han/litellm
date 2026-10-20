import { PRODUCT_NAME } from "@/lib/branding";

export function publicModelHubTitle(title?: string | null): string {
  if (title == null) return PRODUCT_NAME;
  const normalized = title.trim();
  return !normalized || normalized === "LiteLLM Gateway" || normalized === "LiteLLM API" ? PRODUCT_NAME : title;
}
