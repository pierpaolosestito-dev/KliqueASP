/**
 * Applies presentation defaults to declared node types without treating JSON
 * keys such as "__proto__" as JavaScript object mutation instructions.
 */
export function normalizeNodeTypeConfigStyles(nodeTypesInput: unknown): Record<string, unknown> {
  if (!nodeTypesInput || typeof nodeTypesInput !== "object" || Array.isArray(nodeTypesInput)) {
    return {};
  }

  const nodeTypes = nodeTypesInput as Record<string, unknown>;
  const defaultStyle = Object.prototype.hasOwnProperty.call(nodeTypes, "default")
    ? nodeTypes.default
    : {};

  return Object.fromEntries(
    Object.entries(nodeTypes).map(([type, config]) => {
      if (type === "default" || type === "highlight" || !config || typeof config !== "object") {
        return [type, config];
      }

      // Each declared type inherits the default presentation style. Object
      // spread creates own data properties even when a key is "__proto__".
      const normalizedConfig: Record<string, unknown> = {
        ...(defaultStyle as object),
        ...(config as object)
      };

      // A timeline declaration implies the temporal presentation category
      // unless the graph explicitly chooses another category.
      if (normalizedConfig.timeline && !normalizedConfig.category) {
        normalizedConfig.category = "temporal";
      }

      return [type, normalizedConfig];
    })
  );
}
