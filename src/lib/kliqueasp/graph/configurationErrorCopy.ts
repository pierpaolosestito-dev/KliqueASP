const INTERNAL_CONFIGURATION_PATH = /(?:graphAnalysis|graphMapping|graphIntegrity)\.|\bedgeAdditions(?:\[|\b)|\b(?:sourceNodeId|targetNodeId|recordIndex)\b/;

/** Keeps configuration implementation paths out of primary task errors. */
export function getUserFacingConfigurationError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return INTERNAL_CONFIGURATION_PATH.test(message) ? fallback : message;
}
