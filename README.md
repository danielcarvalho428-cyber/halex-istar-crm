# Lumina Prisma

CRM desktop para gestão de clientes privados, ciclos comerciais, faturamento e geração de cotações.

## Primeira configuração

1. Instale o aplicativo desktop.
2. Ative a licença.
3. Importe a lista de clientes e a tabela comercial.
4. Configure o papel timbrado e, se necessário, o envio por Gmail.
5. Crie um backup local depois da configuração inicial.

Os dados operacionais ficam no computador. Firebase é usado somente para licenciamento e GitHub Releases para atualizações do Windows.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Verificação

```bash
npm run check
```

## Módulos principais

- Carteira de clientes privados
- Previsão de recompra por ciclo histórico
- Agenda de contatos e retornos
- Catálogo e tabela comercial
- Acordos e preços especiais
- Gerador de cotação e PDF
- Acompanhamento de faturamento e DANFEs
- Importação de clientes por Excel/CSV
- Backup e restauração local
