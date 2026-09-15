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
  storagePath?: string;
  mimeType?: string;
  fileName?: string;
  bytes?: number;
  dryRun?: boolean;
  notice?: string;
  codecWarning?: string | null;
};

export async function uploadMedia(options: {
  file: File;
  kind: MediaKind;
  target: "message" | "template";
  conversationId?: string;
  onProgress?: (percent: number) => void;
}): Promise<MediaUploadResult> {
  const localError = validateFile(options.kind, options.file);
  if (localError) throw new Error(localError);
  const form = new FormData();
  form.append("file", options.file);
  form.append("kind", options.kind);
  form.append("target", options.target);
  if (options.conversationId) form.append("conversationId", options.conversationId);
  options.onProgress?.(10);
  const { data, error } = await supabase.functions.invoke("whatsapp-media-upload", {
    body: form,
    headers: pinSessionHeaders(),
  });
  options.onProgress?.(100);
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "Upload recusado.");
  return data as MediaUploadResult;
}
