# Publicação do Lumina Prisma

## Gerar o instalador

1. Atualize a versão: `npm version patch` (ou `minor`/`major`).
2. Execute `npm run desktop:installer`.
3. O instalador e o arquivo `latest.yml` serão gerados em `release/`.

## Publicar uma atualização automática

O atualizador usa as GitHub Releases públicas de `danielcarvalho428-cyber/halex-istar-crm-releases`; nunca coloque um token do GitHub dentro do aplicativo do cliente.

1. Configure `GH_TOKEN` somente na máquina de publicação ou no GitHub Actions.
2. Execute `npm run desktop:release`.
3. Confirme que a release contém o instalador `.exe`, o `.blockmap` e `latest.yml`.

Os aplicativos instalados verificam novas versões oito segundos depois de abrir e novamente a cada seis horas. O cliente escolhe quando baixar e instalar. O banco SQLite e demais dados ficam em `%APPDATA%/halex-istar-crm`, fora da pasta substituída pelo instalador.

## Assinatura do Windows

Enquanto não houver certificado Authenticode, o Windows poderá mostrar “Editor desconhecido”. Depois de comprar o certificado, configure `CSC_LINK` e `CSC_KEY_PASSWORD` no ambiente de publicação; não salve o certificado nem a senha no repositório.

## macOS sem assinatura

O workflow **Build macOS installers** gera instaladores para Macs Intel (`x64`) e Apple Silicon (`arm64`) sem exigir um Mac local. Ele pode ser iniciado manualmente na aba **Actions** do GitHub ou automaticamente ao publicar uma tag `v*`.

1. Abra **Actions > Build macOS installers > Run workflow**.
2. Quando o processo terminar, abra a execução e baixe o artefato **Lumina-Prisma-macOS**.
3. Distribua o `.dmg` correspondente: `arm64` para Macs com chips Apple e `x64` para Macs Intel.

Como o aplicativo ainda não é assinado ou notarizado, o macOS exibirá um aviso na primeira abertura:

1. Arraste **Lumina Prisma** para **Aplicativos**.
2. No Finder, abra **Aplicativos**, clique no aplicativo com o botão direito (ou Control + clique) e escolha **Abrir**.
3. Confirme **Abrir**. Se essa opção não aparecer, acesse **Ajustes do Sistema > Privacidade e Segurança** e escolha **Abrir Mesmo Assim**.

Se o macOS disser que o aplicativo está “danificado” mesmo após a confirmação, remova apenas a quarentena deste aplicativo pelo Terminal:

```bash
xattr -dr com.apple.quarantine "/Applications/Lumina Prisma.app"
```

Baixe o aplicativo somente da distribuição oficial. Não é necessário desativar o Gatekeeper globalmente. As atualizações automáticas ficam desativadas no macOS até que exista assinatura; instale uma nova versão baixando o DMG mais recente. Os dados locais permanecem na pasta de usuário do macOS.
