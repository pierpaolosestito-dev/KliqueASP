type NodeDetails = Readonly<Record<string, unknown>>;

function hasValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function hasProfessionalRole(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const role = value as Record<string, unknown>;
  return [role.professione, role.macro_area, role.sotto_area].some(hasValue);
}

/** Reports whether the node details dialog has any user-visible data to show. */
export function hasNodeDetailContent(options: {
  details: NodeDetails | null;
  genericDetailCount: number;
  failedImageUrl?: string;
  resolveImageUrl?: (url: string) => string;
}): boolean {
  if (options.genericDetailCount > 0) return true;
  const details = options.details;
  if (!details) return false;

  if (details.tipo === "person") {
    return [
      details.luogo_nascita,
      details.anno_nascita,
      details.anno_morte,
      details.periodo,
      details.description,
      details.biografia_html
    ].some(hasValue) || (Array.isArray(details.roles) && details.roles.some(hasProfessionalRole));
  }

  if (details.tipo === "place") {
    const imageUrl = typeof details.immagine_url === "string" ? details.immagine_url : "";
    const hasWorkingImage = hasValue(imageUrl) &&
      (options.resolveImageUrl?.(imageUrl) ?? imageUrl) !== (options.failedImageUrl ?? "");
    return hasWorkingImage || [details.citta, details.kind, details.description, details.contenuto].some(hasValue);
  }

  return false;
}
