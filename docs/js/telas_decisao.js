/* SAD-SLA - telas: Matriz de Decisão, Análise de Sensibilidade, Histórico de Decisões, Funções Analíticas. */
(function (raiz) {
  'use strict';
  var A = raiz.SADApp, L = raiz.SADLogica, D = raiz.SADDados, E = A.estado, esc = A.esc;
  var TODOS = ['analista', 'gestor', 'administrador'], DECISOR = ['gestor', 'administrador'];
  var ROTULO_NIVEL = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo', indefinido: 'Indefinido' };

  // ------------------------------------------------------------ estado da matriz
  function nomesCriterios() { return E.criterios.map(function (c) { return c.nome; }); }

  A.selecionarChamado = function (numero) { E.selecionado = numero; E.matriz = null; E.sim = null; };

  function chamadoAtual() {
    var ch = A.chamadoPorNumero(E.selecionado);
    if (!ch) {
      var lista = E.chamados.slice().sort(function (a, b) { return (b.pct_sla_consumido == null ? -1 : b.pct_sla_consumido) - (a.pct_sla_consumido == null ? -1 : a.pct_sla_consumido); });
      ch = lista[0]; E.selecionado = ch.numero; E.matriz = null; E.sim = null;
    }
    return ch;
  }

  function iniciarMatriz(ch) {
    var nivel = L.nivelRisco(ch);
    var sug = L.notasSugeridas(E.padrao, nivel.nivel);
    var ps = L.pesosSugeridos(E.criterios, ch.vip, E.padrao);
    E.matriz = {
      numero: ch.numero, nivel: nivel, vipSugerido: ps.vipSugerido, pesos: ps.pesos.slice(), pesosIniciais: ps.pesos.slice(),
      alternativas: E.padrao.alternativas.map(function (a) {
        var s = sug[a.nome];
        return { nome: a.nome, ativa: true, obs: '', custom: false, vantagem: a.vantagem, limitacao: a.limitacao, notas: s.notas.slice(), origem: s.origem.slice() };
      }),
      escolha: null, justificativa: '', relevantes: {}
    };
  }

  function garantirMatriz() {
    var ch = chamadoAtual();
    if (!E.matriz || E.matriz.numero !== ch.numero) iniciarMatriz(ch);
    return ch;
  }

  function calcular() {
    var m = E.matriz, calc = L.pontuar(m.alternativas, m.pesos), ordem = L.ordenar(calc.pontuacoes);
    return { calc: calc, ordem: ordem, topo: ordem.length ? ordem[0] : null };
  }

  function seletorChamado(id, atual) {
    var lista = E.chamados.slice().sort(function (a, b) { return (b.pct_sla_consumido == null ? -1 : b.pct_sla_consumido) - (a.pct_sla_consumido == null ? -1 : a.pct_sla_consumido); });
    return '<select id="' + id + '">' + lista.map(function (c) {
      return '<option value="' + esc(c.numero) + '"' + (c.numero === atual ? ' selected' : '') + '>' + esc(c.numero) + ' · ' + esc(c.faixa_consumo) + (c.pct_sla_consumido != null ? ' (' + A.n0(c.pct_sla_consumido) + '%)' : '') + '</option>';
    }).join('') + '</select>';
  }

  function par(r, v) { return '<div class="par"><span>' + r + '</span><b>' + v + '</b></div>'; }

  // ============================================================ MATRIZ DE DECISÃO
  function desenharContexto(ch) {
    var m = E.matriz, nivel = m.nivel;
    var motivos = L.motivosAnalise(ch, E.taxaCategoria[ch.categoria] != null ? E.taxaCategoria[ch.categoria] : null);
    var restante = ch.tempo_decorrido_horas == null ? '—' : A.n1(ch.sla_violado ? ch.horas_excedidas : ch.horas_restantes) + ' h';
    var ajustadas = 0; m.alternativas.forEach(function (a) { a.origem.forEach(function (o) { if (o === 'ajustada') ajustadas++; }); });
    document.getElementById('m-contexto').innerHTML =
      '<div class="grade-par">' + par('Tipo', ch.tipo_chamado === 'INCIDENTE' ? 'Incidente' : 'Requisição') + par('Prioridade', esc(ch.prioridade || '—')) + par('Estado', esc(ch.estado)) + par('Categoria', esc(ch.categoria)) +
      par('VIP', A.sn(ch.vip)) + par('Analista', ch.analista ? esc(ch.analista) : 'Sem analista') + par('Atualizações', A.n0(ch.qtd_atualizacoes)) +
      par('Horas contratadas', A.n0(ch.horas_contratadas) + ' h') + par('Horas decorridas', ch.tempo_decorrido_horas == null ? '—' : A.n1(ch.tempo_decorrido_horas) + ' h') + par(ch.sla_violado ? 'Horas excedidas' : 'Horas restantes', restante) +
      par('% de SLA consumido', A.pct(ch.pct_sla_consumido)) + par('Faixa de risco', A.faixa(ch.faixa_consumo)) +
      par('Prob. de violação ' + A.dica(A.TIP_PROB + ' Não se aplica a chamados já violados nem a requisições.'), ch.sla_violado ? 'SLA já violado' : A.pctProb(ch.prob_violacao)) +
      par('Perfil analítico ' + A.dica('Grupo de chamados parecidos, encontrado por agrupamento (K-means) na base histórica.'), esc(ch.perfil_analitico || '—')) + '</div>' +
      (ch.pct_sla_consumido == null ? '<p class="msg msg-aviso">Dados insuficientes para calcular o consumo do SLA. Nenhum ajuste por risco foi aplicado às notas, e o sistema não inventa percentual nem classificação.</p>' : '') +
      '<div class="caixa-risco r-' + nivel.nivel + '"><b>Nível de risco considerado: ' + ROTULO_NIVEL[nivel.nivel] + '</b> ' + A.dica('Baixo: abaixo de 50% do SLA. Médio: 50% a 90%. Alto: 90% ou mais. Probabilidade de violação a partir de 70% eleva um nível.') +
      '<ul>' + nivel.motivos.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      (ajustadas ? '<p>' + ajustadas + ' notas de “Redução do risco” e “Adequação à prioridade” foram <b>ajustadas por este nível de risco</b> (marcadas com •). Você pode alterá-las.</p>' : '<p>Nenhuma nota foi ajustada: o risco médio usa as notas iniciais.</p>') + '</div>' +
      '<h4>Por que este chamado pode exigir análise</h4>' + (motivos.length ? '<ul class="motivos">' + motivos.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '<p class="vazio">Nenhum critério de atenção acionado.</p>');
  }

  function desenharAlternativas() {
    var m = E.matriz;
    document.getElementById('m-alternativas').innerHTML =
      '<p class="nota">Marque as alternativas que entram na comparação, escreva observações e, se quiser, acrescente outras. Nenhuma alternativa é escondida por ter pontuação baixa.</p>' +
      '<div class="rolagem"><table class="tabela"><thead><tr><th>Comparar</th><th>Alternativa</th><th>Observações do decisor</th><th></th></tr></thead><tbody>' +
      m.alternativas.map(function (a, i) {
        return '<tr><td><input type="checkbox" data-ativa="' + i + '"' + (a.ativa ? ' checked' : '') + ' aria-label="Comparar ' + esc(a.nome) + '"></td><td><b>' + esc(a.nome) + '</b>' + (a.custom ? ' <span class="tag t-calc">nova</span>' : '') + '</td><td><input type="text" data-obs="' + i + '" value="' + esc(a.obs) + '" placeholder="Observação (opcional)"></td><td>' + (a.custom ? '<button class="btn btn-leve btn-mini" data-remover="' + i + '" type="button">Remover</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="barra-acoes"><input id="m-nova" type="text" placeholder="Nova alternativa (ex.: Acionar fornecedor)"><button id="m-add" class="btn btn-leve" type="button">Adicionar alternativa</button></div>' +
      '<p class="nota">Uma alternativa nova começa sem notas. Enquanto faltar nota em algum critério, ele fica de fora do cálculo para todas as alternativas.</p>';
  }

  function desenharPesos() {
    var m = E.matriz;
    document.getElementById('m-pesos').innerHTML =
      '<p class="nota">Defina a importância de cada critério. A pontuação usa a soma ponderada dividida pela soma dos pesos, então a soma não precisa ser exatamente 100%.</p>' +
      '<div class="pesos">' + E.criterios.map(function (c, j) {
        return '<div class="peso"><label for="peso-' + j + '">' + esc(c.nome) + ' ' + A.dica(c.descricao || '') + ' <span class="tag ' + (c.origem === 'sistema' ? 't-calc' : 't-ok') + '">' + (c.origem === 'sistema' ? 'sistema' : 'decisor') + '</span></label><div class="peso-linha"><input id="peso-' + j + '" type="range" min="0" max="100" step="1" value="' + m.pesos[j] + '" data-peso="' + j + '"><output id="pv-' + j + '">' + A.n1(m.pesos[j]) + '%</output></div></div>';
      }).join('') + '</div>' +
      '<div class="barra-acoes"><span id="peso-soma" class="contagem"></span><span class="esp"></span><button id="p-restaurar" class="btn btn-leve" type="button">Restaurar pesos</button><button id="p-normalizar" class="btn btn-leve" type="button">Normalizar para 100%</button></div>' +
      (m.vipSugerido ? '<p class="msg msg-info">Chamado VIP: o critério “Condição VIP” recebeu peso sugerido de ' + (E.padrao.peso_vip_sugerido || 10) + '% e os demais foram reduzidos proporcionalmente.</p>' : '');
    atualizarSoma();
  }

  function atualizarSoma() {
    var s = E.matriz.pesos.reduce(function (a, b) { return a + b; }, 0), el = document.getElementById('peso-soma');
    if (el) el.textContent = 'Soma dos pesos: ' + A.n1(s) + '%' + (Math.abs(s - 100) > 0.05 ? ' (use “Normalizar para 100%” se quiser)' : '');
  }

  function desenharMatrizTabela() {
    var m = E.matriz, r = calcular(), crits = nomesCriterios(), calc = r.calc;
    var cab = crits.map(function (n, j) {
      var cls = calc.usados.indexOf(j) >= 0 ? '' : ' class="fora"';
      return '<th' + cls + '>' + esc(n) + '<span class="peso-cab">' + A.n1(m.pesos[j]) + '%</span></th>';
    }).join('');
    var linhas = m.alternativas.map(function (a, i) {
      var cel = crits.map(function (n, j) {
        var ops = '<option value="">—</option>' + [1, 2, 3, 4, 5].map(function (v) { return '<option value="' + v + '"' + (a.notas[j] === v ? ' selected' : '') + '>' + v + '</option>'; }).join('');
        var o = a.origem[j];
        var marca = o === 'ajustada' ? ' ajustada' : (o === 'editada' ? ' editada' : '');
        var tit = o === 'ajustada' ? 'Nota ajustada pelo nível de risco do chamado' : (o === 'editada' ? 'Nota alterada pelo decisor' : 'Nota inicial');
        return '<td class="' + (calc.usados.indexOf(j) >= 0 ? '' : 'fora') + '"><select class="nota-sel' + marca + '" data-a="' + i + '" data-c="' + j + '" title="' + tit + '" aria-label="' + esc(a.nome + ' - ' + n) + '"' + (a.ativa ? '' : ' disabled') + '>' + ops + '</select>' + (o === 'ajustada' ? '<span class="ponto" aria-hidden="true">•</span>' : '') + '</td>';
      }).join('');
      var p = calc.pontuacoes[i], pos = r.ordem.indexOf(i);
      return '<tr class="' + (a.ativa ? '' : 'inativa') + (pos === 0 ? ' melhor' : '') + '"><th class="alt-nome">' + esc(a.nome) + '<small>' + (a.ativa ? 'Ativa na comparação' : 'Fora da comparação') + '</small></th>' +
        '<td class="pont">' + (p == null ? '—' : '<b>' + A.n2(p) + '</b><small>/ 5' + (pos === 0 ? ' · maior pontuação' : '') + '</small>') + '</td>' + cel + '<td class="txt">' + esc(a.vantagem || '') + '</td><td class="txt">' + esc(a.limitacao || '') + '</td></tr>';
    }).join('');
    var aviso = '';
    if (calc.semNota.length) aviso += '<p class="msg msg-aviso">Critérios fora do cálculo por falta de nota em alguma alternativa ativa: ' + calc.semNota.map(function (j) { return esc(crits[j]); }).join(', ') + '.</p>';
    if (calc.usados.length === 0) aviso += '<p class="msg msg-aviso">Nenhum critério está completo e com peso maior que zero, então não há pontuação. O sistema não inventa valores.</p>';
    var ranking = r.ordem.length ? '<ol class="ranking">' + r.ordem.map(function (i, k) {
      return '<li><span class="rk-nome">' + esc(m.alternativas[i].nome) + (k === 0 ? ' <span class="tag t-ok">maior pontuação</span>' : '') + '</span><span class="rk-barra"><i style="width:' + Math.round(calc.pontuacoes[i] / 5 * 100) + '%"></i></span><b>' + A.n2(calc.pontuacoes[i]) + '</b></li>';
    }).join('') + '</ol>' : '';
    document.getElementById('m-matriz').innerHTML = ranking + aviso +
      '<div class="rolagem"><table class="tabela matriz"><thead><tr><th>Alternativas</th><th>Pontuação ponderada</th>' + cab + '<th>Vantagens</th><th>Limitações</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
      '<div class="aviso-apoio">A maior pontuação representa o melhor desempenho segundo os critérios e pesos atuais. <b>Ela não determina a decisão final.</b></div>' +
      '<details class="explica"><summary>Como a pontuação é calculada e quais são as limitações?</summary><p>Pontuação = soma de (nota × peso) ÷ soma dos pesos considerados. ' + esc(E.padrao.escala) + ' As notas iniciais são hipóteses de demonstração e precisam de validação humana. Se faltar uma nota em qualquer alternativa ativa, esse critério é excluído de todas, preservando uma base uniforme. Critérios com peso zero não influenciam o resultado. Dados ausentes não equivalem a risco zero. As notas marcadas com • foram ajustadas pelo nível de risco do chamado (Alto, Médio ou Baixo), e podem ser alteradas.</p></details>';
    if (document.getElementById('d-escolha')) atualizarOpcoesDecisao();
  }

  function montarDecisao() {
    var m = E.matriz, crits = nomesCriterios(), pode = A.podeDecidir();
    document.getElementById('m-decisao').innerHTML =
      '<p id="d-topo" class="nota"></p>' +
      '<div class="form-decisao"><label>Alternativa escolhida<select id="d-escolha"></select></label>' +
      '<label>Justificativa (obrigatória)<textarea id="d-just" rows="4" placeholder="Por que esta alternativa? Que conhecimento da operação não aparece nos dados?"' + (pode ? '' : ' disabled') + '>' + esc(m.justificativa) + '</textarea></label>' +
      '<fieldset><legend>Critérios mais relevantes para a escolha</legend><div class="checks">' + crits.map(function (n, j) { return '<label><input type="checkbox" data-rel="' + j + '"' + (m.relevantes[j] ? ' checked' : '') + (pode ? '' : ' disabled') + '> ' + esc(n) + '</label>'; }).join('') + '</div></fieldset></div>' +
      (pode ? '' : '<p class="msg msg-info">Seu perfil (analista) participa da análise, mas só o líder ou gestor registra a decisão.</p>') +
      '<div class="barra-acoes"><button id="d-registrar" class="btn btn-primario" type="button"' + (pode ? '' : ' disabled') + '>Registrar decisão</button><button id="d-exportar" class="btn btn-leve" type="button">Exportar matriz</button></div><p id="d-msg" class="msg" hidden></p>';
    atualizarOpcoesDecisao();
  }

  function atualizarOpcoesDecisao() {
    var m = E.matriz, r = calcular(), sel = document.getElementById('d-escolha');
    if (!sel) return;
    var atual = m.escolha;
    sel.innerHTML = '<option value="">Selecione…</option>' + m.alternativas.map(function (a, i) {
      if (!a.ativa) return '';
      var p = r.calc.pontuacoes[i];
      return '<option value="' + i + '"' + (String(atual) === String(i) ? ' selected' : '') + '>' + esc(a.nome) + (p == null ? '' : ' (' + A.n2(p) + ')') + (i === r.topo ? ' · maior pontuação' : '') + '</option>';
    }).join('');
    document.getElementById('d-topo').innerHTML = r.topo == null ? 'Ainda não há pontuação para comparar.' : 'Alternativa de maior pontuação: <b>' + esc(m.alternativas[r.topo].nome) + '</b> (' + A.n2(r.calc.pontuacoes[r.topo]) + '). Você pode escolher qualquer alternativa, inclusive uma de pontuação menor; nesse caso, explique na justificativa.';
  }

  function exportarMatriz() {
    var m = E.matriz, r = calcular(), crits = nomesCriterios();
    A.baixarCSV('matriz_' + m.numero + '.csv', ['Chamado', 'Alternativa', 'Na comparação'].concat(crits, ['Pontuação', 'Observações']),
      m.alternativas.map(function (a, i) { return [m.numero, a.nome, A.sn(a.ativa)].concat(a.notas.map(function (n) { return n == null ? '' : n; }), [r.calc.pontuacoes[i] == null ? '' : A.n2(r.calc.pontuacoes[i]), a.obs]); })
        .concat([[m.numero, 'PESOS (%)', ''].concat(m.pesos, ['', ''])]));
  }

  async function registrarDecisao(ch) {
    var m = E.matriz, r = calcular(), msg = document.getElementById('d-msg'), crits = nomesCriterios();
    function erro(t) { msg.className = 'msg msg-erro'; msg.textContent = t; msg.hidden = false; }
    if (!A.podeDecidir()) { erro('Seu perfil não pode registrar decisões.'); return; }
    if (r.topo == null) { erro('Não há pontuação calculada. Complete as notas e os pesos antes de registrar.'); return; }
    if (m.escolha === null || m.escolha === '') { erro('Escolha a alternativa que você decidiu adotar.'); return; }
    var just = document.getElementById('d-just').value.trim();
    if (just.length < 10) { erro('Escreva a justificativa da decisão (pelo menos 10 caracteres). Ela é parte do registro.'); return; }
    var esc_ = m.alternativas[Number(m.escolha)];
    var pesos = {}; crits.forEach(function (n, j) { pesos[n] = m.pesos[j]; });
    var notas = {}; m.alternativas.forEach(function (a) { if (a.ativa) { notas[a.nome] = {}; crits.forEach(function (n, j) { notas[a.nome][n] = a.notas[j]; }); } });
    var rel = crits.filter(function (n, j) { return m.relevantes[j]; });
    var botao = document.getElementById('d-registrar'); botao.disabled = true;
    try {
      await D.registrarDecisao({
        usuario_id: E.usuario.id, chamado_numero: ch.numero,
        alternativa_maior_pontuacao: m.alternativas[r.topo].nome, pontuacao_maior: L.arred(r.calc.pontuacoes[r.topo], 2),
        alternativa_escolhida: esc_.nome, pontuacao_escolhida: L.arred(r.calc.pontuacoes[Number(m.escolha)], 2),
        justificativa: just, criterios_relevantes: rel.join('; ') || null, pesos: pesos, notas: notas,
        contexto: { nivel_risco: m.nivel.nivel, pct_sla_consumido: ch.pct_sla_consumido, faixa: ch.faixa_consumo, prob_violacao: ch.prob_violacao, perfil: ch.perfil_analitico, vip: ch.vip, analista: ch.analista, prioridade: ch.prioridade }
      });
      m.justificativa = ''; m.escolha = null; m.relevantes = {};
      A.toast('Decisão registrada. Ela já aparece no Histórico de Decisões.');
      montarDecisao();
      var ok = document.getElementById('d-msg'); ok.className = 'msg msg-ok'; ok.innerHTML = 'Decisão registrada para ' + esc(ch.numero) + '. <button class="link" data-ir="historico" type="button">Ver no histórico</button>'; ok.hidden = false;
    } catch (e) { botao.disabled = false; erro(e.message); }
  }

  function desenharMatriz(c) {
    if (!E.chamados.length) { c.innerHTML = A.aviso() + A.vazio('Não há chamados ativos para analisar.'); return; }
    var ch = garantirMatriz();
    c.innerHTML = A.aviso() +
      '<div class="cartao"><div class="passo">1 · Escolha o chamado e veja o contexto</div><label class="inline">Chamado ' + seletorChamado('m-chamado', ch.numero) + '</label><div id="m-contexto"></div></div>' +
      '<div class="cartao"><div class="passo">2 · Alternativas de decisão</div><div id="m-alternativas"></div></div>' +
      '<div class="cartao"><div class="passo">3 · Importância dos critérios</div><div id="m-pesos"></div></div>' +
      '<div class="cartao"><div class="passo">4 · Matriz multicritério</div><p class="nota">Escala de 1 a 5. Nota 5 é a mais favorável à decisão em todos os critérios.</p><div id="m-matriz"></div></div>' +
      '<div class="cartao"><div class="passo">Registrar a decisão</div><div id="m-decisao"></div></div>';
    desenharContexto(ch); desenharAlternativas(); desenharPesos(); desenharMatrizTabela(); montarDecisao();

    document.getElementById('m-chamado').addEventListener('change', function (e) { A.selecionarChamado(e.target.value); desenharMatriz(c); });
    var m = E.matriz;
    var alts = document.getElementById('m-alternativas');
    alts.addEventListener('change', function (e) {
      var i = e.target.getAttribute('data-ativa'); if (i === null) return;
      m.alternativas[Number(i)].ativa = e.target.checked; if (!e.target.checked && String(m.escolha) === i) m.escolha = null;
      desenharMatrizTabela();
    });
    alts.addEventListener('input', function (e) { var i = e.target.getAttribute('data-obs'); if (i !== null) m.alternativas[Number(i)].obs = e.target.value; });
    alts.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remover]');
      if (rm) { m.alternativas.splice(Number(rm.getAttribute('data-remover')), 1); m.escolha = null; desenharAlternativas(); desenharMatrizTabela(); return; }
      if (e.target.id === 'm-add') {
        var nome = document.getElementById('m-nova').value.trim();
        if (!nome) { A.toast('Digite o nome da nova alternativa.', 'erro'); return; }
        if (m.alternativas.some(function (a) { return a.nome.toLowerCase() === nome.toLowerCase(); })) { A.toast('Já existe uma alternativa com esse nome.', 'erro'); return; }
        m.alternativas.push({ nome: nome, ativa: true, obs: '', custom: true, vantagem: '', limitacao: '', notas: E.criterios.map(function () { return null; }), origem: E.criterios.map(function () { return 'vazia'; }) });
        desenharAlternativas(); desenharMatrizTabela();
      }
    });
    var pesosEl = document.getElementById('m-pesos');
    pesosEl.addEventListener('input', function (e) {
      var j = e.target.getAttribute('data-peso'); if (j === null) return;
      m.pesos[Number(j)] = Number(e.target.value); document.getElementById('pv-' + j).textContent = A.n1(m.pesos[Number(j)]) + '%'; atualizarSoma(); desenharMatrizTabela();
    });
    pesosEl.addEventListener('click', function (e) {
      if (e.target.id === 'p-restaurar') { m.pesos = m.pesosIniciais.slice(); desenharPesos(); desenharMatrizTabela(); }
      if (e.target.id === 'p-normalizar') { m.pesos = L.normalizarPesos(m.pesos); desenharPesos(); desenharMatrizTabela(); }
    });
    document.getElementById('m-matriz').addEventListener('change', function (e) {
      var a = e.target.getAttribute('data-a'), j = e.target.getAttribute('data-c'); if (a === null) return;
      var alt = m.alternativas[Number(a)]; alt.notas[Number(j)] = e.target.value === '' ? null : Number(e.target.value); alt.origem[Number(j)] = 'editada';
      desenharMatrizTabela();
    });
    var dec = document.getElementById('m-decisao');
    dec.addEventListener('change', function (e) {
      if (e.target.id === 'd-escolha') m.escolha = e.target.value === '' ? null : Number(e.target.value);
      var rj = e.target.getAttribute('data-rel'); if (rj !== null) m.relevantes[Number(rj)] = e.target.checked;
    });
    dec.addEventListener('input', function (e) { if (e.target.id === 'd-just') m.justificativa = e.target.value; });
    dec.addEventListener('click', function (e) {
      if (e.target.id === 'd-registrar') registrarDecisao(ch);
      if (e.target.id === 'd-exportar') exportarMatriz();
    });
  }

  // ====================================================== ANÁLISE DE SENSIBILIDADE
  function cartaoRanking(titulo, pesos) {
    var m = E.matriz, calc = L.pontuar(m.alternativas, pesos), ordem = L.ordenar(calc.pontuacoes);
    return '<div class="cartao"><h3>' + titulo + '</h3>' + (ordem.length ? '<ol class="ranking">' + ordem.map(function (i, k) {
      return '<li><span class="rk-nome">' + esc(m.alternativas[i].nome) + (k === 0 ? ' <span class="tag t-ok">maior pontuação</span>' : '') + '</span><span class="rk-barra"><i style="width:' + Math.round(calc.pontuacoes[i] / 5 * 100) + '%"></i></span><b>' + A.n2(calc.pontuacoes[i]) + '</b></li>';
    }).join('') + '</ol>' : '<p class="vazio">Sem pontuação para estes pesos.</p>') + '</div>';
  }

  function desenharComparacao() {
    var m = E.matriz, sim = E.sim;
    var a = L.pontuar(m.alternativas, m.pesos), b = L.pontuar(m.alternativas, sim.pesos), oa = L.ordenar(a.pontuacoes), ob = L.ordenar(b.pontuacoes);
    document.getElementById('s-cenarios').innerHTML = cartaoRanking('Cenário original (pesos da matriz)', m.pesos) + cartaoRanking('Cenário simulado', sim.pesos);
    var msg;
    if (!oa.length || !ob.length) msg = 'Sem pontuação em um dos cenários.';
    else if (oa[0] === ob[0]) msg = 'A alternativa de maior pontuação continua sendo <b>' + esc(m.alternativas[ob[0]].nome) + '</b> nos dois cenários.';
    else msg = 'A alternativa de maior pontuação mudou: de <b>' + esc(m.alternativas[oa[0]].nome) + '</b> para <b>' + esc(m.alternativas[ob[0]].nome) + '</b>.';
    document.getElementById('s-msg').innerHTML = msg;
    var rb = L.robustez(m.alternativas, sim.pesos), el = document.getElementById('s-rob');
    if (!rb) { el.innerHTML = '<p class="vazio">Sem pontuação para testar a robustez.</p>'; return; }
    var crits = nomesCriterios();
    el.innerHTML = '<p>Mudando o peso de cada critério em ±10 pontos, a alternativa de maior pontuação (<b>' + esc(m.alternativas[rb.topo].nome) + '</b>) se mantém em <b>' + rb.mantem + ' de ' + rb.total + '</b> variações.' + (rb.margem != null ? ' Diferença para a 2ª colocada: <b>' + A.n2(rb.margem) + '</b> ponto(s).' : '') + '</p>' +
      (rb.margem != null && rb.margem < 0.1 ? '<p class="msg msg-aviso">A diferença é muito pequena: o resultado é sensível aos pesos e vale olhar também as outras alternativas.</p>' : '') +
      (rb.trocas.length ? '<ul class="motivos">' + rb.trocas.slice(0, 4).map(function (t) { return '<li>Se “' + esc(crits[t.criterio]) + '” ' + (t.delta > 0 ? 'ganhar' : 'perder') + ' 10 pontos, “' + esc(m.alternativas[t.novoTopo].nome) + '” passa à frente.</li>'; }).join('') + '</ul>' : '<p class="nota">Nenhuma dessas variações troca a alternativa de maior pontuação.</p>');
  }

  async function carregarSalvos(numero) {
    var el = document.getElementById('s-salvos'); if (!el) return;
    try {
      var lista = await D.listarCenarios(numero);
      E.sim.salvos = lista;
      el.innerHTML = lista.length ? '<ul class="lista-salvos">' + lista.map(function (s) {
        var top = Object.keys(s.ranking || {}).sort(function (x, y) { return s.ranking[y] - s.ranking[x]; })[0];
        return '<li><b>' + esc(s.nome) + '</b> <small>' + A.dataHoraBR(s.criado_em) + '</small> · maior pontuação: ' + esc(top || '—') + '</li>';
      }).join('') + '</ul>' : '<p class="vazio">Nenhum cenário salvo para este chamado.</p>';
    } catch (e) { el.innerHTML = '<p class="msg msg-erro">' + esc(e.message) + '</p>'; }
  }

  function tabelaCenarios() {
    var m = E.matriz, sim = E.sim, salvos = (sim.salvos || []).slice(0, 4);
    var cols = [{ t: 'Original', r: rankingObj(m.pesos) }, { t: 'Simulado', r: rankingObj(sim.pesos) }].concat(salvos.map(function (s) { return { t: s.nome, r: s.ranking || {} }; }));
    function rankingObj(pesos) { var c = L.pontuar(m.alternativas, pesos), o = {}; m.alternativas.forEach(function (a, i) { if (c.pontuacoes[i] != null) o[a.nome] = c.pontuacoes[i]; }); return o; }
    var nomes = m.alternativas.map(function (a) { return a.nome; });
    document.getElementById('s-tabela').innerHTML = '<div class="rolagem"><table class="tabela"><thead><tr><th>Alternativa</th>' + cols.map(function (c) { return '<th>' + esc(c.t) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      nomes.map(function (n) { return '<tr><td>' + esc(n) + '</td>' + cols.map(function (c) { var topo = Object.keys(c.r).sort(function (x, y) { return c.r[y] - c.r[x]; })[0]; return '<td class="num' + (topo === n ? ' melhor-cel' : '') + '">' + (c.r[n] == null ? '—' : A.n2(c.r[n])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }

  function desenharSensibilidade(c) {
    if (!E.chamados.length) { c.innerHTML = A.aviso() + A.vazio('Não há chamados ativos para analisar.'); return; }
    var ch = garantirMatriz(), m = E.matriz;
    if (!E.sim || E.sim.numero !== m.numero) E.sim = { numero: m.numero, pesos: m.pesos.slice(), salvos: [] };
    var sim = E.sim, crits = nomesCriterios();
    c.innerHTML = A.aviso() +
      '<div class="cartao"><label class="inline">Chamado analisado ' + seletorChamado('s-chamado', ch.numero) + '</label> ' + A.faixa(ch.faixa_consumo) + ' <span class="nota">Risco considerado: ' + ROTULO_NIVEL[m.nivel.nivel] + '</span>' +
      '<p class="nota">Mude os pesos e veja como o ranking das alternativas reage. As notas são as da Matriz de Decisão para este chamado.</p></div>' +
      '<div class="cartao"><h3>Pesos do cenário simulado</h3><div class="pesos">' + crits.map(function (n, j) {
        return '<div class="peso"><label for="sp-' + j + '">' + esc(n) + '</label><div class="peso-linha"><input id="sp-' + j + '" type="range" min="0" max="100" step="1" value="' + sim.pesos[j] + '" data-sp="' + j + '"><output id="spv-' + j + '">' + A.n1(sim.pesos[j]) + '%</output></div></div>';
      }).join('') + '</div>' +
      '<div class="barra-acoes"><button id="s-restaurar" class="btn btn-leve" type="button">Restaurar pesos</button>' +
      (A.podeDecidir() ? '<input id="s-nome" type="text" placeholder="Nome do cenário"><button id="s-salvar" class="btn btn-leve" type="button">Salvar cenário</button>' : '') +
      '<button id="s-comparar" class="btn btn-leve" type="button">Comparar cenários</button><button id="s-usar" class="btn btn-primario" type="button">Usar pesos no caso atual</button></div></div>' +
      '<p id="s-msg" class="destaque-msg"></p><div id="s-cenarios" class="grade-2"></div>' +
      '<div class="cartao"><h3>Teste de robustez ' + A.dica('Varia o peso de cada critério em 10 pontos para mais e para menos e conta quantas vezes a alternativa de maior pontuação continua a mesma.') + '</h3><div id="s-rob"></div></div>' +
      '<div class="cartao"><h3>Cenários salvos</h3><div id="s-salvos"><p class="vazio">Carregando…</p></div><div id="s-tabela"></div></div>';
    desenharComparacao(); carregarSalvos(m.numero);
    document.getElementById('s-chamado').addEventListener('change', function (e) { A.selecionarChamado(e.target.value); desenharSensibilidade(c); });
    c.addEventListener('input', function (e) {
      var j = e.target.getAttribute && e.target.getAttribute('data-sp'); if (j === null || j === undefined) return;
      sim.pesos[Number(j)] = Number(e.target.value); document.getElementById('spv-' + j).textContent = A.n1(sim.pesos[Number(j)]) + '%'; desenharComparacao();
    });
    document.getElementById('s-restaurar').addEventListener('click', function () { sim.pesos = m.pesos.slice(); desenharSensibilidade(c); });
    document.getElementById('s-usar').addEventListener('click', function () { m.pesos = sim.pesos.slice(); A.toast('Pesos aplicados à Matriz de Decisão deste chamado.'); A.navegar('matriz'); });
    document.getElementById('s-comparar').addEventListener('click', tabelaCenarios);
    var salvar = document.getElementById('s-salvar');
    if (salvar) salvar.addEventListener('click', async function () {
      var nome = document.getElementById('s-nome').value.trim();
      if (!nome) { A.toast('Dê um nome ao cenário antes de salvar.', 'erro'); return; }
      var calc = L.pontuar(m.alternativas, sim.pesos), pesos = {}, rank = {};
      crits.forEach(function (n, j) { pesos[n] = sim.pesos[j]; });
      m.alternativas.forEach(function (a, i) { if (calc.pontuacoes[i] != null) rank[a.nome] = L.arred(calc.pontuacoes[i], 2); });
      try { await D.salvarCenario({ usuario_id: E.usuario.id, chamado_numero: m.numero, nome: nome, pesos: pesos, ranking: rank }); A.toast('Cenário salvo.'); document.getElementById('s-nome').value = ''; carregarSalvos(m.numero); }
      catch (e) { A.toast(e.message, 'erro'); }
    });
  }

  // ======================================================= HISTÓRICO DE DECISÕES
  async function desenharHistorico(c) {
    c.innerHTML = A.aviso() + '<p class="vazio">Carregando decisões…</p>';
    var lista, perfis, aut;
    try { lista = await D.listarDecisoes(); perfis = await D.listarPerfis(); aut = await D.autonomia(); }
    catch (e) { c.innerHTML = A.aviso() + '<p class="msg msg-erro">' + esc(e.message) + '</p>'; return; }
    var nomePor = {}; perfis.forEach(function (p) { nomePor[p.id] = p.nome; });
    var filtro = 'todas';
    c.innerHTML = A.aviso() +
      '<div class="cartao"><h3>Autonomia do decisor ' + A.dica('Percentual de decisões em que o responsável escolheu uma alternativa diferente da de maior pontuação. Mostra, em números, que a pontuação apoia a decisão, mas não a determina.') + '</h3><div class="kpi-grande">' + (aut && aut.pct_autonomia != null ? A.n1(Number(aut.pct_autonomia)) + '%' : '—') + '</div><p class="nota">' + (aut && aut.decisoes > 0 ? A.n0(aut.diferentes) + ' de ' + A.n0(aut.decisoes) + ' decisões diferiram da maior pontuação.' : 'Ainda não há decisões registradas.') + '</p></div>' +
      '<div class="cartao"><h3>Decisões registradas</h3><div class="barra-acoes"><label class="inline">Filtro <select id="h-filtro"><option value="todas">Todas</option><option value="igual">Igual à maior pontuação</option><option value="diferente">Diferente da maior pontuação</option></select></label><span class="esp"></span><button id="h-exportar" class="btn btn-leve" type="button"' + (lista.length ? '' : ' disabled') + '>Exportar registros</button></div><div id="h-tabela"></div></div>';
    function visiveis() { return lista.filter(function (d) { var dif = d.alternativa_escolhida !== d.alternativa_maior_pontuacao; return filtro === 'todas' || (filtro === 'diferente' ? dif : !dif); }); }
    function tabela() {
      var v = visiveis();
      if (!lista.length) { document.getElementById('h-tabela').innerHTML = '<div class="vazio-grande"><p><b>Seu raciocínio também faz parte dos dados.</b></p><p>Registre uma escolha na matriz de decisão para iniciar o histórico.</p><button class="btn btn-primario" data-ir="matriz" type="button">Abrir matriz de decisão</button></div>'; return; }
      document.getElementById('h-tabela').innerHTML = '<div class="rolagem"><table class="tabela"><thead><tr><th>ID anônimo</th><th>Data da análise</th><th>Maior pontuação</th><th>Escolha do decisor</th><th>Pontuação</th><th>Justificativa</th><th>Critérios relevantes</th><th>Responsável</th><th>Resultado posterior</th></tr></thead><tbody>' +
        v.map(function (d) {
          var dif = d.alternativa_escolhida !== d.alternativa_maior_pontuacao;
          return '<tr><td><b>' + esc(d.chamado_numero) + '</b></td><td>' + A.dataHoraBR(d.data_analise) + '</td><td>' + esc(d.alternativa_maior_pontuacao) + ' <small>(' + A.n2(Number(d.pontuacao_maior)) + ')</small></td><td>' + esc(d.alternativa_escolhida) + (dif ? ' <span class="tag t-aviso">diferente</span>' : '') + '</td><td class="num">' + A.n2(Number(d.pontuacao_escolhida)) + '</td><td class="txt">' + esc(d.justificativa) + '</td><td class="txt">' + esc(d.criterios_relevantes || '—') + '</td><td>' + esc(nomePor[d.usuario_id] || '—') + '</td><td>' +
            (d.usuario_id === E.usuario.id ? '<input type="text" data-res="' + esc(d.id) + '" value="' + esc(d.resultado_posterior || '') + '" placeholder="Registrar resultado"><button class="btn btn-leve btn-mini" data-salvar-res="' + esc(d.id) + '" type="button">Salvar</button>' : esc(d.resultado_posterior || '—')) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    tabela();
    document.getElementById('h-filtro').addEventListener('change', function (e) { filtro = e.target.value; tabela(); });
    document.getElementById('h-exportar').addEventListener('click', function () {
      A.baixarCSV('historico_decisoes_SAD-SLA.csv', ['ID anônimo', 'Data da análise', 'Maior pontuação', 'Pontuação maior', 'Escolha do decisor', 'Pontuação escolhida', 'Justificativa', 'Critérios relevantes', 'Responsável', 'Resultado posterior'],
        visiveis().map(function (d) { return [d.chamado_numero, A.dataHoraBR(d.data_analise), d.alternativa_maior_pontuacao, d.pontuacao_maior, d.alternativa_escolhida, d.pontuacao_escolhida, d.justificativa, d.criterios_relevantes || '', nomePor[d.usuario_id] || '', d.resultado_posterior || '']; }));
    });
    document.getElementById('h-tabela').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-salvar-res]'); if (!b) return;
      var id = b.getAttribute('data-salvar-res'), inp = document.querySelector('[data-res="' + id + '"]');
      try { await D.atualizarResultado(id, inp.value.trim()); lista.forEach(function (d) { if (d.id === id) d.resultado_posterior = inp.value.trim(); }); A.toast('Resultado posterior salvo.'); }
      catch (err) { A.toast(err.message, 'erro'); }
    });
  }

  // ========================================================= FUNÇÕES ANALÍTICAS
  function mediana(v) { var s = v.slice().sort(function (a, b) { return a - b; }), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }

  function desenharFuncoes(c) {
    var h = E.historico, rel = (E.modelo && E.modelo.relatorio) || null;
    if (!rel) { c.innerHTML = A.aviso() + '<p class="msg msg-erro">O arquivo dados/modelo.json não contém o relatório do modelo. Rode analytics/treinar_modelos.py.</p>'; return; }
    var violados = h.filter(function (x) { return x.sla_violado; }).length;
    var vc = rel.classificacao.validacao, lr = vc.regressao_logistica, base = vc.baseline_classe_majoritaria, sem = vc.regressao_logistica_sem_atualizacoes, rf = vc.random_forest_comparacao, tmp = vc.temporal_70_30, mc = vc.matriz_confusao_limiar_0_5;
    function m(o, k) { return A.n2(o[k].media).replace(',', ',') + ' ± ' + A.n2(o[k].desvio); }
    function kp(r, v, sub) { return '<div class="kpi"><div class="kpi-rotulo">' + r + '</div><div class="kpi-valor">' + v + '</div>' + (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>'; }
    function mv(o, k) { return kp0(o, k); }
    function kp0(o, k) { return A.n2(o[k].media); }
    function dv(o, k) { return '± ' + A.n2(o[k].desvio) + ' entre as validações'; }
    function nomeVar(v) { return String(v).replace('log_atualizacoes (padronizada)', 'Atualizações (escala log, padronizada)').replace('prioridade_num (padronizada)', 'Prioridade (número, padronizada)').replace('GrupoAtribuicao', 'Grupo de atribuição'); }
    c.innerHTML = A.aviso() +
      '<div class="cartao destaque"><h2>Funções analíticas</h2><p>Três funções alimentam a decisão: <b>sumarização</b> (contexto da fila e da base histórica), <b>agrupamento</b> (perfis de chamados parecidos) e <b>classificação</b> (probabilidade de violação do SLA). Elas dão contexto à decisão; não decidem por ninguém.</p></div>' +
      '<div class="cartao"><h3>1 · Sumarização</h3><p class="nota">Entrada: ' + h.length + ' incidentes encerrados da base histórica anonimizada. Processamento: contagens e taxas por prioridade e categoria (consultas no banco de dados). Resultado decisório: mostra onde o risco histórico se concentra e alimenta o contexto de cada chamado.</p>' +
      '<div class="kpis">' + kp('Chamados na base', A.n0(h.length)) + kp('Taxa geral de violação', A.pct(h.length ? violados / h.length * 100 : null)) + kp('Mediana de horas decorridas', A.n1(mediana(h.map(function (x) { return Number(x.tempo_decorrido_horas); })))) + kp('Mediana de atualizações', A.n0(mediana(h.map(function (x) { return Number(x.qtd_atualizacoes); })))) + '</div>' +
      '<div class="grade-2"><div class="grafico"><canvas id="f-prio" aria-label="Violação por prioridade"></canvas></div><div class="grafico"><canvas id="f-cat" aria-label="Violação por categoria"></canvas></div></div></div>' +
      '<div class="cartao"><h3>2 · Agrupamento (K-means)</h3><p class="nota">Entrada: tempo decorrido, atualizações (ambos em log10(x+1)) e prioridade, padronizados. Processamento: K-means, com k escolhido pelo maior índice de silhouette (k = ' + rel.agrupamento.k + ', silhouette ' + A.n2(rel.agrupamento.silhouette) + '). Resultado decisório: o perfil de cada chamado ativo aparece como contexto; ele não define a decisão.</p>' +
      '<div class="rolagem"><table class="tabela"><thead><tr><th>Perfil</th><th>Chamados</th><th>Mediana de horas</th><th>Mediana de atualizações</th><th>Prioridade média</th><th>Taxa de violação</th></tr></thead><tbody>' +
      rel.agrupamento.perfis.map(function (p) { return '<tr><td><b>' + esc(p.nome) + '</b></td><td class="num">' + A.n0(p.chamados) + '</td><td class="num">' + A.n1(p.mediana_horas) + '</td><td class="num">' + A.n0(p.mediana_atualizacoes) + '</td><td class="num">' + A.n2(p.prioridade_media) + '</td><td class="num">' + A.pct(p.taxa_violacao_sla) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="nota">Nomes dos perfis dados pelo autor a partir das características de cada grupo: menor taxa de violação = fluxo regular; entre os demais, prioridade mais urgente = urgentes em atraso; o outro = backlog prolongado (baixa prioridade parada).</p>' +
      '<div class="grafico grande"><canvas id="f-disp" aria-label="Dispersão dos grupos"></canvas></div></div>' +
      '<div class="cartao"><h3>3 · Classificação (regressão logística)</h3><p class="nota">Entrada: prioridade, atualizações (log), categoria e grupo de atribuição. Alvo: SLA violado (sim/não). Processamento: regressão logística treinada offline com os ' + h.length + ' chamados. Resultado decisório: a probabilidade de violação vira contexto do chamado e eleva o nível de risco quando é 70% ou mais.</p>' +
      '<h4>Validação: ' + esc(vc.procedimento) + '</h4><div class="kpis">' + kp('Acurácia', mv(lr, 'accuracy'), dv(lr, 'accuracy')) + kp('Precisão', mv(lr, 'precision'), dv(lr, 'precision')) + kp('Recall', mv(lr, 'recall'), dv(lr, 'recall')) + kp('F1-score', mv(lr, 'f1'), dv(lr, 'f1')) + kp('AUC (ROC)', mv(lr, 'roc_auc'), dv(lr, 'roc_auc')) + '</div>' +
      '<div class="rolagem"><table class="tabela"><thead><tr><th>Modelo / variante</th><th>Acurácia</th><th>F1</th><th>AUC</th></tr></thead><tbody>' +
      '<tr><td>Referência: sempre prever a classe mais comum</td><td class="num">' + m(base, 'accuracy') + '</td><td class="num">' + m(base, 'f1') + '</td><td class="num">' + m(base, 'roc_auc') + '</td></tr>' +
      '<tr class="melhor"><td><b>Regressão logística (modelo usado)</b></td><td class="num">' + m(lr, 'accuracy') + '</td><td class="num">' + m(lr, 'f1') + '</td><td class="num">' + m(lr, 'roc_auc') + '</td></tr>' +
      '<tr><td>Regressão logística sem a variável “atualizações”</td><td class="num">' + m(sem, 'accuracy') + '</td><td class="num">' + m(sem, 'f1') + '</td><td class="num">' + m(sem, 'roc_auc') + '</td></tr>' +
      '<tr><td>Random forest (comparação)</td><td class="num">' + m(rf, 'accuracy') + '</td><td class="num">' + m(rf, 'f1') + '</td><td class="num">' + m(rf, 'roc_auc') + '</td></tr></tbody></table></div>' +
      '<div class="grade-2"><div><h4>Matriz de confusão (limiar 0,5)</h4><table class="tabela conf"><thead><tr><th></th><th>Previsto: no prazo</th><th>Previsto: violado</th></tr></thead><tbody><tr><th>Real: no prazo</th><td class="num">' + mc.verdadeiro_negativo + '</td><td class="num">' + mc.falso_positivo + '</td></tr><tr><th>Real: violado</th><td class="num">' + mc.falso_negativo + '</td><td class="num">' + mc.verdadeiro_positivo + '</td></tr></tbody></table>' +
      '<p class="nota">Distribuição: ' + (h.length - violados) + ' chamados no prazo e ' + violados + ' com SLA violado.</p></div>' +
      '<div><h4>Validação temporal</h4><p>Treino nos ' + tmp.treino + ' chamados mais antigos e teste nos ' + tmp.teste + ' mais recentes: acurácia <b>' + A.n2(tmp.acuracia) + '</b> (referência ' + A.n2(tmp.acuracia_baseline) + ')' + (tmp.roc_auc != null ? ', AUC <b>' + A.n2(tmp.roc_auc) + '</b>' : '') + '.</p></div></div>' +
      '<h4>Variáveis que mais pesam</h4><div class="rolagem"><table class="tabela"><thead><tr><th>Variável</th><th>Coeficiente</th><th>Efeito</th></tr></thead><tbody>' +
      rel.classificacao.coeficientes.slice(0, 8).map(function (k) { return '<tr><td>' + esc(nomeVar(k.variavel)) + '</td><td class="num">' + A.n2(k.coeficiente) + '</td><td>' + (k.coeficiente > 0 ? 'aumenta a chance de violação' : 'reduz a chance de violação') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="msg msg-aviso">Atenção: a quantidade de atualizações cresce com o tempo em que o chamado fica aberto, então parte do seu poder de previsão vem disso. Por isso a variante sem essa variável também é mostrada. O analista não entra no modelo, para não avaliar pessoas.</p></div>' +
      '<p class="msg msg-info">As métricas apresentadas dependem da qualidade, da representatividade e do volume dos dados utilizados.</p>';

    var cat = E.porCategoria.slice().sort(function (a, b) { return Number(a.pct_violacao) - Number(b.pct_violacao); });
    A.grafico('f-cat', { type: 'bar', data: { labels: cat.map(function (x) { return x.categoria + ' (n=' + x.chamados + ')'; }), datasets: [{ label: '% de violação', data: cat.map(function (x) { return Number(x.pct_violacao); }), backgroundColor: '#e0503c' }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Violação por categoria (%) — n = chamados da categoria' } }, scales: { x: { beginAtZero: true, max: 100 } } } });
    var pr = E.porPrioridade.slice();
    A.grafico('f-prio', { type: 'bar', data: { labels: pr.map(function (x) { return 'P' + String(x.prioridade).split(' - ')[0] + ' (n=' + x.chamados + ')'; }), datasets: [{ label: '% de violação', data: pr.map(function (x) { return Number(x.pct_violacao); }), backgroundColor: '#2f5d8f' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: 'Violação por prioridade (%) — n = chamados da prioridade' } }, scales: { y: { beginAtZero: true, max: 100 } } } });
    var cores = { 'Fluxo regular': '#2e9e6b', 'Backlog prolongado': '#f08a24', 'Urgentes em atraso': '#e0503c' };
    var nomes = rel.agrupamento.perfis.map(function (p) { return p.nome; });
    A.grafico('f-disp', { type: 'scatter', data: { datasets: nomes.map(function (n, i) { return { label: n, backgroundColor: cores[n] || ['#2f5d8f', '#7a5aa6', '#8a96a8'][i % 3], data: h.filter(function (x) { return x.perfil_analitico === n; }).map(function (x) { return { x: Math.log10(Number(x.tempo_decorrido_horas) + 1), y: Math.log10(Number(x.qtd_atualizacoes) + 1) }; }) }; }) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Grupos de chamados' } }, scales: { x: { title: { display: true, text: 'log10(horas decorridas + 1)' } }, y: { title: { display: true, text: 'log10(atualizações + 1)' } } } } });
  }

  A.registrar({ id: 'matriz', titulo: 'Matriz de Decisão', icone: 'grid', perfis: TODOS, desenhar: desenharMatriz, ordem: 4 });
  A.registrar({ id: 'sensibilidade', titulo: 'Análise de Sensibilidade', icone: 'sliders', perfis: DECISOR, desenhar: desenharSensibilidade, ordem: 5 });
  A.registrar({ id: 'historico', titulo: 'Histórico de Decisões', icone: 'clock', perfis: DECISOR, desenhar: desenharHistorico, ordem: 6 });
  A.registrar({ id: 'funcoes', titulo: 'Funções Analíticas', icone: 'chart', perfis: DECISOR, desenhar: desenharFuncoes, ordem: 7 });
})(window);
