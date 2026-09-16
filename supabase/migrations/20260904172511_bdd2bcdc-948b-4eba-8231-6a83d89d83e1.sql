ALTER TABLE public.message_conversation_messages
  ADD COLUMN IF NOT EXISTS media_id text,
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_sha256 text,
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_caption text,
  ADD COLUMN IF NOT EXISTS media_duration integer,
  ADD COLUMN IF NOT EXISTS transcription text,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'none';

CREATE UNIQUE INDEX IF NOT EXISTS message_conversation_messages_external_id_key
  ON public.message_conversation_messages (external_id)
  WHERE external_id IS NOT NULL;

CREATE POLICY "whatsapp media service role only"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'whatsapp-media')
  WITH CHECK (bucket_id = 'whatsapp-media');