# Status - 2026-10-09

## Problema
Conta1 (`snorlax.sonolento`) parou de postar por volta das 17:00 UTC.
Causa: o Page Access Token usado pelo GitHub Actions (secret `PAGE_TOKEN_conta1`)
ficou invalido - toda chamada na Graph API, ate um `/me` simples, retornava:

    OAuthException code 200: "Cannot call API for app 2202672190681648 on behalf of user 122120753295306511"

O app "Snorlax sonolento" (id 2202672190681648) continua em Modo: Em
desenvolvimento no Meta for Developers e o usuario (Pedro Pontes Gomes,
id 122120753295306511) continua com papel/role no app - nao foi isso.
O token antigo simplesmente parou de funcionar.

## O que ja foi feito
1. Gerado um novo User Access Token de curta duracao via Graph API Explorer
   (app Snorlax sonolento), com as permissoes: pages_show_list,
   business_management, instagram_basic, instagram_content_publish,
   pages_read_engagement.
2. Trocado por um User Access Token de longa duracao (`oauth/access_token`
   com `grant_type=fb_exchange_token`, usando `segredos/app_secret.txt`).
3. Usado esse token longo em `/me/accounts` para pegar o Page Access Token
   da pagina "Snorlax sonolento pagina" (id 1353848897816332).
4. Testado: `expires_at: 0` (nao expira), `is_valid: true`, escopos corretos
   incluindo `instagram_content_publish`. Testado tambem contra
   `/17841423072714843` (conta IG) - respondeu certo.
5. Token novo salvo em `segredos/conta1_page_token.txt` (local, nao vai pro
   git - esta no .gitignore).

## O que falta (proximo passo ao chegar em casa)
1. Copiar o conteudo de `segredos/conta1_page_token.txt` (ja atualizado
   neste computador) e colar no GitHub:
   Settings -> Secrets and variables -> Actions -> `PAGE_TOKEN_conta1` -> Update.
   (O valor em si NAO esta neste commit por seguranca - pegar do arquivo local.)
2. Rodar o workflow manualmente (Actions -> "Postar video automatico" ->
   Run workflow -> conta: conta1) ou esperar o proximo disparo do cron-job.org.
3. Conferir `postar.log` (puxar `git pull` depois) pra confirmar que
   `video_858` postou sem erro.

## Pendencia separada (nao urgente)
Conta2 ainda nao foi ativada - ver `contas/conta2/LEIA-ME.txt`.
