/* SAD-SLA - regras e cálculos (sem tela e sem banco de dados).
   Este arquivo é usado pelo site e também pelos testes automáticos. */
(function (raiz) {
  'use strict';

  var SEM_DADOS = 'Sem dados suficientes';
  var LIMIAR_PROB_ALTA = 0.70;   // probabilidade a partir da qual o risco sobe um nível
  var FAIXAS = [
    { nome: 'Normal', classe: 'normal', texto: 'abaixo de 50%' },
    { nome: 'Acompanhamento', classe: 'acomp', texto: 'de 50% a 75%' },
    { nome: 'Atenção', classe: 'atencao', texto: 'de 75% a 90%' },
    { nome: 'Crítico', classe: 'critico', texto: 'de 90% a 100%' },
    { nome: 'Atrasado', classe: 'atrasado', texto: 'acima de 100%' }
  ];

  // ---------------------------------------------------------- textos
  function semAcento(t) { return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function norm(t) { return semAcento(t).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function chave(t) { return norm(t).replace(/[^a-z0-9]+/g, ''); }
  // Arredondamento padrão do sistema: a metade sempre sobe (3,525 -> 3,53). O 1e-7 evita que erros de
  // representação decimal do computador façam uma metade cair para baixo.
  function arred(v, casas) { var f = Math.pow(10, casas); return Math.round(v * f + 1e-7) / f; }

  var ENCERRADOS = ['resolvido', 'resolved', 'fechado', 'closed', 'concluido', 'complete', 'completed',
    'encerrado', 'fechado completo', 'fechado incompleto'];
  var CANCELADOS = ['cancelado', 'cancelled', 'canceled', 'cancelado / pendencia de terceiros'];

  function situacaoEstado(estado) {
    var e = norm(estado);
    if (CANCELADOS.indexOf(e) >= 0) return 'cancelado';
    if (ENCERRADOS.indexOf(e) >= 0) return 'encerrado';
    return 'ativo';
  }

  function normalizarCategoria(c) {
    return String(c == null ? '' : c).trim().replace('DeskPhone and Mobile devices', 'Desk Phone and Mobile devices');
  }

  // ------------------------------------------------------ indicadores de SLA
  function faixaConsumo(pct) {
    if (pct == null || isNaN(pct)) return SEM_DADOS;
    if (pct > 100) return 'Atrasado';
    if (pct >= 90) return 'Crítico';
    if (pct >= 75) return 'Atenção';
    if (pct >= 50) return 'Acompanhamento';
    return 'Normal';
  }

  function classeFaixa(nome) {
    for (var i = 0; i < FAIXAS.length; i++) if (FAIXAS[i].nome === nome) return FAIXAS[i].classe;
    return 'semdados';
  }

  function prioridadeNumerica(txt) {
    var m = String(txt == null ? '' : txt).trim().match(/^(?:p\s*)?([1-4])(?![0-9])/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function horasContratadas(tipo, prioNum, vip) {
    if (tipo === 'INCIDENTE') {
      if (vip) return 8;
      return ({ 1: 4, 2: 8, 3: 16, 4: 24 })[prioNum] || 24;
    }
    return vip ? 24 : 72;
  }

  // -------------------------------------------------------- modelos analíticos
  function probabilidade(cls, prio, logUpd, categoria, grupo) {
    var z = cls.intercepto;
    var valores = { prioridade_num: prio, log_atualizacoes: logUpd };
    cls.numericas.forEach(function (n) { z += n.coef * (valores[n.nome] - n.media) / n.desvio; });
    var entrada = { Categoria: categoria, GrupoAtribuicao: grupo };
    cls.categoricas.forEach(function (c) {
      var coef = c.valores[entrada[c.coluna]];
      if (coef != null) z += coef;
    });
    return 1 / (1 + Math.exp(-z));
  }

  function atribuirPerfil(agr, logHoras, logUpd, prio) {
    var x = [logHoras, logUpd, prio];
    var melhor = -1, menor = Infinity;
    agr.centroides.forEach(function (c, i) {
      var d = 0;
      for (var k = 0; k < 3; k++) { var z = (x[k] - agr.media[k]) / agr.desvio[k]; d += Math.pow(c[k] - z, 2); }
      if (d < menor) { menor = d; melhor = i; }
    });
    return agr.nomes[melhor];
  }

  /* Recebe uma linha já normalizada da planilha e devolve a linha no formato da tabela
     chamados_ativos. Não inventa valores: sem tempo decorrido, não há percentual nem faixa. */
  function calcularChamado(l, modelo) {
    var prio = prioridadeNumerica(l.prioridade);
    var vip = !!l.vip || String(l.usertype || '').trim().toUpperCase() === 'VIP';
    var horasC = horasContratadas(l.tipo, prio, vip);
    var horas = (l.tempoSeg == null || isNaN(l.tempoSeg)) ? null : l.tempoSeg / 3600;
    var pct = horas == null ? null : horas / horasC * 100;
    var upd = l.atualizacoes == null || isNaN(l.atualizacoes) ? 0 : Math.round(l.atualizacoes);
    var logUpd = Math.log10(upd + 1);
    var categoria = normalizarCategoria(l.categoria);
    var prob = null;
    if (l.tipo === 'INCIDENTE' && prio != null) {
      prob = probabilidade(modelo.classificacao, prio, logUpd, categoria, l.grupo || '');
    }
    var perfil = (horas == null || prio == null) ? null :
      atribuirPerfil(modelo.agrupamento, Math.log10(horas + 1), logUpd, prio);
    return {
      numero: String(l.numero), tipo_chamado: l.tipo, prioridade: l.prioridade || null,
      prioridade_num: prio, estado: l.estado || null, grupo_atribuicao: l.grupo || null,
      analista: l.analista || null, categoria: categoria || null, data_criacao: l.data || null,
      user_type: l.usertype || null, vip: vip, qtd_atualizacoes: upd,
      horas_contratadas: horasC,
      tempo_decorrido_horas: horas == null ? null : arred(horas, 2),
      pct_sla_consumido: pct == null ? null : arred(pct, 2),
      horas_restantes: horas == null ? null : arred(Math.max(horasC - horas, 0), 2),
      horas_excedidas: horas == null ? null : arred(Math.max(horas - horasC, 0), 2),
      sla_violado: pct == null ? null : pct > 100,
      faixa_consumo: faixaConsumo(pct),
      prob_violacao: prob == null ? null : arred(prob, 4),
      perfil_analitico: perfil
    };
  }

  // ----------------------------------------------------- importação de planilha
  var CAMPOS = [
    { id: 'numero', rotulo: 'Número', obrigatorio: true, aliases: ['numero', 'number', 'id', 'idanonimo'] },
    { id: 'tipo', rotulo: 'TipoChamado', obrigatorio: false, aliases: ['tipochamado', 'tipo', 'tipodechamado'],
      dica: 'Se ausente, é deduzido pelo prefixo do número (INC ou REQ/RITM).' },
    { id: 'prioridade', rotulo: 'Prioridade', obrigatorio: true, aliases: ['prioridade', 'priority'] },
    { id: 'estado', rotulo: 'Estado', obrigatorio: true, aliases: ['estado', 'state', 'status'] },
    { id: 'grupo', rotulo: 'GrupoAtribuicao', obrigatorio: false, aliases: ['grupoatribuicao', 'grupodeatribuicao', 'grupo', 'assignmentgroup'] },
    { id: 'analista', rotulo: 'Analista', obrigatorio: false, aliases: ['analista', 'atribuidoa', 'assignedto'] },
    { id: 'categoria', rotulo: 'Categoria', obrigatorio: false, aliases: ['categoria', 'category'] },
    { id: 'data', rotulo: 'DataCriacao', obrigatorio: false, aliases: ['datacriacao', 'criacaoem', 'aberto', 'opened'] },
    { id: 'usertype', rotulo: 'UserType', obrigatorio: false, aliases: ['usertype', 'tipodeusuario'] },
    { id: 'atualizacoes', rotulo: 'QuantidadeAtualizacoes', obrigatorio: false, aliases: ['quantidadeatualizacoes', 'atualizacoes', 'updates'] },
    { id: 'tempo', rotulo: 'TempoDecorridoSegundos', obrigatorio: false, aliases: ['tempodecorridosegundos', 'tempodecorrido', 'elapsedtime'],
      dica: 'Em segundos. Sem ele, o consumo do SLA não é calculado.' },
    { id: 'vip', rotulo: 'EhVIP', obrigatorio: false, aliases: ['ehvip', 'vip'] }
  ];

  function mapearColunas(cabecalhos) {
    var porChave = {};
    cabecalhos.forEach(function (c) { porChave[chave(c)] = c; });
    var mapa = {}, situacao = [];
    CAMPOS.forEach(function (campo) {
      var achada = null;
      for (var i = 0; i < campo.aliases.length && !achada; i++) achada = porChave[campo.aliases[i]] || null;
      if (achada) mapa[campo.id] = achada;
      situacao.push({ id: campo.id, rotulo: campo.rotulo, obrigatorio: campo.obrigatorio, dica: campo.dica || '',
        encontrada: !!achada, coluna: achada });
    });
    return { mapa: mapa, situacao: situacao };
  }

  function paraNumero(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    var t = String(v).trim();
    var hms = t.match(/^(?:(\d+)\s*(?:days?|dias?)\s*)?(\d+):(\d{2}):(\d{2})$/i);
    if (hms) return (parseInt(hms[1] || '0', 10) * 86400) + parseInt(hms[2], 10) * 3600 + parseInt(hms[3], 10) * 60 + parseInt(hms[4], 10);
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    var n = Number(t);
    return isNaN(n) ? null : n;
  }

  function dois(n) { return (n < 10 ? '0' : '') + n; }
  function paraData(v) {
    if (v == null || v === '') return null;
    var d = null;
    if (v instanceof Date) {
      // usa o relógio local e tolera pequenos desvios de arredondamento do Excel
      var ms = v.getTime() - v.getTimezoneOffset() * 60000 + 5 * 60000;
      d = new Date(Math.floor(ms / 86400000) * 86400000);
      return d.getUTCFullYear() + '-' + dois(d.getUTCMonth() + 1) + '-' + dois(d.getUTCDate());
    }
    if (typeof v === 'number') {            // data em formato serial do Excel
      if (v < 20000 || v > 80000) return null;
      d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
      return d.getUTCFullYear() + '-' + dois(d.getUTCMonth() + 1) + '-' + dois(d.getUTCDate());
    }
    var t = String(v).trim();
    var br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (br) return br[3] + '-' + dois(+br[2]) + '-' + dois(+br[1]);
    var iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? iso[1] + '-' + iso[2] + '-' + iso[3] : null;
  }

  function paraBool(v) {
    if (typeof v === 'boolean') return v;
    var t = norm(v);
    return ['true', 'verdadeiro', 'sim', 's', 'yes', 'y', '1', 'vip'].indexOf(t) >= 0;
  }

  function tipoDoChamado(tipoBruto, numero) {
    var t = norm(tipoBruto);
    if (['incidente', 'incident', 'inc'].indexOf(t) >= 0) return 'INCIDENTE';
    if (['requisicao', 'request', 'req', 'ritm', 'solicitacao'].indexOf(t) >= 0) return 'REQUISIÇÃO';
    var n = String(numero || '').toUpperCase();
    if (/^INC/.test(n)) return 'INCIDENTE';
    if (/^(REQ|RITM)/.test(n)) return 'REQUISIÇÃO';
    return null;
  }

  function texto(v) { return v == null ? '' : String(v).trim(); }

  function normalizarLinha(bruta, mapa) {
    function pega(id) { return mapa[id] == null ? null : bruta[mapa[id]]; }
    var numero = texto(pega('numero'));
    var analista = texto(pega('analista'));
    if (norm(analista) === 'sem-analista') analista = '';
    return {
      numero: numero,
      tipo: tipoDoChamado(pega('tipo'), numero),
      prioridade: texto(pega('prioridade')),
      estado: texto(pega('estado')),
      grupo: texto(pega('grupo')),
      analista: analista,
      categoria: texto(pega('categoria')),
      data: paraData(pega('data')),
      usertype: texto(pega('usertype')),
      atualizacoes: paraNumero(pega('atualizacoes')),
      tempoSeg: paraNumero(pega('tempo')),
      vip: paraBool(pega('vip'))
    };
  }

  /* Valida a planilha inteira e separa o que entra na fila ativa. */
  function validarPlanilha(linhasBrutas, cabecalhos, modelo) {
    var cols = mapearColunas(cabecalhos);
    var faltando = cols.situacao.filter(function (c) { return c.obrigatorio && !c.encontrada; });
    var r = { colunas: cols.situacao, mapa: cols.mapa, bloqueios: [], avisos: [], registros: linhasBrutas.length,
      colunasTotal: cabecalhos.length, incidentes: 0, requisicoes: 0, validos: 0, invalidos: [],
      semTempo: 0, semAnalista: 0, encerrados: 0, cancelados: 0, ativos: [] };
    if (faltando.length) {
      r.bloqueios.push('Colunas obrigatórias ausentes: ' + faltando.map(function (c) { return c.rotulo; }).join(', ') +
        '. Confira os nomes dos cabeçalhos ou baixe o modelo de planilha.');
      return r;
    }
    if (!cols.mapa.tempo) r.avisos.push('A coluna TempoDecorridoSegundos não foi encontrada: o consumo do SLA não será calculado e os chamados aparecerão como "' + SEM_DADOS + '".');
    if (!cols.mapa.analista) r.avisos.push('A coluna Analista não foi encontrada: todos os chamados serão tratados como sem analista.');
    if (!cols.mapa.tipo) r.avisos.push('A coluna TipoChamado não foi encontrada: o tipo foi deduzido pelo prefixo do número.');
    if (!cols.mapa.categoria || !cols.mapa.grupo) r.avisos.push('Sem Categoria ou GrupoAtribuicao, a estimativa de violação perde precisão.');

    var vistos = {};
    linhasBrutas.forEach(function (bruta, i) {
      var l = normalizarLinha(bruta, cols.mapa);
      var linhaPlanilha = i + 2;
      if (!l.numero) { r.invalidos.push('Linha ' + linhaPlanilha + ': sem número do chamado.'); return; }
      if (!l.tipo) { r.invalidos.push('Linha ' + linhaPlanilha + ' (' + l.numero + '): tipo não identificado.'); return; }
      if (!l.estado) { r.invalidos.push('Linha ' + linhaPlanilha + ' (' + l.numero + '): sem estado.'); return; }
      if (vistos[l.numero]) { r.invalidos.push('Linha ' + linhaPlanilha + ' (' + l.numero + '): número repetido.'); return; }
      vistos[l.numero] = true;
      r.validos++;
      if (l.tipo === 'INCIDENTE') r.incidentes++; else r.requisicoes++;
      var sit = situacaoEstado(l.estado);
      if (sit === 'cancelado') { r.cancelados++; return; }
      if (sit === 'encerrado') { r.encerrados++; return; }
      if (l.tempoSeg == null) r.semTempo++;
      if (!l.analista) r.semAnalista++;
      r.ativos.push(calcularChamado(l, modelo));
    });
    return r;
  }

  // ----------------------------------------------------------- apoio à decisão
  function nivelRisco(ch) {
    if (ch.pct_sla_consumido == null) {
      return { nivel: 'indefinido', rotulo: 'Indefinido', motivos: ['Sem tempo decorrido: o consumo do SLA não pode ser calculado.'] };
    }
    var pct = ch.pct_sla_consumido;
    var nivel = pct >= 90 ? 'alto' : (pct >= 50 ? 'medio' : 'baixo');
    var motivos = ['SLA consumido: ' + String(arred(pct, 1)).replace('.', ',') + '% (faixa ' + ch.faixa_consumo + ').'];
    if (!ch.sla_violado && ch.prob_violacao != null && ch.prob_violacao >= LIMIAR_PROB_ALTA && nivel !== 'alto') {
      nivel = nivel === 'baixo' ? 'medio' : 'alto';
      motivos.push('Probabilidade estimada de violação de ' + Math.round(ch.prob_violacao * 100) + '% (a partir de 70%): risco elevado em um nível.');
    }
    return { nivel: nivel, rotulo: { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }[nivel], motivos: motivos };
  }

  function limitar(n) { return Math.max(1, Math.min(5, n)); }

  /* Notas iniciais da matriz, ajustadas pelo risco do chamado (proporcionalidade).
     Retorna, por alternativa, as notas e a origem de cada uma ('padrao' ou 'ajustada'). */
  function notasSugeridas(padrao, nivel) {
    var ajustes = (padrao.ajustes_por_risco || {})[nivel] || {};
    var saida = {};
    padrao.alternativas.forEach(function (alt) {
      var notas = alt.notas.slice(), origem = alt.notas.map(function () { return 'padrao'; });
      padrao.criterios.forEach(function (crit, j) {
        var delta = ((ajustes[crit] || {})[alt.nome]) || 0;
        if (delta !== 0) {
          var nova = limitar(alt.notas[j] + delta);
          if (nova !== alt.notas[j]) { notas[j] = nova; origem[j] = 'ajustada'; }
        }
      });
      saida[alt.nome] = { notas: notas, origem: origem };
    });
    return saida;
  }

  function normalizarPesos(pesos) {
    var soma = pesos.reduce(function (a, b) { return a + b; }, 0);
    if (soma <= 0) return pesos.slice();
    var r = pesos.map(function (p) { return arred(p / soma * 100, 1); });
    var sobra = arred(100 - r.reduce(function (a, b) { return a + b; }, 0), 1);   // corrige o arredondamento
    if (sobra !== 0) { var i = r.indexOf(Math.max.apply(null, r)); r[i] = arred(r[i] + sobra, 1); }
    return r;
  }

  /* Pesos iniciais dos critérios. Para chamado VIP, o critério "Condição VIP" recebe o peso
     sugerido (se estava zerado) e os demais são reduzidos proporcionalmente. */
  function pesosSugeridos(criterios, vip, padrao) {
    var base = criterios.map(function (c) { return Number(c.peso_inicial); });
    var idxVip = criterios.findIndex(function (c) { return c.nome === 'Condição VIP'; });
    if (!vip || idxVip < 0 || base[idxVip] > 0) return { pesos: base, vipSugerido: false };
    var alvo = padrao.peso_vip_sugerido || 10;
    var somaOutros = base.reduce(function (a, b, i) { return i === idxVip ? a : a + b; }, 0);
    var fator = somaOutros > 0 ? (100 - alvo) / somaOutros : 0;
    var novos = base.map(function (p, i) { return i === idxVip ? alvo : arred(p * fator, 1); });
    var sobra = arred(100 - novos.reduce(function (a, b) { return a + b; }, 0), 1);   // corrige o arredondamento
    if (sobra !== 0) {
      var iMax = -1;
      novos.forEach(function (p, i) { if (i !== idxVip && (iMax < 0 || p > novos[iMax])) iMax = i; });
      novos[iMax] = arred(novos[iMax] + sobra, 1);
    }
    return { pesos: novos, vipSugerido: true };
  }

  /* alternativas: [{ativa, notas:[...|null]}], pesos: [n]. Um critério só entra no cálculo
     se tiver peso > 0 e nota em TODAS as alternativas ativas (base uniforme). */
  function pontuar(alternativas, pesos) {
    var ativas = alternativas.filter(function (a) { return a.ativa; });
    var usados = [], semNota = [];
    pesos.forEach(function (p, j) {
      if (!(p > 0)) return;
      var completo = ativas.length > 0 && ativas.every(function (a) { return a.notas[j] != null; });
      (completo ? usados : semNota).push(j);
    });
    var pesoUsado = usados.reduce(function (s, j) { return s + pesos[j]; }, 0);
    var pontuacoes = alternativas.map(function (a) {
      if (!a.ativa || pesoUsado <= 0) return null;
      return usados.reduce(function (s, j) { return s + a.notas[j] * pesos[j]; }, 0) / pesoUsado;
    });
    return { pontuacoes: pontuacoes, usados: usados, semNota: semNota, pesoUsado: pesoUsado };
  }

  function ordenar(pontuacoes) {
    var idx = [];
    pontuacoes.forEach(function (p, i) { if (p != null) idx.push(i); });
    idx.sort(function (a, b) { return (pontuacoes[b] - pontuacoes[a]) || (a - b); });
    return idx;
  }

  /* Teste de robustez: muda o peso de cada critério em +/- 10 pontos e vê se o 1º colocado muda. */
  function robustez(alternativas, pesos, passo) {
    passo = passo || 10;
    var base = pontuar(alternativas, pesos);
    var ordem = ordenar(base.pontuacoes);
    if (ordem.length === 0) return null;
    var topo = ordem[0], total = 0, mantem = 0, trocas = [];
    pesos.forEach(function (p, j) {
      [passo, -passo].forEach(function (d) {
        var novo = Math.max(0, p + d);
        if (novo === p) return;
        var copia = pesos.slice(); copia[j] = novo;
        var r = pontuar(alternativas, copia), o = ordenar(r.pontuacoes);
        if (o.length === 0) return;
        total++;
        if (o[0] === topo) mantem++; else trocas.push({ criterio: j, delta: d, novoTopo: o[0] });
      });
    });
    var margem = ordem.length > 1 ? base.pontuacoes[ordem[0]] - base.pontuacoes[ordem[1]] : null;
    return { topo: topo, total: total, mantem: mantem, trocas: trocas, margem: margem };
  }

  function motivosAnalise(ch, taxaCategoria) {
    var m = [];
    if (ch.sla_violado) m.push('SLA já violado');
    else if (ch.pct_sla_consumido != null && ch.pct_sla_consumido >= 90) m.push('SLA em faixa crítica (90% ou mais consumido)');
    if (ch.pct_sla_consumido == null) m.push('Sem dados suficientes para calcular o consumo do SLA');
    if (ch.prioridade_num === 1) m.push('Prioridade crítica (P1)');
    if (ch.vip) m.push('Condição VIP');
    if (!ch.analista) m.push('Chamado sem analista responsável');
    if (taxaCategoria != null && taxaCategoria >= 70) m.push('Categoria com alta taxa histórica de violação (' + String(taxaCategoria).replace('.', ',') + '%)');
    if (ch.qtd_atualizacoes <= 2) m.push('Poucas atualizações registradas (' + ch.qtd_atualizacoes + ')');
    if (!ch.sla_violado && ch.prob_violacao != null && ch.prob_violacao >= LIMIAR_PROB_ALTA) m.push('Probabilidade estimada de violação alta (' + Math.round(ch.prob_violacao * 100) + '%)');
    return m;
  }

  var api = {
    SEM_DADOS: SEM_DADOS, FAIXAS: FAIXAS, CAMPOS: CAMPOS, LIMIAR_PROB_ALTA: LIMIAR_PROB_ALTA,
    norm: norm, chave: chave, arred: arred, situacaoEstado: situacaoEstado, normalizarCategoria: normalizarCategoria,
    faixaConsumo: faixaConsumo, classeFaixa: classeFaixa, prioridadeNumerica: prioridadeNumerica,
    horasContratadas: horasContratadas, probabilidade: probabilidade, atribuirPerfil: atribuirPerfil,
    calcularChamado: calcularChamado, mapearColunas: mapearColunas, normalizarLinha: normalizarLinha,
    validarPlanilha: validarPlanilha, paraData: paraData, paraNumero: paraNumero,
    nivelRisco: nivelRisco, notasSugeridas: notasSugeridas, normalizarPesos: normalizarPesos,
    pesosSugeridos: pesosSugeridos, pontuar: pontuar, ordenar: ordenar, robustez: robustez,
    motivosAnalise: motivosAnalise
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.SADLogica = api;
})(typeof window !== 'undefined' ? window : globalThis);
