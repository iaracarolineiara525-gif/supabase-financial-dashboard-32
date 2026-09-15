alter table public.message_conversations
  add column if not exists origin_list text,
  add column if not exists last_template_name text;

alter table public.message_conversation_messages
  add column if not exists template_name text,
  add column if not exists media_id text,
  add column if not exists media_mime_type text,
  add column if not exists media_sha256 text,
  add column if not exists media_storage_path text,
  add column if not exists media_caption text,
  add column if not exists media_duration integer,
  add column if not exists transcription text,
  add column if not exists processing_status text not null default 'none';

insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 16777216)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "whatsapp media service role only" on storage.objects;
create policy "whatsapp media service role only"
  on storage.objects for all
  to service_role
  using (bucket_id = 'whatsapp-media')
  with check (bucket_id = 'whatsapp-media');
