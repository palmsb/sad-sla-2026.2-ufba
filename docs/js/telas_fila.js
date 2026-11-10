/* SAD-SLA - telas: Visão Geral, Importar Dados, Análise da Fila, Sobre o SAD. */
(function (raiz) {
  'use strict';
  var A = raiz.SADApp, L = raiz.SADLogica, D = raiz.SADDados, E = A.estado, esc = A.esc;
  var TODOS = ['analista', 'gestor', 'administrador'];

  // ============================================================ VISÃO GERAL
  function indicadores(ch) {
    var comDados = ch.filter(function (c) { return c.pct_sla_consumido != null; });
    return {
      ativos: ch.length,
      atrasados: ch.filter(function (c) { return c.sla_violado === true; }).length,
      criticos: ch.filter(function (c) { return c.faixa_consumo === 'Crítico'; }).length,
      semAnalista: ch.filter(function (c) { return !c.analista; }).length,
      vipAtencao: ch.filter(function (c) { return c.vip && c.pct_sla_consumido != null && c.pct_sla_consumido >= 75; }).length,
      semDados: ch.length - comDados.length,
      media: comDados.length ? comDados.reduce(function (s, c) { return s + c.pct_sla_consumido; }, 0) / comDados.length : null
    };
  }

  function desenharVisaoGeral(c) {
    var ch = E.chamados;
    if (!ch.length) {
      c.innerHTML = A.aviso() + A.vazio('Não há chamados ativos na base.' + (A.podeImportar() ? ' Importe uma planilha para começar.' : ' Peça a um analista para importar a fila.'),
        A.podeImportar() ? '<button class="btn btn-primario" data-ir="importar">Importar dados</button>' : '');
      return;
    }
    var k = indicadores(ch);
    function cartao(rotulo, valor, dica, cls, filtro) {
      return '<div class="kpi ' + (cls || '') + '"' + (filtro ? ' data-filtro="' + filtro + '" role="button" tabindex="0"' : '') + '><div class="kpi-rotulo">' + rotulo + ' ' + A.dica(dica) + '</div><div class="kpi-valor">' + valor + '</div></div>';
    }
    var pontos = [];
    if (k.atrasados) pontos.push(['atrasado', k.atrasados + (k.atrasados === 1 ? ' chamado ultrapassou' : ' chamados ultrapassaram') + ' 100% do SLA.']);
    if (k.criticos) pontos.push(['critico', k.criticos + (k.criticos === 1 ? ' chamado está' : ' chamados estão') + ' em faixa crítica (90% a 100%).']);
    if (k.semAnalista) pontos.push(['semanalista', k.semAnalista + (k.semAnalista === 1 ? ' chamado está' : ' chamados estão') + ' sem analista responsável.']);
    if (k.vipAtencao) pontos.push(['vip', k.vipAtencao + (k.vipAtencao === 1 ? ' chamado VIP está' : ' chamados VIP estão') + ' com 75% ou mais do SLA consumido.']);
    if (k.semDados) pontos.push(['semdados', k.semDados + (k.semDados === 1 ? ' chamado está' : ' chamados estão') + ' sem tempo decorrido: o consumo do SLA não pôde ser calculado.']);

    c.innerHTML = A.aviso() +
      '<div class="barra-acoes">' +
      (A.podeImportar() ? '<button class="btn btn-leve" data-ir="importar">Importar dados</button>' : '') +
      '<button class="btn btn-primario" data-ir="matriz">Abrir matriz de decisão</button></div>' +
      '<div class="kpis">' +
      cartao('Chamados ativos', A.n0(k.ativos), 'Chamados abertos na fila no momento da análise.', '', '') +
      cartao('Atrasados', A.n0(k.atrasados), 'SLA já violado: mais de 100% do prazo contratado consumido.', 'k-atrasado', 'atrasado') +
      cartao('Faixa crítica', A.n0(k.criticos), 'Entre 90% e 100% do prazo consumido: ainda no prazo, mas quase vencendo.', 'k-critico', 'critico') +
      cartao('Sem analista', A.n0(k.semAnalista), 'Chamados ativos sem responsável atribuído.', 'k-atencao', 'semanalista') +
      cartao('VIP em atenção', A.n0(k.vipAtencao), 'Chamados VIP com 75% ou mais do SLA consumido (faixas Atenção, Crítico ou Atrasado).', 'k-vip', 'vip') +
      cartao('SLA médio consumido', A.pct(k.media), 'Média do percentual de SLA consumido, considerando só os chamados com tempo decorrido informado.', '', '') +
      '</div>' +
      '<div class="grade-graficos">' +
      '<div class="cartao"><h3>Chamados ativos por faixa de SLA</h3><div class="grafico"><canvas id="g-faixa" aria-label="Distribuição por faixa de SLA"></canvas></div></div>' +
      '<div class="cartao"><h3>Chamados ativos por prioridade</h3><div class="grafico"><canvas id="g-prio" aria-label="Chamados por prioridade"></canvas></div></div>' +
      '<div class="cartao"><h3>Violação histórica por categoria ' + A.dica('Contexto histórico: % de chamados já encerrados que violaram o SLA, por categoria. Vem da base de ' + E.historico.length + ' chamados.') + '</h3><div class="grafico"><canvas id="g-cat" aria-label="Violação histórica por categoria"></canvas></div></div>' +
      '<div class="cartao"><h3>Pontos de atenção</h3>' + (pontos.length ? '<ul class="pontos">' + pontos.map(function (p) {
        return '<li class="pt-' + p[0] + '"><button type="button" class="link" data-filtro="' + p[0] + '">' + esc(p[1]) + '</button></li>';
      }).join('') + '</ul>' : '<p class="vazio">Nenhum ponto de atenção na fila.</p>') +
      '<p class="nota">Clique em um item para ver os chamados na Análise da Fila.</p></div>' +
      '</div>' +
      '<div class="legenda">' + L.FAIXAS.map(function (f) { return '<span>' + A.faixa(f.nome) + ' ' + f.texto + '</span>'; }).join('') + '<span>' + A.faixa(L.SEM_DADOS) + ' sem tempo decorrido</span></div>';

    var nomes = L.FAIXAS.map(function (f) { return f.nome; }).concat([L.SEM_DADOS]);
    A.grafico('g-faixa', { type: 'doughnut', data: { labels: nomes, datasets: [{ data: nomes.map(function (n) { return ch.filter(function (c) { return c.faixa_consumo === n; }).length; }), backgroundColor: nomes.map(function (n) { return A.CORES_FAIXA[n]; }), borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
    var prios = ['P1', 'P2', 'P3', 'P4', 'Standard'];
    A.grafico('g-prio', { type: 'bar', data: { labels: prios, datasets: [{ label: 'Chamados', data: prios.map(function (p) { return ch.filter(function (c) { return A.rotuloPrioridade(c) === p || (p === 'Standard' && !c.prioridade_num); }).length; }), backgroundColor: '#2f5d8f' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    var cat = E.porCategoria.slice().sort(function (a, b) { return Number(b.pct_violacao) - Number(a.pct_violacao); });
    A.grafico('g-cat', { type: 'bar', data: { labels: cat.map(function (x) { return x.categoria + ' (n=' + x.chamados + ')'; }), datasets: [{ label: '% violação', data: cat.map(function (x) { return Number(x.pct_violacao); }), backgroundColor: '#e0503c' }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, max: 100 } } } });
  }

  // ====================================================== IMPORTAR DADOS
  async function decodificarCSV(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch (e) { return new TextDecoder('windows-1252').decode(buffer); }
  }

  async function lerArquivo(file) {
    if (!raiz.XLSX) throw new Error('A biblioteca de leitura de planilhas não carregou. Confira a internet e recarregue a página.');
    var buffer = await file.arrayBuffer();
    var csv = /\.csv$/i.test(file.name), wb;
    if (csv) wb = raiz.XLSX.read(await decodificarCSV(buffer), { type: 'string', raw: true });   // raw: não reinterpreta datas dd/mm
    else wb = raiz.XLSX.read(buffer, { type: 'array', cellDates: true });
    var ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('A planilha está vazia.');
    var linhas = raiz.XLSX.utils.sheet_to_json(ws, { defval: null });
    var cab = (raiz.XLSX.utils.sheet_to_json(ws, { header: 1 })[0] || []).map(String);
    if (!cab.length || !linhas.length) throw new Error('Não encontrei linhas de dados na primeira aba da planilha.');
    return { linhas: linhas, cab: cab };
  }

  function baixarModelo() {
    if (!raiz.XLSX) { A.toast('Biblioteca de planilhas não carregou.', 'erro'); return; }
    var cab = L.CAMPOS.map(function (c) { return c.rotulo; });
    var ex = [
      ['INC_0001', 'INCIDENTE', '2 - Alta', 'Trabalho em andamento', 'GRUPO-A', 'ANALISTA_001', 'Software', '2026-11-03', 'Employee', 5, 21600, false],
      ['REQ_0001', 'REQUISIÇÃO', 'Standard', 'Novo', 'GRUPO-B', 'SEM-ANALISTA', 'Acessos', '2026-11-03', 'VIP', 0, 7200, true]
    ];
    var wb = raiz.XLSX.utils.book_new();
    raiz.XLSX.utils.book_append_sheet(wb, raiz.XLSX.utils.aoa_to_sheet([cab].concat(ex)), 'Fila');
    var instr = [['Coluna', 'Obrigatória', 'Observação']].concat(L.CAMPOS.map(function (c) { return [c.rotulo, c.obrigatorio ? 'Sim' : 'Não', c.dica || '']; }));
    instr.push([]); instr.push(['Use dados anonimizados. Chamados encerrados ou cancelados são ignorados na fila ativa.']);
    raiz.XLSX.utils.book_append_sheet(wb, raiz.XLSX.utils.aoa_to_sheet(instr), 'Instrucoes');
    raiz.XLSX.writeFile(wb, 'modelo_fila_SAD-SLA.xlsx');
  }

  function painelResultado(r, nome) {
    var bloq = r.bloqueios.length > 0;
    var linhasCols = r.colunas.map(function (c) {
      var st = c.encontrada ? '<span class="tag t-ok">Encontrada</span>' : (c.obrigatorio ? '<span class="tag t-erro">Ausente (obrigatória)</span>' : '<span class="tag t-aviso">Ausente</span>');
      return '<tr><td>' + esc(c.rotulo) + (c.dica ? ' ' + A.dica(c.dica) : '') + '</td><td>' + st + '</td><td>' + (c.coluna ? esc(c.coluna) : '—') + '</td></tr>';
    }).join('');
    ['HorasContratadasSLA', '% de SLA consumido', 'Faixa de risco', 'Probabilidade de violação', 'Perfil analítico'].forEach(function (n) {
      linhasCols += '<tr><td>' + n + '</td><td><span class="tag t-calc">Calculada pelo sistema</span></td><td>—</td></tr>';
    });
    return '<div class="cartao"><h3>Resultado da leitura: ' + esc(nome) + '</h3>' +
      '<div class="resumo-imp">' +
      '<div><b>' + A.n0(r.registros) + '</b><span>registros</span></div><div><b>' + A.n0(r.colunasTotal) + '</b><span>colunas</span></div>' +
      '<div><b>' + A.n0(r.incidentes) + '</b><span>incidentes</span></div><div><b>' + A.n0(r.requisicoes) + '</b><span>requisições</span></div>' +
      '<div><b>' + A.n0(r.validos) + '</b><span>registros válidos</span></div><div><b>' + A.n0(r.invalidos.length) + '</b><span>inválidos</span></div>' +
      '<div><b>' + A.n0(r.semTempo) + '</b><span>sem tempo decorrido</span></div><div><b>' + A.n0(r.semAnalista) + '</b><span>sem analista</span></div>' +
      '<div><b>' + A.n0(r.encerrados + r.cancelados) + '</b><span>encerrados/cancelados (ignorados)</span></div><div><b>' + A.n0(r.ativos.length) + '</b><span>entram na fila ativa</span></div></div>' +
      r.bloqueios.map(function (m) { return '<p class="msg msg-erro">' + esc(m) + '</p>'; }).join('') +
      r.avisos.map(function (m) { return '<p class="msg msg-aviso">' + esc(m) + '</p>'; }).join('') +
      (r.invalidos.length ? '<details class="msg msg-aviso"><summary>' + r.invalidos.length + ' registro(s) inválido(s) serão ignorados</summary><ul>' + r.invalidos.slice(0, 15).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + (r.invalidos.length > 15 ? '<li>…</li>' : '') + '</ul></details>' : '') +
      (r.semTempo ? '<p class="msg msg-info">' + r.semTempo + ' chamado(s) sem tempo decorrido ficarão como “' + L.SEM_DADOS + '”: o sistema não inventa percentual nem faixa.</p>' : '') +
      '<h4>Validação das colunas</h4><div class="rolagem"><table class="tabela"><thead><tr><th>Coluna esperada</th><th>Situação</th><th>Coluna no arquivo</th></tr></thead><tbody>' + linhasCols + '</tbody></table></div>' +
      '<div class="barra-acoes"><button id="imp-executar" class="btn btn-primario" type="button"' + (bloq || !r.ativos.length ? ' disabled' : '') + '>Executar análise e salvar na fila</button></div>' +
      (!bloq && !r.ativos.length ? '<p class="msg msg-aviso">Nenhum chamado ativo para analisar neste arquivo.</p>' : '') +
      '</div>';
  }

  async function processarArquivo(file) {
    var alvo = document.getElementById('imp-resultado');
    alvo.innerHTML = '<p class="vazio">Lendo o arquivo…</p>';
    try {
      var lido = await lerArquivo(file);
      var r = L.validarPlanilha(lido.linhas, lido.cab, E.modelo);
      E.importacao = { nome: file.name, resultado: r };
      alvo.innerHTML = painelResultado(r, file.name);
      var b = document.getElementById('imp-executar');
      if (b) b.addEventListener('click', executarAnalise);
    } catch (e) {
      E.importacao = null;
      alvo.innerHTML = '<p class="msg msg-erro">' + esc(e.message || e) + '</p>';
    }
  }

  async function executarAnalise() {
    var b = document.getElementById('imp-executar'), r = E.importacao && E.importacao.resultado;
    if (!r) return;
    b.disabled = true; b.textContent = 'Salvando…';
    try {
      var res = await D.salvarFila(r.ativos);
      await A.recarregarBase();
      A.toast('Análise concluída: ' + res.gravados + ' chamados na fila' + (res.removidos ? ' (' + res.removidos + ' antigos removidos)' : '') + '.');
      E.importacao = null; A.navegar('visao-geral');
    } catch (e) {
      A.toast(e.message, 'erro'); b.disabled = false; b.textContent = 'Executar análise e salvar na fila';
    }
  }

  function desenharImportar(c) {
    c.innerHTML = A.aviso() +
      '<div class="cartao"><h3>Importar a fotografia atual da fila</h3>' +
      '<p>Importe a fotografia atual de incidentes e requisições para executar a análise decisória. Formatos aceitos: <b>XLSX</b> e <b>CSV</b> (primeira aba). Use dados anonimizados.</p>' +
      '<label class="drop" id="drop" for="arquivo"><input id="arquivo" type="file" accept=".xlsx,.xls,.csv"><span><b>Escolha um arquivo</b> ou arraste até aqui</span></label>' +
      '<div class="barra-acoes"><button id="imp-modelo" class="btn btn-leve" type="button">Baixar modelo de planilha</button></div>' +
      '<p class="nota">Ao executar a análise, a fila atual é substituída pelos chamados ativos do arquivo. Chamados encerrados ou cancelados são ignorados.</p></div>' +
      '<div id="imp-resultado"></div>';
    var inp = document.getElementById('arquivo'), drop = document.getElementById('drop');
    inp.addEventListener('change', function () { if (inp.files[0]) processarArquivo(inp.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('sobre'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('sobre'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) processarArquivo(f); });
    document.getElementById('imp-modelo').addEventListener('click', baixarModelo);
    if (E.importacao) { document.getElementById('imp-resultado').innerHTML = painelResultado(E.importacao.resultado, E.importacao.nome); var b = document.getElementById('imp-executar'); if (b) b.addEventListener('click', executarAnalise); }
  }

  // ======================================================== ANÁLISE DA FILA
  function filtrar() {
    var f = E.filtros, q = f.busca.trim().toLowerCase();
    var r = E.chamados.filter(function (c) {
      if (f.tipo && c.tipo_chamado !== f.tipo) return false;
      if (f.prioridade && A.rotuloPrioridade(c) !== f.prioridade) return false;
      if (f.faixa && c.faixa_consumo !== f.faixa) return false;
      if (f.vip && String(c.vip) !== (f.vip === 'sim' ? 'true' : 'false')) return false;
      if (f.analista === 'com' && !c.analista) return false;
      if (f.analista === 'sem' && c.analista) return false;
      if (q && String(c.numero).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var chaves = {
      pct_desc: function (a, b) { return (b.pct_sla_consumido == null ? -1 : b.pct_sla_consumido) - (a.pct_sla_consumido == null ? -1 : a.pct_sla_consumido); },
      pct_asc: function (a, b) { return (a.pct_sla_consumido == null ? 1e9 : a.pct_sla_consumido) - (b.pct_sla_consumido == null ? 1e9 : b.pct_sla_consumido); },
      prob_desc: function (a, b) { return (b.prob_violacao == null ? -1 : b.prob_violacao) - (a.prob_violacao == null ? -1 : a.prob_violacao); },
      id: function (a, b) { return String(a.numero).localeCompare(String(b.numero)); }
    };
    return r.sort(chaves[f.ordem] || chaves.pct_desc);
  }

  function probTexto(c) {
    if (c.sla_violado) return '<span class="tag t-erro" title="O SLA já foi violado; a estimativa do modelo não se aplica.">SLA já violado</span>';
    if (c.prob_violacao == null) return '<span title="O modelo foi treinado só com incidentes">—</span>';
    return A.pctProb(c.prob_violacao);
  }

  function desenharTabela() {
    var lista = filtrar(), alvo = document.getElementById('tabela-fila');
    document.getElementById('fila-contagem').textContent = lista.length + ' de ' + E.chamados.length + ' chamados';
    if (!lista.length) { alvo.innerHTML = '<p class="vazio">Nenhum chamado com esses filtros.</p>'; return; }
    alvo.innerHTML = '<div class="rolagem"><table class="tabela tabela-fila"><thead><tr>' +
      ['ID anônimo', 'Prioridade', '% SLA', 'Faixa de risco', 'Prob. violação <span class="dica" tabindex="0" title="' + esc(A.TIP_PROB) + '">?</span>', 'Tipo', 'Analista', 'VIP', 'Estado', 'Categoria', 'Atualiz.', 'Horas (decorr. / contr.)', 'Perfil analítico', ''].map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + lista.map(function (c) {
        return '<tr><td><b>' + esc(c.numero) + '</b></td><td>' + esc(A.rotuloPrioridade(c)) + '</td><td class="num">' + A.pct(c.pct_sla_consumido) + '</td><td>' + A.faixa(c.faixa_consumo) + '</td><td class="num">' + probTexto(c) + '</td><td>' + (c.tipo_chamado === 'INCIDENTE' ? 'Incidente' : 'Requisição') + '</td><td>' + (c.analista ? esc(c.analista) : '<span class="tag t-aviso">Sem analista</span>') + '</td><td>' + (c.vip ? '<span class="tag t-vip">VIP</span>' : 'Não') + '</td><td>' + esc(c.estado) + '</td><td class="cel-cat" title="' + esc(c.categoria) + '">' + esc(c.categoria) + '</td><td class="num">' + A.n0(c.qtd_atualizacoes) + '</td><td class="num">' + (c.tempo_decorrido_horas == null ? '—' : A.n1(c.tempo_decorrido_horas)) + ' / ' + A.n0(c.horas_contratadas) + ' h</td><td>' + esc(c.perfil_analitico || '—') + '</td><td class="acoes"><button class="btn btn-leve btn-mini" data-detalhe="' + esc(c.numero) + '">Detalhes</button> <button class="btn btn-primario btn-mini" data-analisar="' + esc(c.numero) + '">Analisar</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function opt(v, t, sel) { return '<option value="' + esc(v) + '"' + (sel === v ? ' selected' : '') + '>' + esc(t) + '</option>'; }

  function desenharFila(c) {
    var f = E.filtros;
    if (!E.chamados.length) { c.innerHTML = A.aviso() + A.vazio('Não há chamados ativos na base.'); return; }
    c.innerHTML = A.aviso() +
      '<div class="cartao filtros">' +
      '<label>Buscar ID<input id="f-busca" type="search" placeholder="ex.: INC_9001" value="' + esc(f.busca) + '"></label>' +
      '<label>Tipo<select id="f-tipo">' + opt('', 'Todos', f.tipo) + opt('INCIDENTE', 'Incidente', f.tipo) + opt('REQUISIÇÃO', 'Requisição', f.tipo) + '</select></label>' +
      '<label>Prioridade<select id="f-prioridade">' + opt('', 'Todas', f.prioridade) + ['P1', 'P2', 'P3', 'P4', 'Standard'].map(function (p) { return opt(p, p, f.prioridade); }).join('') + '</select></label>' +
      '<label>Faixa de risco<select id="f-faixa">' + opt('', 'Todas', f.faixa) + L.FAIXAS.map(function (x) { return opt(x.nome, x.nome, f.faixa); }).join('') + opt(L.SEM_DADOS, L.SEM_DADOS, f.faixa) + '</select></label>' +
      '<label>VIP<select id="f-vip">' + opt('', 'Todos', f.vip) + opt('sim', 'Sim', f.vip) + opt('nao', 'Não', f.vip) + '</select></label>' +
      '<label>Analista<select id="f-analista">' + opt('', 'Todos', f.analista) + opt('com', 'Com analista', f.analista) + opt('sem', 'Sem analista', f.analista) + '</select></label>' +
      '<label class="larga">Ordenar por<select id="f-ordem">' + opt('pct_desc', '% de SLA consumido (maior primeiro)', f.ordem) + opt('pct_asc', '% de SLA consumido (menor primeiro)', f.ordem) + opt('prob_desc', 'Probabilidade de violação', f.ordem) + opt('id', 'ID', f.ordem) + '</select></label>' +
      '</div>' +
      '<div class="barra-acoes"><span id="fila-contagem" class="contagem"></span><span class="esp"></span>' +
      '<button id="f-limpar" class="btn btn-leve" type="button">Limpar filtros</button><button id="f-exportar" class="btn btn-leve" type="button">Exportar análise</button></div>' +
      '<div id="tabela-fila"></div>' +
      '<div class="legenda">' + L.FAIXAS.map(function (x) { return '<span>' + A.faixa(x.nome) + ' ' + x.texto + '</span>'; }).join('') + '<span>' + A.faixa(L.SEM_DADOS) + '</span></div>';
    var campos = { 'f-busca': 'busca', 'f-tipo': 'tipo', 'f-prioridade': 'prioridade', 'f-faixa': 'faixa', 'f-vip': 'vip', 'f-analista': 'analista', 'f-ordem': 'ordem' };
    Object.keys(campos).forEach(function (id) {
      document.getElementById(id).addEventListener(id === 'f-busca' ? 'input' : 'change', function (e) { E.filtros[campos[id]] = e.target.value; desenharTabela(); });
    });
    document.getElementById('f-limpar').addEventListener('click', function () {
      E.filtros = { tipo: '', prioridade: '', faixa: '', vip: '', analista: '', busca: '', ordem: 'pct_desc' }; desenharFila(c);
    });
    document.getElementById('f-exportar').addEventListener('click', function () {
      var lista = filtrar();
      A.baixarCSV('analise_fila_SAD-SLA.csv', ['ID', 'Tipo', 'Prioridade', 'Estado', 'Categoria', 'VIP', 'Analista', 'Atualizacoes', 'Horas contratadas', 'Horas decorridas', '% SLA consumido', 'Faixa de risco', 'SLA violado', 'Prob. violacao (%)', 'Perfil analitico'],
        lista.map(function (x) { return [x.numero, x.tipo_chamado, A.rotuloPrioridade(x), x.estado, x.categoria, A.sn(x.vip), x.analista || 'Sem analista', x.qtd_atualizacoes, x.horas_contratadas, x.tempo_decorrido_horas, x.pct_sla_consumido, x.faixa_consumo, A.sn(x.sla_violado), x.prob_violacao == null ? '' : Math.round(x.prob_violacao * 100), x.perfil_analitico || '']; }));
    });
    desenharTabela();
    document.getElementById('tabela-fila').addEventListener('click', function (e) {
      var d = e.target.closest('[data-detalhe]'), a = e.target.closest('[data-analisar]');
      if (d) A.detalhesChamado(d.dataset.detalhe);
      if (a) { A.selecionarChamado(a.dataset.analisar); A.navegar('matriz'); }
    });
  }

  A.detalhesChamado = function (numero) {
    var c = A.chamadoPorNumero(numero); if (!c) return;
    var motivos = L.motivosAnalise(c, E.taxaCategoria[c.categoria] != null ? E.taxaCategoria[c.categoria] : null);
    var restante = c.sla_violado ? 'Excedidas: ' + A.n1(c.horas_excedidas) + ' h' : 'Restantes: ' + A.n1(c.horas_restantes) + ' h';
    function li(r, v) { return '<div class="par"><span>' + r + '</span><b>' + v + '</b></div>'; }
    A.abrirModal('<h3>' + esc(c.numero) + '</h3><div class="grade-par">' +
      li('Tipo', c.tipo_chamado === 'INCIDENTE' ? 'Incidente' : 'Requisição') + li('Prioridade', esc(c.prioridade || '—')) + li('Estado', esc(c.estado)) + li('Categoria', esc(c.categoria)) +
      li('VIP', A.sn(c.vip)) + li('Analista', c.analista ? esc(c.analista) : 'Sem analista') + li('Atualizações', A.n0(c.qtd_atualizacoes)) + li('Criado em', A.dataBR(c.data_criacao)) +
      li('Horas contratadas', A.n0(c.horas_contratadas) + ' h') + li('Horas decorridas', c.tempo_decorrido_horas == null ? '—' : A.n1(c.tempo_decorrido_horas) + ' h') +
      li('Horas restantes / excedidas', c.tempo_decorrido_horas == null ? '—' : restante) + li('% de SLA consumido', A.pct(c.pct_sla_consumido)) +
      li('Faixa de risco', A.faixa(c.faixa_consumo)) + li('Prob. de violação', c.sla_violado ? 'SLA já violado' : A.pctProb(c.prob_violacao)) + li('Perfil analítico', esc(c.perfil_analitico || '—')) + '</div>' +
      (c.pct_sla_consumido == null ? '<p class="msg msg-aviso">Dados insuficientes para calcular o consumo do SLA. O sistema não inventa percentual nem faixa.</p>' : '') +
      '<h4>Por que este chamado pode exigir análise</h4>' + (motivos.length ? '<ul class="motivos">' + motivos.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '<p class="vazio">Nenhum critério de atenção acionado.</p>') +
      '<div class="barra-acoes"><button class="btn btn-primario" data-analisar-modal="' + esc(c.numero) + '">Analisar na matriz de decisão</button></div>');
  };

  // ============================================================ SOBRE O SAD
  function desenharSobre(c) {
    var etapas = ['Importar dados', 'Validar e tratar', 'Sumarizar o contexto', 'Identificar perfis', 'Estimar o risco', 'Apresentar alternativas', 'Calcular critérios', 'Ajustar pesos', 'Comparar na matriz', 'Escolher e justificar'];
    var regras = E.regras.length ? E.regras.map(function (r) { return [r.descricao, r.horas_contratadas]; }) :
      [['Incidente VIP', 8], ['Incidente P1', 4], ['Incidente P2', 8], ['Incidente P3', 16], ['Incidente P4', 24], ['Requisição VIP', 24], ['Requisição standard', 72]];
    var h = E.historico, p4 = h.filter(function (x) { return x.prioridade_num === 4; }).length;
    c.innerHTML = A.aviso() +
      '<div class="cartao destaque"><h2>Mais clareza para decidir. Não uma decisão por você.</h2>' +
      '<p>O SAD-SLA organiza os chamados ativos, calcula o consumo do SLA, estima o risco de violação e coloca as alternativas de ação lado a lado. Quem decide é a pessoa responsável, que pode escolher qualquer alternativa e registra a justificativa.</p></div>' +
      '<div class="cartao"><h3>Do dado à decisão registrada</h3><ol class="fluxo">' + etapas.map(function (e, i) { return '<li><span class="n">' + (i + 1) + '</span>' + esc(e) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="grade-2">' +
      '<div class="cartao"><h3>Por que é um SAD</h3><ul class="lista">' +
      ['Organiza os dados e estrutura o problema', 'Aplica critérios uniformes a todas as alternativas', 'Permite mudar pesos e comparar cenários', 'Torna o raciocínio transparente', 'Mantém a decisão final com o usuário'].map(function (t) { return '<li class="sim">' + t + '</li>'; }).join('') + '</ul></div>' +
      '<div class="cartao"><h3>O que o sistema não faz</h3><ul class="lista">' +
      ['Não decide automaticamente', 'Não substitui o conhecimento do responsável', 'Não elimina alternativas por baixa pontuação', 'Não inventa dados ausentes', 'Não transforma previsão em decisão', 'Não trata a maior pontuação como obrigação'].map(function (t) { return '<li class="nao">' + t + '</li>'; }).join('') + '</ul></div></div>' +
      '<div class="grade-2">' +
      '<div class="cartao"><h3>Regras de SLA do protótipo</h3><table class="tabela"><thead><tr><th>Tipo de chamado</th><th>Horas contratadas</th></tr></thead><tbody>' + regras.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td class="num">' + A.n0(r[1]) + ' h</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="nota">A condição VIP vale mais que a prioridade, e as horas informadas na importação valem mais que o padrão.</p></div>' +
      '<div class="cartao"><h3>Faixas de consumo do SLA</h3><table class="tabela"><tbody>' + L.FAIXAS.map(function (f) { return '<tr><td>' + A.faixa(f.nome) + '</td><td>' + f.texto + '</td></tr>'; }).join('') + '<tr><td>' + A.faixa(L.SEM_DADOS) + '</td><td>sem tempo decorrido</td></tr></tbody></table>' +
      '<p class="nota">Chamados encerrados ou resolvidos são finalizados. Chamados cancelados não contam como resolução e não permitem decisão operacional.</p></div></div>' +
      '<div class="cartao"><h3>Como o resultado analítico entra na decisão</h3><ul class="lista"><li>O <b>% de SLA consumido</b> e a <b>probabilidade de violação</b> definem o nível de risco do chamado: baixo (abaixo de 50%), médio (50% a 90%) ou alto (90% ou mais). Probabilidade de 70% ou mais eleva o risco em um nível.</li><li>O nível de risco ajusta as <b>notas sugeridas</b> de “Redução do risco” e “Adequação à prioridade”: ações mais intensas ficam mais adequadas quando o risco é maior, e menos quando é menor. As células ajustadas aparecem marcadas e continuam editáveis.</li><li>Chamados VIP recebem peso sugerido para o critério “Condição VIP”.</li><li>Os <b>pesos iniciais</b> dos critérios vêm de uma ordem de importância definida pela autora, transformada em pesos pelo método Rank Order Centroid (ROC). O decisor pode alterá-los a qualquer momento.</li><li>O <b>perfil analítico</b> (agrupamento) e o histórico por categoria aparecem como contexto para o decisor.</li></ul></div>' +
      '<div class="cartao"><h3>Limitações</h3><ul class="lista">' +
      '<li class="aviso">Base histórica reduzida: ' + A.n0(h.length) + ' incidentes encerrados' + (h.length ? ', dos quais ' + Math.round(p4 / h.length * 100) + '% são P4' : '') + '. Poucos casos de prioridades altas.</li>' +
      '<li class="aviso">O modelo foi treinado só com incidentes e sem chamados VIP; para requisições não há estimativa de violação.</li>' +
      '<li class="aviso">A quantidade de atualizações é a variável mais influente e cresce com o tempo aberto; sem ela, o desempenho do modelo cai.</li>' +
      '<li class="aviso">A ordem de importância dos critérios, as notas iniciais da matriz e os ajustes por risco são julgamentos da autora (hipóteses de demonstração, não efeitos operacionais medidos) e precisam de validação humana.</li>' +
      '<li class="aviso">Dados fictícios e anonimizados; a qualidade dos resultados depende da qualidade, da representatividade e do volume dos dados.</li>' +
      '<li class="aviso">Chamados sem tempo decorrido não recebem percentual nem classificação artificial.</li></ul></div>';
  }

  // ============================================================ registro
  A.registrar({ id: 'visao-geral', titulo: 'Visão Geral', icone: 'home', perfis: TODOS, desenhar: desenharVisaoGeral });
  A.registrar({ id: 'importar', titulo: 'Importar Dados', icone: 'upload', perfis: ['analista', 'administrador'], desenhar: desenharImportar });
  A.registrar({ id: 'fila', titulo: 'Análise da Fila', icone: 'list', perfis: TODOS, desenhar: desenharFila });
  A.registrar({ id: 'sobre', titulo: 'Sobre o SAD', icone: 'info', perfis: TODOS, desenhar: desenharSobre, ordem: 99 });

  // Atalhos dos "Pontos de atenção" e dos cartões: abrem a fila já filtrada.
  A.aplicarAtalhoFiltro = function (chave) {
    E.filtros = { tipo: '', prioridade: '', faixa: '', vip: '', analista: '', busca: '', ordem: 'pct_desc' };
    if (chave === 'atrasado') E.filtros.faixa = 'Atrasado';
    if (chave === 'critico') E.filtros.faixa = 'Crítico';
    if (chave === 'semanalista') E.filtros.analista = 'sem';
    if (chave === 'vip') E.filtros.vip = 'sim';
    if (chave === 'semdados') E.filtros.faixa = L.SEM_DADOS;
    A.navegar('fila');
  };
})(window);
