export type NormalizedPhone = {
  raw: string;
  digits: string;
  e164: string;
  valid: boolean;
  reason?: string;
};

/**
 * Normaliza telefones informados de qualquer jeito (com máscara, espaços,
 * com ou sem DDI) para o formato E.164 usado pela Meta.
 * Assume Brasil (+55) quando o número não traz DDI.
 */
export function normalizeBrazilPhone(input: unknown): NormalizedPhone {
  const raw = String(input ?? "").trim();
  let digits = raw.replace(/\D/g, "");

  if (!digits) return { raw, digits: "", e164: "", valid: false, reason: "Telefone vazio" };

  // Remove prefixos internacionais digitados como 00 / 0055
  digits = digits.replace(/^0+/, "");
  if (digits.startsWith("55") && digits.length >= 12) {
    // já tem DDI
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
    // Celular antigo com 8 dígitos: adiciona o nono dígito automaticamente
    if (subscriber.length === 8 && /^[6-9]/.test(subscriber)) subscriber = `9${subscriber}`;
    if (subscriber.length !== 8 && subscriber.length !== 9) {
      return { raw, digits, e164: "", valid: false, reason: "Quantidade de dígitos inválida" };
    }
    const normalized = `55${ddd}${subscriber}`;
    return { raw, digits: normalized, e164: `+${normalized}`, valid: true };
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return { raw, digits, e164: `+${digits}`, valid: true };
  }

  return { raw, digits, e164: "", valid: false, reason: "Telefone inválido" };
}

export function maskPhoneDigits(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 6) return "—";
  return `+${digits.slice(0, 4)}•••••${digits.slice(-4)}`;
}
