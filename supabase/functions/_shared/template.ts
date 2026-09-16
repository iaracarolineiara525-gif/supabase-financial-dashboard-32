type TemplateComponent = {
  type?: unknown;
  text?: unknown;
};

function parameterText(parameter: unknown): string {
  if (typeof parameter === "string" || typeof parameter === "number") return String(parameter);
  if (!parameter || typeof parameter !== "object") return "";

  const value = parameter as Record<string, unknown>;
  if (typeof value.text === "string") return value.text;
  if (typeof value.payload === "string") return value.payload;
  if (value.currency && typeof value.currency === "object") {
    const currency = value.currency as Record<string, unknown>;
    if (typeof currency.fallback_value === "string") return currency.fallback_value;
  }
  if (value.date_time && typeof value.date_time === "object") {
    const dateTime = value.date_time as Record<string, unknown>;
    if (typeof dateTime.fallback_value === "string") return dateTime.fallback_value;
  }
  return "";
}

export function renderTemplateBody(template: Record<string, unknown> | null, parameters: unknown): string {
  const components = Array.isArray(template?.components) ? template.components as TemplateComponent[] : [];
  const body = components.find((component) => String(component.type || "").toUpperCase() === "BODY");
  const source = typeof body?.text === "string" ? body.text.trim() : "";
  if (!source) return `[Template] ${String(template?.name || "WhatsApp")}`;

  const values = Array.isArray(parameters) ? parameters.map(parameterText) : [];
  return source.replace(/\{\{\s*(\d+)\s*\}\}/g, (placeholder, indexText: string) => {
    const value = values[Number(indexText) - 1];
    return value || placeholder;
  });
}

export function approvedTemplateFromList(
  data: Record<string, unknown>,
  name: string,
  language: string,
): Record<string, unknown> {
  const templates = Array.isArray(data.data) ? data.data as Array<Record<string, unknown>> : [];
  const match = templates.find((template) => template.name === name && (!language || template.language === language));
  if (!match || String(match.status || "").toUpperCase() !== "APPROVED") {
    throw new Error("The Meta template must have status APPROVED before it can be sent");
  }
  return match;
}
