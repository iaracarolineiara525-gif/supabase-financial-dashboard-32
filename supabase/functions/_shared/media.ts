// Helpers de mídia para a integração oficial WhatsApp Cloud API.
// Todo upload/download acontece somente no backend: o token nunca sai daqui.
import { AdminClient, graphBaseUrl, graphVersion, requiredEnv, sha256Hex } from "./meta.ts";

export const MEDIA_BUCKET = "whatsapp-media";
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export const AUDIO_MIME_TYPES = [
  "audio/aac",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/amr",
  "audio/ogg",
  "audio/ogg; codecs=opus",
];

export const VIDEO_MIME_TYPES = ["video/mp4", "video/3gp", "video/3gpp"];
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
];

export type MediaKind = "audio" | "video" | "image" | "document";

function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

export function allowedMimeTypes(kind: MediaKind): string[] {
  if (kind === "audio") return AUDIO_MIME_TYPES;
  if (kind === "video") return VIDEO_MIME_TYPES;
  if (kind === "image") return IMAGE_MIME_TYPES;
  return DOCUMENT_MIME_TYPES;
}

export function validateMedia(kind: MediaKind, mimeType: string, byteLength: number): string {
  const normalized = baseMime(mimeType || "");
  if (!normalized) throw new Error("Tipo do arquivo não identificado.");
  const allowed = allowedMimeTypes(kind).map(baseMime);
  if (!allowed.includes(normalized)) {
    throw new Error(
      kind === "video"
        ? "Vídeo inválido. A Meta aceita apenas MP4 ou 3GP com vídeo H.264 e áudio AAC."
        : kind === "audio"
        ? "Áudio inválido. A Meta aceita AAC, MP4/M4A, MPEG/MP3, AMR e OGG/Opus."
        : `Tipo de arquivo não suportado para ${kind}.`,
    );
  }
  if (byteLength <= 0) throw new Error("Arquivo vazio.");
  if (byteLength > MAX_MEDIA_BYTES) throw new Error("Arquivo acima do limite de 16 MB da Meta.");
  return normalized;
}

/**
 * Checagem best-effort dos codecs de MP4: procura as marcas 'avc1'/'H264' e 'mp4a' (AAC)
 * nos primeiros KB do arquivo. Retorna null quando não é possível concluir.
 */
export function inspectMp4Codecs(bytes: Uint8Array): { h264: boolean; aac: boolean } | null {
  const slice = bytes.subarray(0, Math.min(bytes.length, 512 * 1024));
  let text = "";
  for (let index = 0; index < slice.length; index += 1) text += String.fromCharCode(slice[index]);
  if (!text.includes("ftyp")) return null;
  return { h264: text.includes("avc1") || text.includes("avc3") || text.includes("H264"), aac: text.includes("mp4a") };
}

/** Faz upload para POST /{PHONE_NUMBER_ID}/media e devolve o media ID reutilizável. */
export async function uploadMediaToMeta(bytes: Uint8Array, mimeType: string, fileName: string): Promise<string> {
  const token = requiredEnv("META_ACCESS_TOKEN");
  const phoneNumberId = requiredEnv("META_PHONE_NUMBER_ID");
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", baseMime(mimeType));
  form.append("file", new Blob([bytes], { type: baseMime(mimeType) }), fileName || "arquivo");

  const response = await fetch(`${graphBaseUrl()}/${graphVersion()}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: form,
  });
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok || typeof data.id !== "string") {
    const metaError = data.error as Record<string, unknown> | undefined;
    throw new Error(typeof metaError?.message === "string" ? metaError.message : `Upload de mídia recusado pela Meta (HTTP ${response.status}).`);
  }
  return data.id;
}

/**
 * Resumable Upload API: devolve o header_handle exigido no exemplo de templates
 * com cabeçalho de imagem, vídeo ou documento.
 */
export async function uploadTemplateHeaderHandle(bytes: Uint8Array, mimeType: string, fileName: string): Promise<string> {
  const token = requiredEnv("META_ACCESS_TOKEN");
  const appId = Deno.env.get("META_APP_ID")?.trim();
  if (!appId) throw new Error("Configuração ausente: META_APP_ID é necessário para enviar mídia de exemplo do template.");
  const type = baseMime(mimeType);

  const startUrl = new URL(`${graphBaseUrl()}/${graphVersion()}/${appId}/uploads`);
  startUrl.searchParams.set("file_name", fileName || "arquivo");
  startUrl.searchParams.set("file_length", String(bytes.byteLength));
  startUrl.searchParams.set("file_type", type);
  const startResponse = await fetch(startUrl.toString(), { method: "POST", headers: { Authorization: `OAuth ${token}` } });
  const startRaw = await startResponse.text();
  let startData: Record<string, unknown> = {};
  try { startData = startRaw ? JSON.parse(startRaw) : {}; } catch { startData = {}; }
  if (!startResponse.ok || typeof startData.id !== "string") {
    const metaError = startData.error as Record<string, unknown> | undefined;
    throw new Error(typeof metaError?.message === "string" ? metaError.message : `A Meta recusou o início do upload (HTTP ${startResponse.status}).`);
  }

  const finishResponse = await fetch(`${graphBaseUrl()}/${graphVersion()}/${startData.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_offset: "0", "Content-Type": type },
    body: bytes,
  });
  const finishRaw = await finishResponse.text();
  let finishData: Record<string, unknown> = {};
  try { finishData = finishRaw ? JSON.parse(finishRaw) : {}; } catch { finishData = {}; }
  if (!finishResponse.ok || typeof finishData.h !== "string") {
    const metaError = finishData.error as Record<string, unknown> | undefined;
    throw new Error(typeof metaError?.message === "string" ? metaError.message : `A Meta recusou o envio do arquivo (HTTP ${finishResponse.status}).`);
  }
  return finishData.h;
}

export type StoredMedia = {
  storagePath: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
};

/**
 * Consulta GET /{media-id}, baixa a URL temporária imediatamente e grava no bucket
 * privado com caminho isolado por conversa/mensagem. A URL da Meta nunca é persistida.
 */
export async function downloadMetaMediaToStorage(
  supabase: AdminClient,
  options: { mediaId: string; conversationId: string; messageKey: string; fallbackMime?: string | null },
): Promise<StoredMedia> {
  const token = requiredEnv("META_ACCESS_TOKEN");
  const lookup = await fetch(`${graphBaseUrl()}/${graphVersion()}/${options.mediaId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const lookupRaw = await lookup.text();
  let lookupData: Record<string, unknown> = {};
  try { lookupData = lookupRaw ? JSON.parse(lookupRaw) : {}; } catch { lookupData = {}; }
  if (!lookup.ok || typeof lookupData.url !== "string") {
    const metaError = lookupData.error as Record<string, unknown> | undefined;
    throw new Error(typeof metaError?.message === "string" ? metaError.message : `Não foi possível localizar a mídia na Meta (HTTP ${lookup.status}).`);
  }

  const download = await fetch(lookupData.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!download.ok) throw new Error(`Falha ao baixar a mídia da Meta (HTTP ${download.status}).`);
  const buffer = new Uint8Array(await download.arrayBuffer());
  const mimeType = baseMime(String(lookupData.mime_type || options.fallbackMime || download.headers.get("content-type") || "application/octet-stream"));
  const extension = mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
  const storagePath = `conversations/${options.conversationId}/${options.messageKey}.${extension}`;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, buffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Falha ao gravar a mídia no armazenamento privado: ${error.message}`);

  let checksum = "";
  try {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    checksum = await sha256Hex(storagePath);
  }

  return { storagePath, mimeType, byteLength: buffer.byteLength, sha256: checksum };
}

/** URL assinada curta (60s) apenas para operadores autenticados. Nunca é registrada em log. */
export async function signMediaPath(supabase: AdminClient, storagePath: string, expiresInSeconds = 60): Promise<string | null> {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
