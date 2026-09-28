/**
 * Returns the visible field keys for the AI settings form given the selected provider.
 * Anthropic omits baseUrl because its endpoint is always https://api.anthropic.com.
 */
export function aiFormFields(
  provider: "открытоai-compatible" | "anthropic"
): readonly string[] {
  if (provider === "anthropic") {
    return ["provider", "apiKey", "model"] as const;
  }
  return ["provider", "baseUrl", "apiKey", "model"] as const;
}
