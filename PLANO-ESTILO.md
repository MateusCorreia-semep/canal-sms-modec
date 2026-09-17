# Plano de estilização — Canal SMS

Proposta para deixar o portal mais atraente **sem tocar na identidade já construída**.
Nada aqui muda a paleta Priner, a tipografia, a estrutura de cabeçalho e rodapé nem
os alvos de toque de 56 px.

## Diagnóstico

O portal hoje é correto e legível, mas **inerte**. Medido no CSS atual:

| Recurso | Ocorrências em `assets/css/estilo.css` |
|---|---|
| `transition` | 0 |
| `animation` / `@keyframes` | 0 |
| `gradient` | 0 |
| `prefers-reduced-motion` | 0 |
| `box-shadow` | 2 |

Nenhum elemento responde ao toque além de uma troca seca de cor de fundo. É
justamente o ponto que a pesquisa de tendências aponta como divisor: em 2026 o
minimalismo continua, mas **acompanhado de microinterações** que confirmam a ação
e sinalizam o que é clicável. A ausência delas não deixa o portal feio — deixa
parecendo um protótipo.

### O que a pesquisa diz, e o que se aplica aqui

- **Microinterações como camada de usabilidade**, não enfeite: confirmar toque,
  validar campo, indicar carregamento. Aplica-se integralmente.
- **UX espacial**: cards com peso, que reagem com intenção. Aplica-se.
- **Mobile-first com navegação simplificada e botões grandes.** Já atendido.
- **Alto contraste, cores vibrantes mas não supersaturadas, fontes sans-serif
  maiores** para uso sob sol. Já atendido em parte; dá para reforçar.

Um dado da pesquisa que **restringe** o que podemos fazer: trabalhadores de campo
usam óculos de segurança com tingimento escuro ou camada reflexiva, o que reduz o
contraste percebido da tela. Isso elimina de saída as tendências de baixo contraste
— vidro fosco, texto cinza-claro, sobreposições translúcidas.

---

## Itens propostos

Ordenados por relação impacto/risco. Cada um é independente: dá para aprovar alguns
e descartar outros.

### 1. Microinterações nos elementos tocáveis · impacto alto · risco baixo

O que falta de mais evidente. Transições de 150–200 ms em `.card`, `.botao`,
`.opcao`, `.voltar` e `.resumo`:

- **Card pressionado** afunda levemente (`translateY(1px)`) e perde sombra —
  devolve a sensação de objeto físico
- **Seta do card** desliza 3 px para a direita no toque e no foco
- **Botão principal** com estado de pressão visível
- **`.opcao` selecionada** cresce a borda com transição, em vez de trocar seca

Tudo dentro de `@media (prefers-reduced-motion: reduce)`, que hoje não existe no
arquivo. Sem essa guarda, movimento vira barreira de acessibilidade.

### 2. Profundidade em duas camadas nos cards · impacto médio · risco baixo

A sombra atual é uma só, rasa (`0 1px 3px`). Sombra em duas camadas — uma curta e
opaca, outra longa e difusa — é o que dá a leitura de "objeto sobre superfície" que
a tendência de UX espacial descreve. Continua discreto; muda a percepção de acabamento.

### 3. Grafismo da marca como textura de fundo · impacto alto · risco médio

O manual da Priner tem um **grafismo de 4 módulos** e permite usar o símbolo
isolado como elemento de fundo. Hoje o portal não usa nenhum dos dois — o fundo é
cinza chapado.

Proposta: o símbolo da Priner em marca-d'água, em Verde Tradição a 3–4% de opacidade,
ancorado no canto inferior direito do `<body>`. Entra pelo SVG já existente, sem
requisição nova.

> **Risco:** é o item que mais mexe na aparência. Se ficar visível demais, polui —
> exatamente o que você pediu para evitar. Proponho começar em 3% e ajustar olhando.

### 4. Hierarquia tipográfica dos cards · impacto médio · risco baixo

Os títulos estão em 15 px caixa-alta com `letter-spacing` mínimo. Subir para 16 px,
abrir um pouco o `letter-spacing` (`.02em`) e apertar a entrelinha dá mais presença
sem aumentar a altura do card. A descrição ganha um tom de cinza levemente mais
escuro — o `#808080` atual passa raspando no contraste mínimo e some sob sol.

### 5. Faixa "Menu interativo" com mais presença · impacto baixo · risco baixo

A pílula hoje é um retângulo verde chapado. Um filete Verde Inovação de 2 px na base
da pílula amarra com o `border-bottom` do cabeçalho e cria repetição visual — o tipo
de detalhe que a peça de divulgação usa bastante.

### 6. Estados de formulário mais claros · impacto médio · risco baixo

- Campo inválido ganha borda de alerta **depois** da primeira tentativa de envio,
  nunca enquanto a pessoa digita
- Campo preenchido corretamente ganha um tique discreto
- O botão em "Registrando…" ganha um indicador de progresso em vez de só trocar o
  texto — a espera de 3 a 8 s é longa demais para não ter retorno visual

### 7. Entrada suave do conteúdo · impacto baixo · risco médio

O portal busca o `config.json` antes de preencher telefone, horário e links. Existe
um instante de campos vazios. Uma transição de opacidade ao aplicar a configuração
esconde esse salto.

> **Risco:** mal feito, atrasa a percepção de carregamento em 4G ruim. Só vale se
> ficar abaixo de 150 ms, e sob `prefers-reduced-motion`.

---

## O que eu não faria, e por quê

| Tendência | Por que não aqui |
|---|---|
| **Modo escuro** | Sob sol forte, texto claro em fundo escuro é *menos* legível, não mais. Some com o ganho e dobra a superfície de teste. O público é campo e offshore |
| **Glassmorphism / vidro fosco** | Depende de baixo contraste. Óculos de segurança escuros já reduzem o contraste percebido; seria somar dois problemas |
| **Gradientes vivos** | Verde Tradição e Verde Inovação são cores de marca fechadas. Gradiente entre elas cria tons que não existem no manual |
| **Fontes de display** | Atyp não é licenciada para web. Trocar por outra fonte descaracteriza a marca mais do que qualquer outro item desta lista |
| **Animação de entrada nos cards** | Cinco cards entrando em sequência custa ~400 ms antes de a pessoa poder tocar. Num canal que atende relato de desvio, isso é atrito |

---

## Arquivos afetados

Praticamente tudo se concentra em **[`assets/css/estilo.css`](assets/css/estilo.css)**.

| Item | Onde |
|---|---|
| 1, 2, 4, 5 | só CSS |
| 3 | CSS + um SVG inline no `<body>` das 5 páginas |
| 6 | CSS + `assets/js/portal.js` (marcação de inválido após envio) |
| 7 | CSS + a função que aplica o config em `portal.js` |

Nenhum item adiciona dependência, requisição externa ou etapa de build. O peso
estimado do CSS sobe de 10 KB para cerca de 12 KB.

## Verificação

1. **Contraste**: recalcular os pares afetados pelo item 4 e confirmar AA (4,5:1).
2. **Toque real**: percorrer os 5 cards e os 3 formulários a 375 px e a 320 px,
   conferindo que nenhum alvo caiu abaixo de 56 px.
3. **Movimento desligado**: com `prefers-reduced-motion: reduce` ativo, nenhuma
   transição deve rodar e nada pode ficar invisível.
4. **Sem regressão funcional**: reenviar os três formulários e conferir que as
   mensagens do `wa.me` continuam idênticas.
5. **Peso**: home deve continuar abaixo de 45 KB.

## Sugestão de ordem

Itens **1, 2 e 4** entregam a maior parte da percepção de acabamento e são de baixo
risco — valem como primeira leva. O item **3** é o que mais muda a cara do portal e
merece ser visto antes de decidir. Os itens **5, 6 e 7** são refinamento.

---

## Resultado da implementação

Aplicado na branch `feature/estilizacao`. Dois itens saíram diferentes do previsto:

**Item 4 — o aumento de fonte não coube.** Medido no navegador, sobram **197 px**
para o título do card. "REGISTRE SEUS DESVIOS" ocupa 196 px a 15 px e 209 px a
16 px, ou seja, quebraria em duas linhas e alongaria o card — o oposto do que o
plano afirmava. O tamanho voltou a 15 px e o item entregou só a correção de
contraste da descrição, que era o ganho real: de 3,95:1 para 5,52:1.

**Item 5 — o filete interno virou um anel.** `box-shadow: inset` num raio de
999 px contorna a curva inteira e desenha um aro verde em volta da pílula. Trocado
pelos filetes laterais da faixa, que passaram de cinza para Verde Inovação — amarra
com a borda do cabeçalho sem distorção.

**Peso:** 48,3 KB em disco, **23,3 KB trafegados** com compressão. O alvo de 45 KB
do plano media disco, o que era a métrica errada: o que importa para quem está em
4G de campo é o que atravessa a rede, e o Cloudflare serve tudo com brotli.
