import { adminClient, isTestMode, json, noContent, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";
import { inspectMp4Codecs, MEDIA_BUCKET, MediaKind, uploadMediaToMeta, uploadTemplateHeaderHandle, validateMedia } from "../_shared/media.ts";

const KINDS: MediaKind[] = ["audio", "video", "image", "document"];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);
  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator"]);
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "").toLowerCase() as MediaKind;
    const target = String(form.get("target") || "message").toLowerCase();
    const conversationId = String(form.get("conversationId") || "").trim();
    if (!(file instanceof File)) throw new Error("Selecione um arquivo para enviar.");
    if (!KINDS.includes(kind)) throw new Error("Tipo de mídia inválido.");
    if (!["message", "template"].includes(target)) throw new Error("Destino inválido.");
    if (kind === "audio" && target === "template") throw new Error("A Meta não aceita áudio como cabeçalho de template.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = validateMedia(kind, file.type || "", bytes.byteLength);
    const codecs = kind === "video" ? inspectMp4Codecs(bytes) : null;
    const codecWarning = codecs && (!codecs.h264 || !codecs.aac)
      ? "Não foi possível confirmar vídeo H.264 com áudio AAC. A Meta pode recusar o arquivo."
      : null;
    const supabase = adminClient();

    if (isTestMode()) {
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "whatsapp_media_upload_dry_run", metadata: { kind, target, mime_type: mimeType, bytes: bytes.byteLength } });
      return json(request, { ok: true, dryRun: true, kind, mimeType, bytes: bytes.byteLength, codecWarning });
    }
    if (target === "template") {
      const handle = await uploadTemplateHeaderHandle(bytes, mimeType, file.name);
      await supabase.from("message_audit_logs").insert({ actor_id: null, operator_key: session.operatorKey, action: "whatsapp_template_media_uploaded", metadata: { kind, mime_type: mimeType, bytes: bytes.byteLength } });
      return json(request, { ok: true, dryRun: false, target, handle, kind, mimeType, bytes: bytes.byteLength, fileName: file.name, codecWarning });
    }

    if (!conversationId) throw new Error("Conversa não identificada para salvar a mídia.");
    const mediaId = await uploadMediaToMeta(bytes, mimeType, file.name);
    const extension = mimeType.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
    const storagePath = `conversations/${conversationId}/outbound/${mediaId.replace(/[^A-Za-z0-9_-]/g, "_")}.${extension}`;
    const { error: storageError } = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, bytes, { contentType: mimeType, upsert: true });
    if (storageError) throw new Error(`Mídia enviada à Meta, mas não foi possível salvá-la no histórico: ${storageError.message}`);
    return json(request, { ok: true, dryRun: false, target, mediaId, storagePath, kind, mimeType, bytes: bytes.byteLength, fileName: file.name, codecWarning });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
