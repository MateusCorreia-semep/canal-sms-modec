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

    // Cards que vão direto ao WhatsApp, sem formulário.
    document.querySelectorAll('[data-wa-direto]').forEach(function (el) {
      var alvo = buscar('whatsapp.' + el.getAttribute('data-wa-destino'), cfg);
      if (!alvo || !alvo.numero) {
        el.setAttribute('aria-disabled', 'true');
        return;
      }
      el.href = linkWhatsApp(alvo.numero, el.getAttribute('data-wa-direto'));
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

  function coletarDados(form) {
    var dados = {};
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

  function registrar(caminho, dados) {
    var corpo = { caminho: caminho, dados: dados };
    var tokenEl = document.querySelector('[name="cf-turnstile-response"]');
    if (tokenEl) corpo.turnstileToken = tokenEl.value;

    return fetch(cfg.registro.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).then(function (json) {
      return json.protocolo || null;
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

  function ligarFormulario(form) {
    var caminho = form.getAttribute('data-caminho');
    var destino = form.getAttribute('data-wa-destino');
    var botao = form.querySelector('button[type="submit"]');
    var status = form.querySelector('.status');
    var rotuloBotao = botao ? botao.textContent : '';

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!form.reportValidity()) return;

      if (botao) { botao.disabled = true; botao.textContent = 'Registrando…'; }
      if (status) { status.className = 'status'; status.textContent = ''; }

      var seguir = function (protocolo) {
        var alvo = buscar('whatsapp.' + destino, cfg);
        var mensagem = montarMensagem(form, protocolo);

        if (form.hasAttribute('data-sem-whatsapp') || !alvo || !alvo.numero || !condicaoAtendida(form)) {
          concluirSemWhatsApp(form, protocolo, status, botao, rotuloBotao);
          return;
        }

        if (status && protocolo) status.textContent = 'Registrado com o protocolo ' + protocolo + '. Abrindo o WhatsApp…';
        window.location.href = linkWhatsApp(alvo.numero, mensagem);
      };

      if (!cfg.registro || !cfg.registro.habilitado) {
        seguir(null);
        return;
      }

      registrar(caminho, coletarDados(form))
        .then(seguir)
        .catch(function () {
          // Regra do projeto: falha de integração nunca bloqueia o atendimento.
          if (status) {
            status.className = 'status status--erro';
            status.textContent = 'Não foi possível registrar automaticamente. ' +
              'Sua mensagem segue para o WhatsApp mesmo assim — descreva a situação por lá.';
          }
          setTimeout(function () { seguir(null); }, 2500);
        });
    });
  }

  function concluirSemWhatsApp(form, protocolo, status, botao, rotuloBotao) {
    var confirmacao = document.getElementById('confirmacao');
    if (confirmacao) {
      var prot = confirmacao.querySelector('[data-protocolo]');
      if (prot) prot.textContent = protocolo || '—';
      form.classList.add('oculto');
      confirmacao.classList.remove('oculto');
      confirmacao.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (status) status.textContent = 'Registro concluído. Obrigado.';
    if (botao) { botao.disabled = false; botao.textContent = rotuloBotao; }
  }

  /* ---------- inicialização ---------- */

  function iniciar() {
    document.querySelectorAll('form[data-caminho]').forEach(ligarFormulario);
  }

  fetch('content/config.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (json) {
      cfg = json;
      aplicar();
      iniciar();
    })
    .catch(function () {
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
