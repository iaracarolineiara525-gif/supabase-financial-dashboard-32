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
