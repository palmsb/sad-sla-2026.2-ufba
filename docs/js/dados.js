/* SAD-SLA - acesso ao banco de dados (Supabase). Nenhuma regra de negócio aqui. */
(function (raiz) {
  'use strict';
  var sb = null;

  function traduzir(erro) {
    var m = String((erro && erro.message) || erro || '');
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/row-level security|permission denied|not allowed/i.test(m)) return 'Seu perfil não tem permissão para esta ação.';
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(m))
      return 'Não foi possível falar com o banco de dados. Confira a internet e se o projeto do Supabase não está pausado (projetos gratuitos pausam após uma semana sem uso).';
    if (/relation .* does not exist|could not find the table/i.test(m)) return 'O banco ainda não tem as tabelas do SAD-SLA. Rode os arquivos SQL da pasta database/.';
    return m || 'Erro inesperado.';
  }

  function checar(resp) {
    if (resp.error) { var e = new Error(traduzir(resp.error)); e.original = resp.error; throw e; }
    return resp.data;
  }

  var D = {
    traduzir: traduzir,
    iniciar: function (url, chave) { sb = raiz.supabase.createClient(url, chave); },

    sessao: async function () {
      var r = await sb.auth.getSession();
      return r && r.data && r.data.session ? r.data.session.user : null;
    },
    entrar: async function (email, senha) {
      var r = await sb.auth.signInWithPassword({ email: email, password: senha });
      if (r.error) throw new Error(traduzir(r.error));
      return r.data.user;
    },
    sair: async function () { await sb.auth.signOut(); },

    carregarPerfil: async function (uid) {
      var d = checar(await sb.from('perfis').select('*').eq('id', uid));
      return d && d.length ? d[0] : null;
    },
    listarPerfis: async function () { return checar(await sb.from('perfis').select('*')); },

    carregarBase: async function () {
      var r = await Promise.all([
        sb.from('chamados_ativos').select('*').order('pct_sla_consumido', { ascending: false, nullsFirst: false }),
        sb.from('criterios').select('*').order('ordem', { ascending: true }),
        sb.from('alternativas').select('*').order('ordem', { ascending: true }),
        sb.from('regras_sla').select('*').order('id', { ascending: true }),
        sb.from('chamados_historicos').select('*'),
        sb.from('vw_violacao_por_categoria').select('*').order('pct_violacao', { ascending: false }),
        sb.from('vw_violacao_por_prioridade').select('*').order('prioridade', { ascending: true })
      ]);
      return {
        chamados: checar(r[0]), criterios: checar(r[1]), alternativas: checar(r[2]), regras: checar(r[3]),
        historico: checar(r[4]), porCategoria: checar(r[5]), porPrioridade: checar(r[6])
      };
    },

    /* Grava a fila nova SEM perder a antiga se algo falhar no meio:
       primeiro insere/atualiza os novos, só depois remove os que saíram. */
    salvarFila: async function (linhas) {
      var agora = new Date().toISOString();
      var comData = linhas.map(function (l) { var c = Object.assign({}, l); c.importado_em = agora; return c; });
      for (var i = 0; i < comData.length; i += 100) {
        checar(await sb.from('chamados_ativos').upsert(comData.slice(i, i + 100), { onConflict: 'numero' }));
      }
      var atuais = checar(await sb.from('chamados_ativos').select('numero'));
      var novos = {}; linhas.forEach(function (l) { novos[l.numero] = true; });
      var remover = atuais.map(function (a) { return a.numero; }).filter(function (n) { return !novos[n]; });
      for (var j = 0; j < remover.length; j += 50) {
        checar(await sb.from('chamados_ativos').delete().in('numero', remover.slice(j, j + 50)));
      }
      return { gravados: linhas.length, removidos: remover.length };
    },

    registrarDecisao: async function (d) { return checar(await sb.from('decisoes').insert(d).select()); },
    listarDecisoes: async function () { return checar(await sb.from('decisoes').select('*').order('data_analise', { ascending: false })); },
    atualizarResultado: async function (id, texto) { return checar(await sb.from('decisoes').update({ resultado_posterior: texto }).eq('id', id).select()); },
    autonomia: async function () { var d = checar(await sb.from('vw_autonomia_decisor').select('*')); return d && d.length ? d[0] : null; },

    salvarCenario: async function (c) { return checar(await sb.from('cenarios').insert(c).select()); },
    listarCenarios: async function (numero) {
      return checar(await sb.from('cenarios').select('*').eq('chamado_numero', numero).order('criado_em', { ascending: false }));
    }
  };
  raiz.SADDados = D;
})(window);
