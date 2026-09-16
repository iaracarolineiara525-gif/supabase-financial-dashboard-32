import { supabase } from "@/integrations/supabase/client";
import { pinSessionHeaders } from "@/lib/v4PinSession";

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export const AUDIO_MIME_TYPES = ["audio/aac", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/mpeg", "audio/mp3", "audio/amr", "audio/ogg"];
export const VIDEO_MIME_TYPES = ["video/mp4", "video/3gp", "video/3gpp"];
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];
export const DOCUMENT_MIME_TYPES = ["application/pdf"];

export type MediaKind = "audio" | "video" | "image" | "document";

export function allowedTypes(kind: MediaKind): string[] {
  if (kind === "audio") return AUDIO_MIME_TYPES;
  if (kind === "video") return VIDEO_MIME_TYPES;
  if (kind === "image") return IMAGE_MIME_TYPES;
  return DOCUMENT_MIME_TYPES;
}

export function acceptAttribute(kind: MediaKind): string {
  if (kind === "audio") return ".aac,.m4a,.mp3,.mpga,.amr,.ogg,.opus,audio/*";
  if (kind === "video") return ".mp4,.3gp,video/mp4,video/3gpp";
  if (kind === "image") return ".jpg,.jpeg,.png,image/jpeg,image/png";
  return ".pdf,application/pdf";
}

/** Validação no navegador antes de gastar banda; o backend valida novamente. */
export function validateFile(kind: MediaKind, file: File): string | null {
  const mime = (file.type || "").split(";")[0].toLowerCase();
  if (file.size <= 0) return "O arquivo está vazio.";
  if (file.size > MAX_MEDIA_BYTES) return "O arquivo passa do limite de 16 MB da Meta.";
  if (mime && !allowedTypes(kind).includes(mime)) {
    if (kind === "video") return "Use um vídeo MP4 ou 3GP (vídeo H.264 e áudio AAC).";
    if (kind === "audio") return "Use áudio AAC, MP4/M4A, MP3, AMR ou OGG/Opus.";
    if (kind === "image") return "Use uma imagem JPG ou PNG.";
    return "Use um documento PDF.";
  }
  return null;
}

export type MediaUploadResult = {
  mediaId?: string;
  handle?: string;
  mimeType?: string;
  fileName?: string;
  bytes?: number;
  dryRun?: boolean;
  notice?: string;
  codecWarning?: string | null;
};

/**
 * Envia o arquivo para a Edge Function, que faz o upload à Meta.
 * O token oficial nunca é exposto no navegador.
 */
export async function uploadMedia(options: {
  file: File;
  kind: MediaKind;
  target: "message" | "template";
  onProgress?: (percent: number) => void;
  retries?: number;
}): Promise<MediaUploadResult> {
  const { file, kind, target, onProgress } = options;
  const retries = options.retries ?? 1;
  const localError = validateFile(kind, file);
  if (localError) throw new Error(localError);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const baseUrl = projectId ? `https://${projectId}.functions.supabase.co` : null;

  const attempt = (): Promise<MediaUploadResult> => new Promise((resolve, reject) => {
    if (!baseUrl) {
      // Fallback sem progresso, mas funcional.
      void supabase.functions
        .invoke("whatsapp-media-upload", { body: buildForm(file, kind, target), headers: pinSessionHeaders() })
        .then(({ data, error }) => {
          if (error || !data?.ok) reject(new Error(data?.error || error?.message || "Upload recusado."));
          else resolve(data as MediaUploadResult);
        });
      return;
    }

    const request = new XMLHttpRequest();
    request.open("POST", `${baseUrl}/whatsapp-media-upload`);
    const headers = pinSessionHeaders() as Record<string, string>;
    for (const [key, value] of Object.entries(headers)) request.setRequestHeader(key, value);
    request.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Falha de rede durante o envio do arquivo."));
    request.onload = () => {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(request.responseText || "{}"); } catch { payload = {}; }
      if (request.status >= 200 && request.status < 300 && payload.ok) resolve(payload as MediaUploadResult);
      else reject(new Error(typeof payload.error === "string" ? payload.error : `O servidor recusou o arquivo (HTTP ${request.status}).`));
    };
    request.send(buildForm(file, kind, target));
  });

  let lastError: unknown = null;
  for (let index = 0; index <= retries; index += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      // Só repete falhas de rede: erros de validação/Meta não mudam ao repetir.
      if (!(error instanceof Error) || !error.message.startsWith("Falha de rede")) break;
      onProgress?.(0);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload recusado.");
}

function buildForm(file: File, kind: MediaKind, target: "message" | "template"): FormData {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  form.append("target", target);
  return form;
}
