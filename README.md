# V4 — Plataforma de Mensagens

A V4 é uma interface de operação controlada para mensagens por API oficial, campanhas e contatos consentidos. O sistema foi desenhado para manter as credenciais no servidor, exigir revisão antes do envio e bloquear contatos descadastrados ou sem consentimento.

## Escopo atual

O dashboard autenticado contém as seguintes áreas:

| Área | O que está disponível |
|---|---|
| **Visão geral** | Saúde da operação, campanhas recentes, volume, fila e alertas. |
| **Mensagem via API** | Provedor, ambiente Sandbox/Produção, endpoint, Phone Number ID, token mascarado, teste demonstrativo e checklist de segurança. |
| **Disparo** | Campanha em rascunho, mensagem com variáveis, contador, público, velocidade, dry run e prévia em celular. |
| **Lista com nomes** | Busca, filtros, seleção em lote, consentimento, grupos, importação CSV/XLSX, exportação e paginação. |

A interface atual usa dados fictícios e ações demonstrativas. Nenhuma mensagem real é enviada sem a implementação do backend, as credenciais seguras e uma confirmação explícita do administrador.

## Próxima etapa para produção

Para ativar a API oficial, o backend deverá receber as credenciais por variáveis de ambiente ou secrets, implementar o adaptador do provedor, fila assíncrona, limites, retentativas, idempotência, webhooks autenticados, logs de status, auditoria, descadastro e controle de permissões. O frontend não deve receber tokens nem executar loops de disparo.

Antes do primeiro envio real, valide o provedor, os templates aprovados, o opt-in, a lista de supressão, os limites da conta e as regras vigentes na documentação oficial da [WhatsApp Business Platform](https://developers.facebook.com/docs/whatsapp/cloud-api/).

## Como editar

O projeto está conectado ao Lovable e ao GitHub. Alterações enviadas para a branch `main` podem ser refletidas no projeto Lovable conectado. Também é possível editar pelo Lovable, por uma IDE local ou diretamente no GitHub.

```sh
git clone <URL_DO_REPOSITORIO>
cd supabase-financial-dashboard-32
npm install
npm run dev
```

## Tecnologias

O projeto usa Vite, React, TypeScript, shadcn/ui, Tailwind CSS, React Router e Supabase para autenticação e integração futura do backend.

## Validação

```sh
npm run build
```

O build deve ser executado antes de cada publicação. Nunca coloque tokens, secrets ou credenciais reais no repositório.

## Backend da Meta

A integração server-side fica em `supabase/functions/`. A função `meta-health` valida o acesso ao Phone Number ID e à WABA sem enviar mensagens. A função `meta-send` exige autenticação, valida o telefone em E.164, bloqueia a lista de supressão, evita duplicidade por idempotência e permanece em dry run enquanto `META_TEST_MODE=true`. A função `meta-webhook` responde ao desafio da Meta, valida `X-Hub-Signature-256`, deduplica eventos e atualiza os status de mensagens.

Depois de publicar as funções, a URL de callback da Meta deverá apontar para a URL HTTPS real da função `meta-webhook`. Não use o domínio do frontend como webhook se ele apenas retornar o HTML da SPA.

### Publicação segura

1. Aplique a migração `supabase/migrations/20260825193000_messaging_platform.sql` no projeto Supabase.
2. Configure os valores de `.env.example` como secrets server-side. Nunca os coloque em `VITE_*` nem os commite.
3. Publique `meta-health`, `meta-send` e `meta-webhook`.
4. Teste o `GET` do webhook com o verify token e depois valide um `POST` assinado de teste.
5. Mantenha `META_TEST_MODE=true` durante a homologação. Só altere para `false` depois de revisar consentimento, templates, fila, limites, auditoria e o número destinatário.

A interface atual não executa envio real automaticamente. A liberação de produção deve ser feita somente após uma confirmação explícita do administrador.
