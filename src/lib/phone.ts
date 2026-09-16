export type NormalizedPhone = {
  raw: string;
  digits: string;
  e164: string;
  valid: boolean;
  reason?: string;
};

/**
 * Padroniza telefones digitados de qualquer forma para o formato E.164.
 * Assume Brasil (+55) quando não houver DDI e adiciona o nono dígito
 * automaticamente em celulares antigos.
 */
export function normalizePhone(input: unknown): NormalizedPhone {
  const raw = String(input ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return { raw, digits: "", e164: "", valid: false, reason: "Telefone vazio" };

  digits = digits.replace(/^0+/, "");
  if (digits.startsWith("55") && digits.length >= 12) {
    // já possui DDI
  } else if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  } else if (digits.length === 8 || digits.length === 9) {
    return { raw, digits, e164: "", valid: false, reason: "Telefone sem DDD" };
  }

  if (digits.startsWith("55")) {
    const rest = digits.slice(2);
    const ddd = rest.slice(0, 2);
    let subscriber = rest.slice(2);
    if (!/^[1-9][1-9]$/.test(ddd)) return { raw, digits, e164: "", valid: false, reason: "DDD inválido" };
    if (subscriber.length === 8 && /^[6-9]/.test(subscriber)) subscriber = `9${subscriber}`;
    if (subscriber.length !== 8 && subscriber.length !== 9) return { raw, digits, e164: "", valid: false, reason: "Quantidade de dígitos inválida" };
    const normalized = `55${ddd}${subscriber}`;
    return { raw, digits: normalized, e164: `+${normalized}`, valid: true };
  }

  if (digits.length >= 8 && digits.length <= 15) return { raw, digits, e164: `+${digits}`, valid: true };
  return { raw, digits, e164: "", valid: false, reason: "Telefone inválido" };
}

export function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    return `+55 (${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return value;
}
