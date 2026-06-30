# Halex Istar CRM

CRM para gestão de clientes privados, ciclos de recompra e geração automática de cotações.

## Primeira configuração

1. Crie um projeto Supabase separado do Lumina Licita.
2. Execute `supabase/crm-schema.sql` no SQL Editor.
3. Configure as variáveis descritas em `.env.example`.
4. Envie o papel timbrado em **Administração > Papel timbrado**.

## Desenvolvimento

```bash
npm install
npm run dev
```

Sem credenciais Supabase, o ambiente de desenvolvimento abre em modo de prévia com clientes e produtos de demonstração. Produção continua exigindo autenticação.

## Módulos iniciais

- Carteira de clientes privados
- Previsão de recompra por ciclo histórico
- Agenda de contatos e retornos
- Catálogo e tabela comercial
- Gerador de cotação com cliente e produtos
- Documento pronto para impressão/PDF
- Configuração futura do papel timbrado Halex Istar
- Importação de clientes por Excel/CSV com sincronização pelo código
- Tabelas de preços versionadas, com troca e restauração de versões anteriores
- Papel timbrado PNG/JPG aplicado diretamente à cotação e ao PDF
