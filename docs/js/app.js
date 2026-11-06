/* SAD-SLA - inicialização, login, menu e navegação entre telas. */
(function (raiz) {
  'use strict';
  var A = raiz.SADApp, D = raiz.SADDados, E = A.estado, esc = A.esc;
  var ORDEM = ['visao-geral', 'importar', 'fila', 'matriz', 'sensibilidade', 'historico', 'funcoes', 'sobre'];
  var ROTULO_PERFIL = { analista: 'Analista de suporte', gestor: 'Líder de TI (decisor)', administrador: 'Administrador' };
  function $(id) { return document.getElementById(id); }

  function temaSalvo() { try { return localStorage.getItem('sad_tema'); } catch (e) { return null; } }
  function aplicarTema(t) { document.documentElement.setAttribute('data-tema', t); try { localStorage.setItem('sad_tema', t); } catch (e) { /* sem armazenamento */ } }
  function configOk() { var c = raiz.SAD_CONFIG; return !!(c && c.url && c.chave && !/COLE_AQUI/.test(c.url + c.chave)); }

  function mostrarLogin(erro) {
    $('app').hidden = true; $('tela-login').hidden = false;
    var el = $('login-erro'); el.textContent = erro || ''; el.hidden = !erro;
  }

  function rotasPermitidas() {
    return A.rotas.filter(function (r) { return r.perfis.indexOf(E.perfil) >= 0; })
      .sort(function (a, b) { return ORDEM.indexOf(a.id) - ORDEM.indexOf(b.id); });
  }

  function atualizarRodape() {
    var ultima = E.chamados.reduce(function (m, c) { return c.importado_em && c.importado_em > m ? c.importado_em : m; }, '');
    $('rodape-usuario').innerHTML = '<b>' + esc(E.nome) + '</b>' + ((ROTULO_PERFIL[E.perfil] || '').indexOf(E.nome) === 0 ? '' : '<br>' + esc(ROTULO_PERFIL[E.perfil] || E.perfil));
    $('rodape-base').innerHTML = 'Base: ' + E.chamados.length + ' ativos · ' + E.historico.length + ' históricos<br>Última análise: ' + (ultima ? A.dataHoraBR(ultima) : '—');
    $('rodape-versao').textContent = A.VERSAO;
  }

  A.recarregarBase = async function () {
    var b = await D.carregarBase();
    E.chamados = b.chamados; E.criterios = b.criterios; E.alternativas = b.alternativas; E.regras = b.regras;
    E.historico = b.historico; E.porCategoria = b.porCategoria; E.porPrioridade = b.porPrioridade;
    E.taxaCategoria = {}; b.porCategoria.forEach(function (x) { E.taxaCategoria[x.categoria] = Number(x.pct_violacao); });
    var viol = b.historico.filter(function (x) { return x.sla_violado; }).length;
    E.taxaGeral = b.historico.length ? viol / b.historico.length * 100 : null;
    E.matriz = null; E.sim = null;
    if (E.selecionado && !A.chamadoPorNumero(E.selecionado)) E.selecionado = null;
    if ($('rodape-usuario')) atualizarRodape();
  };

  function montarMenu() {
    $('nav').innerHTML = rotasPermitidas().map(function (r) {
      return '<a class="nav-item" href="#' + r.id + '" data-rota="' + r.id + '">' + A.icone(r.icone) + '<span>' + esc(r.titulo) + '</span></a>';
    }).join('');
    $('selo-perfil').textContent = ROTULO_PERFIL[E.perfil] || E.perfil;
  }

  function erroTela(e) {
    console.error(e);
    $('conteudo').innerHTML = '<div class="cartao"><p class="msg msg-erro">Não foi possível mostrar esta tela: ' + esc((e && e.message) || e) + '</p></div>';
  }

  var ultimaRota = null;
  A.renderizarRota = function () {
    if (!E.perfil) { ultimaRota = null; return; }
    var permitidas = rotasPermitidas();
    var id = (location.hash || '').replace('#', '') || 'visao-geral';
    var rota = permitidas.filter(function (r) { return r.id === id; })[0];
    if (!rota) { rota = permitidas[0]; try { history.replaceState(null, '', '#' + rota.id); } catch (e) { /* ignora */ } }
    ultimaRota = rota.id;
    A.limparGraficos(); A.fecharModal();
    $('titulo-tela').textContent = rota.titulo;
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (a) {
      var ativo = a.getAttribute('data-rota') === rota.id; a.classList.toggle('ativo', ativo);
      if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var c = $('conteudo'); c.innerHTML = '';
    try { var r = rota.desenhar(c); if (r && r.catch) r.catch(erroTela); } catch (e) { erroTela(e); }
    try { raiz.scrollTo(0, 0); } catch (e) { /* ignora */ }
  };

  async function carregarJSON(url) {
    var r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Não consegui carregar ' + url + ' (' + r.status + ').');
    return r.json();
  }

  async function entrarNoApp(user) {
    E.usuario = user;
    var p = await D.carregarPerfil(user.id);
    if (!p) { await D.sair(); throw new Error('Este usuário ainda não tem perfil. Rode o arquivo database/03_perfis_usuarios.sql no Supabase.'); }
    E.nome = p.nome; E.perfil = p.perfil;
    var arqs = await Promise.all([carregarJSON('dados/modelo.json'), carregarJSON('dados/matriz_padrao.json')]);
    E.modelo = arqs[0]; E.padrao = arqs[1];
    await A.recarregarBase();
    var nomes = E.criterios.map(function (c) { return c.nome; });
    if (JSON.stringify(nomes) !== JSON.stringify(E.padrao.criterios)) throw new Error('Os critérios do banco não coincidem com dados/matriz_padrao.json. Rode novamente os arquivos SQL.');
    montarMenu(); atualizarRodape();
    $('tela-login').hidden = true; $('app').hidden = false;
    A.renderizarRota();
  }

  function sair() {
    D.sair().catch(function () { /* ignora */ });
    E.usuario = null; E.perfil = ''; E.nome = ''; E.chamados = []; E.matriz = null; E.sim = null; E.selecionado = null; E.importacao = null;
    A.limparGraficos(); raiz.location.hash = '';
    mostrarLogin('');
  }

  function ligarEventos() {
    $('form-login').addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = $('login-email').value.trim(), senha = $('login-senha').value, btn = $('login-entrar');
      if (!email || !senha) { mostrarLogin('Informe e-mail e senha.'); return; }
      btn.disabled = true; btn.textContent = 'Entrando…';
      try { var u = await D.entrar(email, senha); raiz.location.hash = ''; await entrarNoApp(u); }   // login novo começa na Visão Geral
      catch (err) { mostrarLogin(err.message || String(err)); }
      finally { btn.disabled = false; btn.textContent = 'Entrar'; }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-email]'), function (b) {
      b.addEventListener('click', function () { $('login-email').value = b.getAttribute('data-email'); $('login-senha').focus(); });
    });
    $('btn-sair').addEventListener('click', sair);
    $('btn-tema').addEventListener('click', function () { aplicarTema(document.documentElement.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro'); A.renderizarRota(); });
    $('modal-fechar').addEventListener('click', A.fecharModal);
    $('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') A.fecharModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') A.fecharModal();
      if (e.key === 'Enter' && e.target.getAttribute && e.target.getAttribute('data-filtro') && e.target.getAttribute('role') === 'button') A.aplicarAtalhoFiltro(e.target.getAttribute('data-filtro'));
    });
    document.addEventListener('click', function (e) {
      var ir = e.target.closest('[data-ir]'), fl = e.target.closest('[data-filtro]'), am = e.target.closest('[data-analisar-modal]');
      if (am) { A.selecionarChamado(am.getAttribute('data-analisar-modal')); A.navegar('matriz'); return; }
      if (fl) { A.aplicarAtalhoFiltro(fl.getAttribute('data-filtro')); return; }
      if (ir) A.navegar(ir.getAttribute('data-ir'));
    });
    raiz.addEventListener('hashchange', function () {
      var id = (location.hash || '').replace('#', '') || 'visao-geral';
      if (id === ultimaRota) return;           // evita desenhar a mesma tela duas vezes
      A.renderizarRota();
    });
  }

  A.iniciar = async function () {
    var t = temaSalvo(); if (t) document.documentElement.setAttribute('data-tema', t);
    ligarEventos();
    if (!configOk()) { mostrarLogin('O site ainda não está ligado ao banco de dados. Edite o arquivo js/config.js com a Project URL e a chave publishable do Supabase.'); return; }
    if (!raiz.supabase) { mostrarLogin('Não consegui carregar a biblioteca do Supabase. Confira a conexão com a internet e recarregue a página.'); return; }
    D.iniciar(raiz.SAD_CONFIG.url, raiz.SAD_CONFIG.chave);
    try {
      var u = await D.sessao();
      if (u) await entrarNoApp(u); else mostrarLogin('');
    } catch (e) { mostrarLogin(e.message || String(e)); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', A.iniciar); else A.iniciar();
})(window);
