# Canal SMS — Contrato MODEC

Portal redirecionador do Canal de SMS da Priner. HTML, CSS e JavaScript puros,
sem framework e sem etapa de build. Hospedagem no **Cloudflare Pages**.

O colaborador chega por link ou QR code, escolhe uma das cinco opções e é levado
ao destino: uma conversa no WhatsApp da equipe ou o material na pasta do OneDrive.
Nos caminhos que exigem rastro, o portal registra antes de encaminhar.

## Por que é um portal, e não um chatbot

O projeto nasceu como chatbot de WhatsApp com WAHA e máquina de estados no Power
Automate. Foi trocado porque o WAHA usa a API não oficial do WhatsApp Web — sem
SLA, com risco real de bloqueio do número — e dependia de um container rodando
numa máquina local.

O que se perdeu na troca, conscientemente:

- **Envio proativo do DDS.** O portal é 100% *pull*: o colaborador acessa quando quer.
- **Correlação da conversa pelo telefone.** O vínculo passou a ser o número de protocolo.

## Arquitetura

```
Colaborador                Cloudflare Pages              Microsoft 365
    │                            │                            │
    │  abre o link / QR          │                            │
    ├───────────────────────────>│                            │
    │                            │                            │
    │  DDS e Ações pela Vida ─────────────────────────────────>│  pasta do OneDrive
    │                            │                            │  (link "qualquer pessoa")
    │  formulário de desvio      │                            │
    ├───────────────────────────>│ /api/registrar             │
    │                            │  (Pages Function)          │
    │                            ├───────────────────────────>│  Power Automate
    │                            │  x-canal-sms-token         │      ↓
    │                            │<───────────────────────────┤  lista do SharePoint
    │  redireciona com protocolo │  { protocolo }             │  + card no Teams
    │<───────────────────────────┤                            │
    │                            │                            │
    └──> wa.me com a mensagem pronta ────────────────────────> WhatsApp da equipe
```

**Por que existe uma Pages Function no meio.** Chamar o Power Automate direto do
navegador não funciona e não é seguro: o gatilho HTTP não devolve cabeçalhos CORS,
e a URL do gatilho carrega a assinatura `sig=` no próprio link — no código da
página, ficaria pública. A Function roda no mesmo domínio (sem CORS), guarda a URL
como *secret* e é o único ponto exposto.

## As cinco opções

| Card | Destino | Registra? |
|---|---|---|
| Registre seus desvios | `emergencia.html` → WhatsApp do SMS | **Sim** — lista `Emergencias` |
| Fale com a saúde | `saude-mental.html` → WhatsApp da enfermagem | Não, por decisão de projeto |
| Fale com o time da segurança | `atendimento.html` → WhatsApp do SMS | Ainda não — fluxo pendente |
| DDS | Pasta do OneDrive | — |
| Ações pela Vida | `acoes-pela-vida.html` → pasta do OneDrive | — |

**Saúde mental não grava nada.** O check-in vai direto para a conversa com a
enfermagem; não há lista, protocolo nem histórico no portal. Foi decisão
deliberada, e os textos da página dizem isso ao colaborador.

## Estrutura

```
canal-sms-modec/
├── index.html                  menu das 5 opções, ícones SVG e faixa de selos
├── emergencia.html             formulário de desvio  → registra → WhatsApp
├── atendimento.html            formulário de contato → WhatsApp
├── saude-mental.html           check-in de bem-estar → WhatsApp
├── acoes-pela-vida.html        aponta para o material no OneDrive
├── content/config.json         ← tudo que a operação precisa mexer
├── functions/api/registrar.js  Pages Function: ponte para o Power Automate
├── assets/css/estilo.css       identidade Priner, mobile-first
├── assets/js/portal.js         config, formulários, Turnstile, grupos retráteis
├── assets/img/                 logo, ícones e card de compartilhamento
└── _headers                    CSP e cabeçalhos de segurança
```

## Onde se mexe no conteúdo

**Tudo que a operação altera está em [`content/config.json`](content/config.json).**
Não é preciso abrir HTML para trocar número de WhatsApp, link de pasta ou horário
de atendimento.

| Chave | Para quê |
|---|---|
| `whatsapp.sms` / `whatsapp.enfermagem` | Destinos. Formato `55` + DDD + número, só dígitos |
| `materiais.dds` / `materiais.acoes` | Links das pastas do OneDrive |
| `janelaAtendimento` | Linha do rodapé |
| `registro.caminhos` | Quais caminhos gravam no SharePoint |
| `turnstile.siteKey` | Chave **pública** do captcha |
| `versao` | Aparece no rodapé |

> O `config.json` é servido publicamente — qualquer um abre pela URL. **Nunca**
> coloque ali URL de fluxo, token ou qualquer segredo.

Um link ainda não configurado (contendo `PENDENTE`) não vira link quebrado: o card
avisa "Link ainda não configurado" em vez de levar a um 404.

## Como o registro funciona

Só os caminhos listados em `registro.caminhos` passam pela API. Os demais montam a
mensagem e vão direto ao WhatsApp — sem chamada, sem espera e sem mensagem de erro.

1. O colaborador envia o formulário.
2. O portal chama `POST /api/registrar` com `{ caminho, dados, turnstileToken }`.
3. A Function valida o Turnstile, injeta o `FLOW_TOKEN` e chama o fluxo.
4. O fluxo grava na lista, notifica o Teams e devolve `{ "protocolo": "EMG-…" }`.
5. O portal mostra o protocolo e redireciona ao WhatsApp com ele na mensagem.

**Falha nunca bloqueia o atendimento.** Se a Function ou o fluxo caírem, o portal
avisa que não foi possível registrar e **segue para o WhatsApp mesmo assim**, sem
protocolo. Perder o registro é ruim; impedir alguém de comunicar um desvio é pior.

### Campos por caminho

| `caminho` | Campos enviados | Lista |
|---|---|---|
| `EMERGENCIA` | `nome`, `matricula`, `local`, `tipo`, `descricao` | `Emergencias` |
| `ATENDIMENTO` | `nome`, `matricula`, `setor`, `funcao`, `assunto` | `AtendimentosSMS` |
| `SAUDE` | `sentimento`, `comentario`, `nome` | não grava |

Campos vazios não são enviados — a Function os remove. O esquema do gatilho no
Power Automate não pode marcá-los como obrigatórios.

### Respostas de erro da Function

Úteis para diagnosticar pela aba Network do navegador:

| Resposta | Significa |
|---|---|
| `turnstile_nao_configurado` (503) | `TURNSTILE_SECRET` não chegou ao ambiente |
| `verificacao_falhou` (403) | Token do Turnstile inválido — geralmente hostname fora da lista |
| `caminho_invalido` (400) | `caminho` não é `EMERGENCIA`, `ATENDIMENTO` ou `SAUDE` |
| `fluxo_nao_configurado` (503) | Falta a `FLOW_URL_…` do caminho |
| `fluxo_recusou` (502) | O fluxo respondeu erro — quase sempre `FLOW_TOKEN` divergente |
| `fluxo_indisponivel` (504) | O fluxo passou de 20 s |

## Variáveis de ambiente

Em **Pages → Settings → Environment variables**, todas como *Secret* e no ambiente
de **Production** (as de Preview não valem para produção):

| Variável | Conteúdo |
|---|---|
| `FLOW_URL_EMERGENCIA` | URL do gatilho HTTP do fluxo de desvios |
| `FLOW_URL_ATENDIMENTO` | idem, quando o fluxo existir |
| `FLOW_URL_SAUDE` | não usado: saúde mental não grava |
| `FLOW_TOKEN` | segredo compartilhado, conferido pelo fluxo no cabeçalho `x-canal-sms-token` |
| `TURNSTILE_SECRET` | chave secreta do Turnstile |

**A Function falha fechada:** sem `TURNSTILE_SECRET` ela recusa em vez de aceitar.
É deliberado — uma variável esquecida não pode deixar o `/api/registrar` aberto a
qualquer POST da internet.

## Segurança

| Proteção | Onde |
|---|---|
| Segredos fora do navegador | Function guarda a URL do fluxo; a página nunca a vê |
| CSP fechada | `default-src 'self'`; só `challenges.cloudflare.com` liberado, para o Turnstile |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| Captcha | Turnstile, injetado só nos formulários que chamam a API |
| Cadeia de dependências | Zero bibliotecas, zero CDN, zero `npm install` |
| Permissões do navegador | GPS, câmera e microfone bloqueados por `Permissions-Policy` |

Pontos de atenção que dependem de processo, não de código: quem tem acesso ao
deploy pode trocar o número de destino do WhatsApp sem que a página mude de
aparência; os links do OneDrive são públicos de verdade; e nome e matrícula são
texto livre, sem validação contra o RH.

## Rodar localmente

```bash
python -m http.server 8080 --directory .
```

```bash
npx wrangler pages dev .
```

O `http.server` serve as páginas mas **não executa Pages Functions** — o registro
sempre cairá no fallback. Para testar a Function, use o `wrangler`.

Abrir os arquivos com duplo clique (`file://`) não funciona: o `fetch` do
`config.json` é bloqueado.

O Turnstile recusa `localhost` com erro `110200` no console, a menos que você
acrescente `localhost` aos hostnames do widget no painel do Cloudflare.

## Publicar

```bash
git push origin main
```

```bash
npx wrangler pages deploy .
```

## Convenções

- **Mobile-first.** O público é campo e offshore, em 4G instável: home em torno de
  42 KB, alvos de toque de 56 px, alto contraste para uso com luva e sob sol.
- **Identidade Priner.** Verde Tradição `#0B514F`, Verde Inovação `#97D700`,
  Arial (a Atyp não é licenciada para web). O `#97D700` vem do arquivo oficial da
  logo e corresponde ao Pantone 375C.
- **Cabeçalho e rodapé idênticos nas 5 páginas** — 62 px e 173 px. Qualquer
  alteração deve ser feita em todas, senão a estrutura "pula" ao navegar.
- **Sem dependências.** Nada de framework, CDN ou pacote npm.

## Pendências

| ID | O que falta |
|---|---|
| WA-01 | Número oficial do WhatsApp da equipe SMS — hoje há um de teste |
| WA-03 | Texto oficial das 10 Ações pela Vida; a página aponta para a pasta |
| WA-06 | Validar com a equipe SMS os campos dos formulários |
| WA-07 | Retenção e descarte dos dados (LGPD) |
| WA-08 | Quem mantém a pasta do DDS atualizada |
| — | Fluxos de `ATENDIMENTO` e o domínio `canalsms.priner.com.br` |
| — | Separar as pastas de DDS e Ações pela Vida, hoje apontando para a mesma |
| — | `og:url` e `og:image` usam `canal-sms-modec.pages.dev`; trocar ao mudar de domínio |
| — | `telefoneEmergencia` ficou órfão no config após a remoção do aviso de resgate |
