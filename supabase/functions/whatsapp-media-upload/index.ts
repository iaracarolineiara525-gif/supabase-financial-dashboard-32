// Upload de mídia exclusivamente no backend: o token da Meta nunca chega ao navegador.
import { adminClient, isTestMode, json, noContent, requirePinRole, safeErrorMessage } from "../_shared/meta.ts";
import { inspectMp4Codecs, MediaKind, uploadMediaToMeta, uploadTemplateHeaderHandle, validateMedia } from "../_shared/media.ts";

const KINDS: MediaKind[] = ["audio", "video", "image", "document"];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, { ok: false, error: "Method not allowed" }, 405);

  try {
    const session = await requirePinRole(request, ["owner", "admin", "operator"]);
    const form = await request.formData();
    const file = form.get("file");
    const kindValue = String(form.get("kind") || "").toLowerCase() as MediaKind;
    const target = String(form.get("target") || "message").toLowerCase();

    if (!(file instanceof File)) throw new Error("Selecione um arquivo para enviar.");
    if (!KINDS.includes(kindValue)) throw new Error("Tipo de mídia inválido.");
    if (!["message", "template"].includes(target)) throw new Error("Destino inválido.");
    if (kindValue === "audio" && target === "template") {
      throw new Error("A Meta não aceita áudio como cabeçalho de template. Use texto, imagem, vídeo ou documento.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = validateMedia(kindValue, file.type || "", bytes.byteLength);

    let codecWarning: string | null = null;
    if (kindValue === "video") {
      const codecs = inspectMp4Codecs(bytes);
      if (codecs && (!codecs.h264 || !codecs.aac)) {
        codecWarning = "Não foi possível confirmar vídeo H.264 com áudio AAC. A Meta pode recusar o arquivo.";
      }
    }

    const supabase = adminClient();

    if (isTestMode()) {
      await supabase.from("message_audit_logs").insert({
        actor_id: null,
        operator_key: session.operatorKey,
        action: "whatsapp_media_upload_dry_run",
        metadata: { kind: kindValue, target, mime_type: mimeType, bytes: bytes.byteLength },
      });
      return json(request, { ok: true, dryRun: true, kind: kindValue, mimeType, bytes: bytes.byteLength, codecWarning, notice: "Modo de teste ativo. Nenhum arquivo foi enviado para a Meta." });
    }

    if (target === "template") {
      const handle = await uploadTemplateHeaderHandle(bytes, mimeType, file.name);
      await supabase.from("message_audit_logs").insert({
        actor_id: null,
        operator_key: session.operatorKey,
        action: "whatsapp_template_media_uploaded",
        metadata: { kind: kindValue, mime_type: mimeType, bytes: bytes.byteLength },
      });
      return json(request, { ok: true, dryRun: false, target, handle, kind: kindValue, mimeType, bytes: bytes.byteLength, fileName: file.name, codecWarning });
    }

    const mediaId = await uploadMediaToMeta(bytes, mimeType, file.name);
    await supabase.from("message_audit_logs").insert({
      actor_id: null,
      operator_key: session.operatorKey,
      action: "whatsapp_media_uploaded",
      metadata: { kind: kindValue, mime_type: mimeType, bytes: bytes.byteLength, media_id: mediaId },
    });
    return json(request, { ok: true, dryRun: false, target, mediaId, kind: kindValue, mimeType, bytes: bytes.byteLength, fileName: file.name, codecWarning });
  } catch (error) {
    return json(request, { ok: false, error: safeErrorMessage(error) }, 400);
  }
});
