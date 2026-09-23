/* Canal SMS Priner — lógica compartilhada do portal.
   Sem dependências externas: o público-alvo acessa em 3G/4G instável. */

(function () {
  'use strict';

  var cfg = null;

  /* ---------- utilidades ---------- */

  function buscar(caminho, obj) {
    return caminho.split('.').reduce(function (acc, parte) {
      return acc == null ? null : acc[parte];
    }, obj);
  }

  function pendente(valor) {
    return !valor || String(valor).indexOf('PENDENTE') !== -1;
  }

  function linkWhatsApp(numero, texto) {
    var digitos = String(numero).replace(/\D/g, '');
    // Canal só atende Brasil: 55 + DDD + número = 12 ou 13 dígitos. Se vier sem
    // o código do país, o wa.me abre uma conversa errada em vez de dar erro.
    if (digitos.length === 10 || digitos.length === 11) digitos = '55' + digitos;
    return 'https://wa.me/' + digitos + '?text=' + encodeURIComponent(texto);
  }

  function avisarPendente(el) {
    var desc = el.querySelector('.card__desc');
    if (desc) {
      desc.textContent = 'Link ainda não configurado. Avise a equipe de TI.';
      return;
    }
    if (el.nextElementSibling && el.nextElementSibling.classList.contains('status--erro')) return;
    var nota = document.createElement('p');
    nota.className = 'status status--erro';
    nota.textContent = 'Link ainda não configurado. Avise a equipe de TI.';
    el.parentNode.insertBefore(nota, el.nextSibling);
  }

  /* ---------- aplicação do config na página ---------- */

  function aplicar() {
    document.querySelectorAll('[data-cfg]').forEach(function (el) {
      var valor = buscar(el.getAttribute('data-cfg'), cfg);
      if (valor != null) el.textContent = valor;
    });

    document.querySelectorAll('[data-cfg-src]').forEach(function (el) {
      var valor = buscar(el.getAttribute('data-cfg-src'), cfg);
      if (valor) el.src = valor;
    });

    document.querySelectorAll('[data-cfg-href]').forEach(function (el) {
      var valor = buscar(el.getAttribute('data-cfg-href'), cfg);
      if (pendente(valor)) {
        // Link ainda não configurado: melhor avisar do que levar a um 404.
        el.setAttribute('aria-disabled', 'true');
        el.addEventListener('click', function (ev) {
          ev.preventDefault();
          avisarPendente(el);
        });
        return;
      }
      el.href = valor;
    });

  }

  /* ---------- formulários ---------- */

  function montarMensagem(form, protocolo) {
    var linhas = [form.getAttribute('data-abertura')];
    if (protocolo) linhas.push('Protocolo: ' + protocolo);
    linhas.push('');

    form.querySelectorAll('[data-rotulo]').forEach(function (campo) {
      if (campo.type === 'radio' && !campo.checked) return;
      var valor = (campo.value || '').trim();
      if (valor) linhas.push(campo.getAttribute('data-rotulo') + ': ' + valor);
    });

    return linhas.join('\n');
  }

  /* Crockford base32, sem I, L, O e U: quem dita o protocolo por rádio ou
     WhatsApp nunca precisa perguntar se é ó ou zero. */
  var ALFABETO_PROTOCOLO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function sorteio(chars) {
    var saida = '';
    var i;
    var origem = window.crypto || window.msCrypto;

    if (origem && origem.getRandomValues) {
      var bytes = new Uint8Array(chars);
      origem.getRandomValues(bytes);
      // 256 é múltiplo exato de 32, então o resto não favorece nenhuma letra.
      for (i = 0; i < chars; i++) saida += ALFABETO_PROTOCOLO[bytes[i] % 32];
      return saida;
    }

    /* Sem crypto (contexto não seguro, navegador antigo) o sorteio piora, mas
       nada aqui pode lançar: protocolo é comprovante, não pode barrar o relato. */
    for (i = 0; i < chars; i++) saida += ALFABETO_PROTOCOLO[Math.floor(Math.random() * 32)];
    return saida;
  }

  /* O protocolo nasce aqui, no envio, e não mais dentro do fluxo. Dois ganhos:
     a pessoa recebe o comprovante mesmo que o Power Automate demore, e o fluxo
     deixa de depender de uma expressão que falha calada — ele só grava o número
     que chegou. O rótulo vem de data-prefixo, um por formulário.

     Sai no formato EMG-260922-56WQ8E: data mais seis caracteres sorteados.
     A parte aleatória substituiu hora e milissegundos porque relógio não é
     identificador — dois aparelhos podem marcar o mesmo instante, e três
     chamadas no mesmo milissegundo devolviam o mesmo número. Com 32^6 combinações
     por dia, a chance de repetir em cinco anos fica em torno de uma em 470.

     O relógio ainda define a data, então o número é identificador, não prova de
     horário: quem manda no quando é o DataHoraEvento gravado pelo fluxo. */
  function gerarProtocolo(prefixo) {
    var agora = new Date();

    function pad(valor) {
      var texto = String(valor);
      return texto.length < 2 ? '0' + texto : texto;
    }

    return prefixo + '-' +
      pad(agora.getFullYear() % 100) + pad(agora.getMonth() + 1) + pad(agora.getDate()) +
      '-' + sorteio(6);
  }

  function coletarDados(form, protocolo) {
    var dados = {};
    if (protocolo) dados.protocolo = protocolo;
    form.querySelectorAll('[data-campo]').forEach(function (campo) {
      var nome = campo.getAttribute('data-campo');
      if (campo.type === 'radio') {
        if (campo.checked) dados[nome] = campo.value;
      } else {
        dados[nome] = (campo.value || '').trim();
      }
    });
    return dados;
  }

  function registrar(caminho, dados, form) {
    var corpo = { caminho: caminho, dados: dados };
    var tokenEl = form.querySelector('[name="cf-turnstile-response"]');
    if (tokenEl) corpo.turnstileToken = tokenEl.value;

    return fetch(cfg.registro.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)

    }).then(function (resp) {
      // O protocolo agora vai daqui para o fluxo, não o contrário. O corpo da
      // resposta deixou de importar: 200 já significa gravado.
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
    });
  }

  // data-wa-condicao="campo=valor": só encaminha ao WhatsApp se a pessoa pediu.
  function condicaoAtendida(form) {
    var regra = form.getAttribute('data-wa-condicao');
    if (!regra) return true;
    var partes = regra.split('=');
    var marcado = form.querySelector('[data-campo="' + partes[0] + '"]:checked');
    return !!marcado && marcado.value === partes[1];
  }

  /* Decide se este envio termina no WhatsApp. Precisa ser consultável antes e
     depois do registro: o que fazer quando o registro falha depende de existir
     ou não um segundo canal para a mensagem. */
  function vaiAoWhatsApp(form, destino) {
    var alvo = buscar('whatsapp.' + destino, cfg);
    if (!alvo || !alvo.numero) return false;
    return condicaoAtendida(form);
  }

  /* Um caminho só passa pelo /api/registrar se o fluxo dele existir. Sem a lista,
     os caminhos ainda sem fluxo mostrariam "não foi possível registrar" à toa. */
  function registroLigado(caminho) {
    var r = cfg.registro;
    if (!r || !r.habilitado) return false;
    if (Array.isArray(r.caminhos)) return r.caminhos.indexOf(caminho) !== -1;
    return true;
  }

  /* Sem fluxo, "só registrar" significa descartar o relato — não há para onde o
     registro ir. Enquanto o caminho não grava, o seletor some e o envio segue
     direto ao WhatsApp. Volta sozinho quando o caminho entrar em
     registro.caminhos, sem precisar mexer no HTML. */
  function ajustarSeletor(form, caminho) {
    var regra = form.getAttribute('data-wa-condicao');
    if (!regra || registroLigado(caminho)) return;

    var partes = regra.split('=');
    var opcoes = form.querySelectorAll('[data-campo="' + partes[0] + '"]');
    if (!opcoes.length) return;

    // Marcar a opção que leva ao WhatsApp também satisfaz o required do grupo,
    // que senão travaria o envio num campo escondido.
    opcoes.forEach(function (opcao) {
      opcao.checked = opcao.value === partes[1];
    });

    var campo = opcoes[0].closest('.campo');
    if (campo) campo.classList.add('oculto');
  }

  function ligarFormulario(form) {
    var caminho = form.getAttribute('data-caminho');
    var destino = form.getAttribute('data-wa-destino');
    var botao = form.querySelector('button[type="submit"]');
    var status = form.querySelector('.status');
    var rotuloBotao = botao ? botao.textContent : '';
    var protocolo = null;

    ajustarSeletor(form, caminho);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      // A partir daqui os campos podem mostrar erro. Antes da primeira tentativa
      // de envio, marcar campo inválido enquanto a pessoa digita é hostil.
      form.classList.add('form-validado');
      if (!form.reportValidity()) return;

      var registra = registroLigado(caminho);

      /* Um protocolo por formulário, não por tentativa. A Function corta o fluxo
         em 20 s e ele pode concluir depois: se a retentativa trouxesse um número
         novo, o mesmo evento viraria dois registros sem nada que os ligasse. */
      if (registra && !protocolo) {
        protocolo = gerarProtocolo(form.getAttribute('data-prefixo') || 'SMS');
      }

      if (botao) {
        botao.disabled = true;
        // Quem não grava não está "registrando": o rótulo original continua certo.
        if (registra) botao.textContent = 'Registrando…';
        botao.classList.add('botao--carregando');
      }
      if (status) { status.className = 'status'; status.textContent = ''; }

      var seguir = function (numero) {
        if (!vaiAoWhatsApp(form, destino)) {
          concluirSemWhatsApp(form, numero, status, botao, rotuloBotao);
          return;
        }

        var alvo = buscar('whatsapp.' + destino, cfg);
        var mensagem = montarMensagem(form, numero);

        /* Deixa o comprovante na tela antes de sair. No celular o WhatsApp abre
           por cima e a pessoa volta ao navegador achando o protocolo — sem isso
           ele só existiria dentro de uma mensagem que ela ainda pode não enviar. */
        if (numero) mostrarConfirmacao(form, numero, true);

        window.location.href = linkWhatsApp(alvo.numero, mensagem);
      };

      if (!registra) {
        seguir(null);
        return;
      }

      registrar(caminho, coletarDados(form, protocolo), form)
        .then(function () { seguir(protocolo); })
        .catch(function () {
          // Regra do projeto: falha de integração nunca bloqueia o atendimento.
          if (vaiAoWhatsApp(form, destino)) {
            if (status) {
              status.className = 'status status--erro';
              status.textContent = 'Não foi possível registrar automaticamente. ' +
                'Sua mensagem segue para o WhatsApp mesmo assim — descreva a situação por lá.';
            }
            setTimeout(function () { seguir(null); }, 2500);
            return;
          }

          /* Quem escolheu só registrar não tem segundo canal: mostrar a tela de
             confirmação aqui afirmaria um registro que não existe. O formulário
             fica de pé, preenchido, para a pessoa tentar de novo. */
          if (status) {
            status.className = 'status status--erro';
            status.textContent = 'Não foi possível registrar agora. Tente novamente em instantes ' +
              'ou escolha falar pelo WhatsApp para não perder o relato.';
          }
          // O token do Turnstile é de uso único: sem zerar o widget, a segunda
          // tentativa é recusada com o mesmo erro.
          if (window.turnstile) window.turnstile.reset();
          if (botao) {
            botao.disabled = false;
            botao.textContent = rotuloBotao;
            botao.classList.remove('botao--carregando');
          }
        });
    });
  }

  /* Troca o formulário pelo comprovante. `comConversa` diz se a pessoa ainda vai
     ao WhatsApp: os trechos marcados com data-so-registro só valem para quem
     encerrou no protocolo, e prometer contato a quem já vai falar é ruído. */
  function mostrarConfirmacao(form, protocolo, comConversa) {
    var confirmacao = document.getElementById('confirmacao');
    if (!confirmacao) return false;

    var prot = confirmacao.querySelector('[data-protocolo]');
    if (prot) prot.textContent = protocolo || '—';

    confirmacao.querySelectorAll('[data-so-registro]').forEach(function (el) {
      el.classList.toggle('oculto', !!comConversa);
    });

    form.classList.add('oculto');
    confirmacao.classList.remove('oculto');
    return true;
  }

  function concluirSemWhatsApp(form, protocolo, status, botao, rotuloBotao) {
    if (mostrarConfirmacao(form, protocolo, false)) {
      document.getElementById('confirmacao').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (status) status.textContent = 'Registro concluído. Obrigado.';
    if (botao) {
      botao.disabled = false;
      botao.textContent = rotuloBotao;
      botao.classList.remove('botao--carregando');
    }
  }

  /* ---------- grupos de opção que retraem ---------- */

  /* Depois de escolher, as opções somem e fica só a escolha, com uma seta para
     reabrir. Encurta o formulário sem esconder o que a pessoa respondeu. */
  function ligarRetratil(grupo) {
    var campo = grupo.closest('.campo');
    var resumo = campo && campo.querySelector('[data-resumo]');
    if (!resumo) return;

    var valor = resumo.querySelector('.resumo__valor');

    function abrir() {
      grupo.classList.remove('oculto');
      resumo.classList.add('oculto');
      resumo.setAttribute('aria-expanded', 'true');
      var marcado = grupo.querySelector('input:checked') || grupo.querySelector('input');
      if (marcado) marcado.focus();
    }

    function fechar(escolha) {
      valor.textContent = escolha;
      grupo.classList.add('oculto');
      resumo.classList.remove('oculto');
      resumo.setAttribute('aria-expanded', 'false');
    }

    grupo.addEventListener('change', function (ev) {
      if (ev.target.checked) fechar(ev.target.value);
    });

    resumo.addEventListener('click', abrir);
  }

  /* ---------- Turnstile ---------- */

  /* O widget é injetado por aqui, e não escrito no HTML, para a site key morar
     só no config e o portal não quebrar enquanto ela não existir. */
  function ligarTurnstile() {
    var t = cfg.turnstile;
    if (!t || !t.habilitado || !t.siteKey) return;

    // Só nos formulários que realmente chamam a API. Nos demais o widget seria
    // um script externo carregado à toa, com erro no console e nada a proteger.
    var formularios = [].filter.call(
      document.querySelectorAll('form[data-caminho]'),
      function (form) { return registroLigado(form.getAttribute('data-caminho')); });
    if (!formularios.length) return;

    formularios.forEach(function (form) {
      var botao = form.querySelector('button[type="submit"]');
      if (!botao) return;
      var caixa = document.createElement('div');
      caixa.className = 'cf-turnstile turnstile';
      caixa.setAttribute('data-sitekey', t.siteKey);
      caixa.setAttribute('data-appearance', 'interaction-only');
      caixa.setAttribute('data-language', 'pt-br');
      form.insertBefore(caixa, botao);
    });

    var script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  function iniciar() {
    document.querySelectorAll('form[data-caminho]').forEach(ligarFormulario);
    document.querySelectorAll('.opcoes[data-retrair]').forEach(ligarRetratil);
    ligarTurnstile();
  }

  fetch('content/config.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (json) {
      cfg = json;
      aplicar();
      document.documentElement.classList.add('cfg-pronto');
      iniciar();
    })
    .catch(function () {
      // Mesmo na falha: nada pode ficar preso em opacity 0 esperando o config.
      document.documentElement.classList.add('cfg-pronto');
      var alvo = document.querySelector('.container');
      if (!alvo) return;
      var erro = document.createElement('div');
      erro.className = 'aviso';
      erro.innerHTML = '<p class="aviso__titulo">Portal indisponível</p>' +
        '<p>Não foi possível carregar as configurações do canal. ' +
        'Tente novamente em instantes ou procure a equipe de SMS da sua unidade.</p>';
      alvo.prepend(erro);
    });
})();
