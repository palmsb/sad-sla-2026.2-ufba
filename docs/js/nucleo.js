/* SAD-SLA - estado compartilhado e utilitários de interface. */
(function (raiz) {
  'use strict';
  var L = raiz.SADLogica;

  var A = raiz.SADApp = {
    VERSAO: 'v1.0 · protótipo',
    AVISO: 'A análise apoia. Você decide.',
    estado: {
      usuario: null, nome: '', perfil: '',
      chamados: [], criterios: [], alternativas: [], regras: [], historico: [],
      porCategoria: [], porPrioridade: [], taxaCategoria: {}, taxaGeral: null,
      modelo: null, padrao: null,
      filtros: { tipo: '', prioridade: '', faixa: '', vip: '', analista: '', busca: '', ordem: 'pct_desc' },
      selecionado: null, matriz: null, sim: null, importacao: null
    },
    rotas: [], graficos: []
  };
  A.registrar = function (rota) { A.rotas.push(rota); };

  // ------------------------------------------------------------- formatação
  A.esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function fixo(v, c) { return v == null || isNaN(v) ? '—' : L.arred(Number(v), c).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }); }
  A.n0 = function (v) { return fixo(v, 0); };
  A.n1 = function (v) { return fixo(v, 1); };
  A.n2 = function (v) { return fixo(v, 2); };
  A.pct = function (v) { return v == null ? '—' : fixo(v, 1) + '%'; };
  A.pctProb = function (v) { return v == null ? '—' : (v > 0 && v < 0.005 ? '<1%' : Math.round(v * 100) + '%'); };
  A.TIP_PROB = 'Estimativa do modelo com base no perfil do chamado (prioridade, categoria, grupo e atualizações). NÃO considera o tempo já consumido, que aparece no % SLA. Os dois sinais se complementam.';
  A.dataBR = function (iso) {
    if (!iso) return '—'; var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '—';
  };
  A.dataHoraBR = function (iso) { if (!iso) return '—'; var d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('pt-BR'); };
  A.sn = function (b) { return b == null ? '—' : (b ? 'Sim' : 'Não'); };
  A.dica = function (texto) { return '<span class="dica" tabindex="0" title="' + A.esc(texto) + '" aria-label="' + A.esc(texto) + '">?</span>'; };
  A.faixa = function (nome) { return '<span class="faixa f-' + L.classeFaixa(nome) + '">' + A.esc(nome) + '</span>'; };
  A.rotuloPrioridade = function (c) { return c.prioridade_num ? 'P' + c.prioridade_num : (c.prioridade || '—'); };

  A.CORES_FAIXA = { 'Normal': '#2e9e6b', 'Acompanhamento': '#e3b100', 'Atenção': '#f08a24', 'Crítico': '#e0503c', 'Atrasado': '#9b1c1c', 'Sem dados suficientes': '#8a96a8' };

  A.icone = function (nome) {
    var d = {
      home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
      upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
      grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
      sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'
    }[nome] || '';
    return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  };

  // ------------------------------------------------------------- interface
  var tempoToast = null;
  A.toast = function (msg, tipo) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.className = 'toast ' + (tipo || 'ok'); el.hidden = false;
    clearTimeout(tempoToast); tempoToast = setTimeout(function () { el.hidden = true; }, 5000);
  };
  A.abrirModal = function (html) {
    document.getElementById('modal-corpo').innerHTML = html; document.getElementById('modal').hidden = false;
  };
  A.fecharModal = function () { document.getElementById('modal').hidden = true; document.getElementById('modal-corpo').innerHTML = ''; };

  A.navegar = function (id) { if (location.hash === '#' + id) A.renderizarRota(); else location.hash = id; };

  A.limparGraficos = function () {
    A.graficos.forEach(function (g) { try { g.destroy(); } catch (e) { /* ignora */ } });
    A.graficos = [];
  };
  A.grafico = function (canvasId, config) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    if (!raiz.Chart) { canvas.parentNode.insertAdjacentHTML('beforeend', '<p class="vazio">Gráfico indisponível (biblioteca não carregada).</p>'); return null; }
    var cor = getComputedStyle(document.documentElement).getPropertyValue('--texto').trim() || '#1c2b3a';
    raiz.Chart.defaults.color = cor; raiz.Chart.defaults.font.family = 'inherit';
    var g = new raiz.Chart(canvas, config);
    A.graficos.push(g);
    return g;
  };

  // ---------------------------------------------------------------- arquivos
  A.baixarCSV = function (nome, colunas, linhas) {
    function cel(v) { var t = v == null ? '' : String(v); return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
    var txt = [colunas.map(cel).join(';')].concat(linhas.map(function (l) { return l.map(cel).join(';'); })).join('\r\n');
    var blob = new Blob(['\ufeff' + txt], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  };

  A.podeImportar = function () { return A.estado.perfil === 'analista' || A.estado.perfil === 'administrador'; };
  A.podeDecidir = function () { return A.estado.perfil === 'gestor' || A.estado.perfil === 'administrador'; };
  A.chamadoPorNumero = function (n) { return A.estado.chamados.filter(function (c) { return c.numero === n; })[0] || null; };

  A.aviso = function () { return '<div class="aviso-apoio"><strong>' + A.AVISO + '</strong> O sistema organiza os dados e compara alternativas; a decisão final é sempre da pessoa responsável.</div>'; };
  A.vazio = function (msg, botao) {
    return '<div class="cartao vazio-grande"><p>' + A.esc(msg) + '</p>' + (botao || '') + '</div>';
  };
})(window);
