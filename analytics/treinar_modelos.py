#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SAD-SLA - Funções analíticas: sumarização, agrupamento e classificação.

Lê a base histórica anonimizada e a fila ativa fictícia e produz:
  - docs/dados/modelo.json           parâmetros dos modelos, lidos pelo site
  - database/02_dados_iniciais.sql   dados para carregar no Supabase
  - documentacao/metricas.json       números para o relatório (validação, resumo)
  - documentacao/figuras/*.png       figuras para o relatório e o vídeo

Uso (de qualquer pasta):  python analytics/treinar_modelos.py
Pré-requisito: rodar antes analytics/gerar_fila_ficticia.py
"""
import json
import sys
import warnings
from datetime import date
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, roc_auc_score, roc_curve)
from sklearn.model_selection import (RepeatedStratifiedKFold, StratifiedKFold,
                                     cross_val_predict, cross_validate)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import agrupamento_chamado_kmeans as agr  # seu script de K-means, reaproveitado aqui

RAIZ = Path(__file__).resolve().parent.parent
BASE = RAIZ / "data" / "base_sad_sla_anonimizada.xlsx"
FILA = RAIZ / "data" / "fila_ficticia.xlsx"
SAIDA_MODELO = RAIZ / "docs" / "dados" / "modelo.json"
SAIDA_SQL = RAIZ / "database" / "02_dados_iniciais.sql"
SAIDA_METRICAS = RAIZ / "documentacao" / "metricas.json"
PASTA_FIGURAS = RAIZ / "documentacao" / "figuras"

SEMENTE = 42
FAIXAS = [  # (nome, limite inferior inclusivo, limite superior)
    ("Normal", 0, 50), ("Acompanhamento", 50, 75), ("Atenção", 75, 90),
    ("Crítico", 90, 100), ("Atrasado", 100, None),
]
REGRAS_SLA = [  # (tipo, prioridade, vip, horas, descrição)
    ("INCIDENTE", None, True, 8, "Incidente VIP"),
    ("INCIDENTE", "P1", False, 4, "Incidente P1"),
    ("INCIDENTE", "P2", False, 8, "Incidente P2"),
    ("INCIDENTE", "P3", False, 16, "Incidente P3"),
    ("INCIDENTE", "P4", False, 24, "Incidente P4"),
    ("REQUISIÇÃO", None, True, 24, "Requisição VIP"),
    ("REQUISIÇÃO", None, False, 72, "Requisição standard"),
]
CRITERIOS = [  # (nome, origem, peso inicial %, descrição)
    ("Redução do risco", "usuario", 25, "Quanto a ação reduz o risco de violar o SLA"),
    ("Velocidade", "usuario", 15, "Rapidez com que a ação produz efeito"),
    ("Esforço operacional", "usuario", 10, "Esforço necessário da equipe (nota maior = menos esforço)"),
    ("Impacto na fila", "usuario", 10, "Efeito da ação sobre os demais chamados da fila"),
    ("Adequação à prioridade", "usuario", 15, "Se a ação é proporcional à prioridade do chamado"),
    ("Viabilidade", "usuario", 15, "Se a ação pode ser executada na prática"),
    ("Disponibilidade", "usuario", 10, "Disponibilidade de pessoas para executar a ação"),
    ("Condição VIP", "sistema", 0, "Atenção especial a chamados de usuários VIP"),
    ("Envolvimento da liderança", "usuario", 0, "Necessidade de envolver a liderança"),
    ("Dependência profissional", "usuario", 0, "Dependência de um profissional específico"),
]
ALTERNATIVAS = [
    ("Manter no fluxo atual", "Seguir o atendimento sem mudança"),
    ("Priorizar o atendimento", "Colocar o chamado à frente na fila do analista"),
    ("Redistribuir para outro analista", "Trocar o responsável pelo chamado"),
    ("Escalonar para a liderança", "Levar o caso à liderança de TI"),
    ("Solicitar complementação de informações", "Pedir mais dados ao solicitante"),
]


# ------------------------------------------------------------------ utilidades
def faixa_consumo(pct):
    if pct is None or pd.isna(pct):
        return "Sem dados suficientes"
    for nome, minimo, maximo in FAIXAS:
        if maximo is None or pct < maximo or (nome == "Crítico" and pct <= 100):
            if pct >= minimo:
                return nome
    return "Atrasado"


def horas_contratadas(tipo, prioridade_num, vip):
    if tipo == "INCIDENTE":
        if vip:
            return 8
        return {1: 4, 2: 8, 3: 16, 4: 24}.get(prioridade_num, 24)
    return 24 if vip else 72


def prioridade_numerica(texto):
    texto = str(texto).strip()
    return int(texto[0]) if texto[:1] in "1234" and texto[:1] != "" else np.nan


def limpar_base(df):
    df = df.copy()
    df["Categoria"] = df["Categoria"].replace(
        {"DeskPhone and Mobile devices": "Desk Phone and Mobile devices"})
    df["violou_sla"] = (df["SLAViolado"] == "Sim").astype(int)
    df["log_atualizacoes"] = np.log10(df["QuantidadeAtualizacoes"] + 1)
    return df


# ---------------------------------------------------------------- sumarização
def sumarizar(df):
    def taxa(coluna):
        t = df.groupby(coluna)["violou_sla"].agg(chamados="size", taxa_violacao="mean")
        t["taxa_violacao"] = (t["taxa_violacao"] * 100).round(1)
        return t.sort_values("taxa_violacao", ascending=False)

    resumo = {
        "chamados": int(len(df)),
        "taxa_violacao_pct": round(df["violou_sla"].mean() * 100, 1),
        "mediana_horas": round(float(df["TempoDecorridoHoras"].median()), 2),
        "mediana_atualizacoes": float(df["QuantidadeAtualizacoes"].median()),
        "por_prioridade": taxa("Prioridade").reset_index().to_dict("records"),
        "por_categoria": taxa("Categoria").reset_index().to_dict("records"),
        "por_grupo": taxa("GrupoAtribuicao").reset_index().to_dict("records"),
    }
    fig, eixos = plt.subplots(1, 2, figsize=(14, 4.8))
    cat = taxa("Categoria").sort_values("taxa_violacao")
    eixos[0].barh(cat.index, cat["taxa_violacao"], color="tab:blue")
    eixos[0].set_title("Taxa de violação de SLA por categoria (%)")
    eixos[0].set_xlabel("% de chamados com SLA violado")
    pri = taxa("Prioridade").sort_index()
    eixos[1].bar([p.split(" - ")[0] for p in pri.index], pri["chamados"], color="tab:gray")
    for i, (n, t) in enumerate(zip(pri["chamados"], pri["taxa_violacao"])):
        eixos[1].text(i, n, f"{t}% violados", ha="center", va="bottom", fontsize=9)
    eixos[1].set_title("Chamados por prioridade (e % violados)")
    eixos[1].set_ylabel("Quantidade de chamados")
    fig.tight_layout()
    fig.savefig(PASTA_FIGURAS / "sumarizacao.png", dpi=160)
    plt.close(fig)
    return resumo


# --------------------------------------------------------------- agrupamento
def agrupar(caminho_base):
    df = agr.carregar(caminho_base)
    df["Categoria"] = df["Categoria"]
    colunas = ["log_horas", "log_atualizacoes", "PrioridadeNumerica"]
    escala = StandardScaler().fit(df[colunas])
    X = escala.transform(df[colunas])
    inercias, silhuetas = agr.escolher_k(X)
    k = max(silhuetas, key=silhuetas.get)
    modelo = KMeans(n_clusters=k, n_init=10, random_state=SEMENTE).fit(X)
    df["grupo"] = modelo.labels_ + 1
    perfil = agr.perfil_dos_grupos(df)

    # Nomeia os perfis (regra documentada, só para k = 3): menor taxa de violação = fluxo
    # regular; entre os outros dois, o de prioridade mais urgente (número menor) = urgentes
    # em atraso, e o outro = backlog prolongado (chamados de baixa prioridade parados).
    nomes = {g: f"Perfil {g}" for g in perfil.index}
    if k == 3:
        regular = perfil["taxa_violacao_sla"].idxmin()
        restantes = perfil.drop(index=regular)
        urgentes = restantes["prioridade_media"].idxmin()
        backlog = [g for g in restantes.index if g != urgentes][0]
        nomes[regular], nomes[urgentes], nomes[backlog] = (
            "Fluxo regular", "Urgentes em atraso", "Backlog prolongado")
    df["perfil_analitico"] = df["grupo"].map(nomes)
    perfil["nome"] = perfil.index.map(nomes)

    agr.gerar_figura(X, df, inercias, silhuetas, k, str(PASTA_FIGURAS / "agrupamento.png"))
    parametros = {
        "colunas": ["log_horas", "log_atualizacoes", "prioridade_num"],
        "media": escala.mean_.round(6).tolist(),
        "desvio": escala.scale_.round(6).tolist(),
        "ids": [int(g) for g in perfil.index],
        "nomes": [nomes[g] for g in perfil.index],
        "centroides": modelo.cluster_centers_[[g - 1 for g in perfil.index]].round(6).tolist(),
    }
    resumo = {
        "k": int(k),
        "silhouette": round(float(silhuetas[k]), 3),
        "silhouette_por_k": {int(a): round(float(b), 3) for a, b in silhuetas.items()},
        "perfis": perfil.reset_index().to_dict("records"),
    }
    return df, parametros, resumo


def atribuir_perfil(parametros, log_horas, log_upd, prio):
    if any(pd.isna(v) for v in (log_horas, log_upd, prio)):
        return None
    x = (np.array([log_horas, log_upd, prio]) - parametros["media"]) / parametros["desvio"]
    c = np.array(parametros["centroides"])
    return parametros["nomes"][int(np.argmin(((c - x) ** 2).sum(axis=1)))]


# -------------------------------------------------------------- classificação
def pipeline_classificador(usar_atualizacoes=True, modelo=None):
    numericas = ["prioridade_num"] + (["log_atualizacoes"] if usar_atualizacoes else [])
    pre = ColumnTransformer([
        ("n", StandardScaler(), numericas),
        ("c", OneHotEncoder(handle_unknown="ignore"), ["Categoria", "GrupoAtribuicao"]),
    ])
    if modelo is None:
        modelo = LogisticRegression(max_iter=1000)
    return make_pipeline(pre, modelo), numericas


def metricas_cv(pipe, X, y):
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=SEMENTE)
    r = cross_validate(pipe, X, y, cv=cv, scoring=["accuracy", "precision", "recall", "f1", "roc_auc"])
    return {m: {"media": round(float(r[f"test_{m}"].mean()), 3),
                "desvio": round(float(r[f"test_{m}"].std()), 3)}
            for m in ["accuracy", "precision", "recall", "f1", "roc_auc"]}


def classificar(df):
    df = df.copy()
    df["prioridade_num"] = df["PrioridadeNumerica"]
    y = df["violou_sla"]
    cols = ["prioridade_num", "log_atualizacoes", "Categoria", "GrupoAtribuicao"]
    X = df[cols]

    pipe, numericas = pipeline_classificador()
    pipe_sem, _ = pipeline_classificador(usar_atualizacoes=False)
    pipe_rf, _ = pipeline_classificador(modelo=RandomForestClassifier(
        n_estimators=200, min_samples_leaf=3, random_state=SEMENTE))
    baseline = make_pipeline(DummyClassifier(strategy="most_frequent"))

    validacao = {
        "baseline_classe_majoritaria": metricas_cv(baseline, X[numericas], y),
        "regressao_logistica": metricas_cv(pipe, X, y),
        "regressao_logistica_sem_atualizacoes": metricas_cv(pipe_sem, X, y),
        "random_forest_comparacao": metricas_cv(pipe_rf, X, y),
        "procedimento": "validação cruzada estratificada 5 partes repetida 10 vezes (50 treinos/testes)",
    }

    # Validação temporal: treina nos 70% mais antigos e testa nos 30% mais recentes.
    ordem = df.sort_values("DataCriacao", kind="stable").index
    corte = int(len(ordem) * 0.7)
    tr, te = ordem[:corte], ordem[corte:]
    pipe.fit(X.loc[tr], y.loc[tr])
    p_te = pipe.predict_proba(X.loc[te])[:, 1]
    temporal = {
        "treino": int(len(tr)), "teste": int(len(te)),
        "acuracia": round(float(accuracy_score(y.loc[te], p_te >= 0.5)), 3),
        "acuracia_baseline": round(float(max(y.loc[te].mean(), 1 - y.loc[te].mean())), 3),
        "roc_auc": round(float(roc_auc_score(y.loc[te], p_te)), 3) if y.loc[te].nunique() > 1 else None,
    }
    validacao["temporal_70_30"] = temporal

    # Figura: curva ROC e matriz de confusão (previsões fora da amostra).
    cv5 = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEMENTE)
    prob = cross_val_predict(pipe, X, y, cv=cv5, method="predict_proba")[:, 1]
    fpr, tpr, _ = roc_curve(y, prob)
    mc = confusion_matrix(y, prob >= 0.5)
    fig, eixos = plt.subplots(1, 2, figsize=(11, 4.6))
    eixos[0].plot(fpr, tpr, label=f"Regressão logística (AUC = {roc_auc_score(y, prob):.2f})".replace(".", ","))
    eixos[0].plot([0, 1], [0, 1], "--", color="gray", label="Acaso (AUC = 0,50)")
    eixos[0].set_xlabel("Taxa de falsos positivos")
    eixos[0].set_ylabel("Taxa de verdadeiros positivos")
    eixos[0].set_title("Curva ROC (validação cruzada)")
    eixos[0].legend(loc="lower right")
    eixos[1].imshow(mc, cmap="Blues")
    for i in range(2):
        for j in range(2):
            eixos[1].text(j, i, int(mc[i, j]), ha="center", va="center", fontsize=14,
                          color="white" if mc[i, j] > mc.max() / 2 else "black")
    eixos[1].set_xticks([0, 1], ["Previsto: no prazo", "Previsto: violado"])
    eixos[1].set_yticks([0, 1], ["Real: no prazo", "Real: violado"])
    eixos[1].set_title("Matriz de confusão (limiar 0,5)")
    fig.tight_layout()
    fig.savefig(PASTA_FIGURAS / "classificacao.png", dpi=160)
    plt.close(fig)
    validacao["matriz_confusao_limiar_0_5"] = {
        "verdadeiro_negativo": int(mc[0, 0]), "falso_positivo": int(mc[0, 1]),
        "falso_negativo": int(mc[1, 0]), "verdadeiro_positivo": int(mc[1, 1])}

    # Ajuste final com todos os dados e exportação dos coeficientes para o site.
    pipe.fit(X, y)
    pre, lr = pipe.steps[0][1], pipe.steps[1][1]
    esc = pre.named_transformers_["n"]
    codif = pre.named_transformers_["c"]
    coef = lr.coef_[0]
    n_num = len(numericas)
    parametros = {
        "tipo": "regressao_logistica",
        "intercepto": round(float(lr.intercept_[0]), 6),
        "numericas": [
            {"nome": nome, "media": round(float(esc.mean_[i]), 6),
             "desvio": round(float(esc.scale_[i]), 6), "coef": round(float(coef[i]), 6)}
            for i, nome in enumerate(numericas)],
        "categoricas": [],
    }
    pos = n_num
    for coluna, categorias in zip(["Categoria", "GrupoAtribuicao"], codif.categories_):
        valores = {}
        for cat in categorias:
            valores[str(cat)] = round(float(coef[pos]), 6)
            pos += 1
        parametros["categoricas"].append({"coluna": coluna, "valores": valores})

    # Confere que a fórmula exportada (usada no site) reproduz o modelo do sklearn.
    esperado = pipe.predict_proba(X)[:, 1]
    obtido = np.array([probabilidade(parametros, r.prioridade_num, r.log_atualizacoes,
                                     r.Categoria, r.GrupoAtribuicao) for r in X.itertuples()])
    assert np.allclose(esperado, obtido, atol=1e-6), "fórmula exportada difere do modelo"

    coeficientes = sorted(
        [{"variavel": f"{c['coluna']} = {k}", "coeficiente": v}
         for c in parametros["categoricas"] for k, v in c["valores"].items()] +
        [{"variavel": n["nome"] + " (padronizada)", "coeficiente": n["coef"]} for n in parametros["numericas"]],
        key=lambda d: -abs(d["coeficiente"]))
    return parametros, validacao, coeficientes


def probabilidade(p, prioridade_num, log_atualizacoes, categoria, grupo):
    """Mesma conta que o site faz em JavaScript."""
    z = p["intercepto"]
    valores = {"prioridade_num": prioridade_num, "log_atualizacoes": log_atualizacoes}
    for n in p["numericas"]:
        z += n["coef"] * (valores[n["nome"]] - n["media"]) / n["desvio"]
    entrada = {"Categoria": categoria, "GrupoAtribuicao": grupo}
    for c in p["categoricas"]:
        z += c["valores"].get(entrada[c["coluna"]], 0.0)
    return 1 / (1 + np.exp(-z))


# ------------------------------------------------------- indicadores da fila
def preparar_fila(fila, p_cls, p_agr):
    linhas = []
    for r in fila.itertuples():
        vip = bool(r.EhVIP) or str(r.UserType).strip().upper() == "VIP"
        prio = prioridade_numerica(r.Prioridade)
        horas_c = horas_contratadas(r.TipoChamado, prio, vip)
        horas = None if pd.isna(r.TempoDecorridoSegundos) else r.TempoDecorridoSegundos / 3600
        pct = None if horas is None else horas / horas_c * 100
        log_upd = np.log10(r.QuantidadeAtualizacoes + 1)
        prob = None
        if r.TipoChamado == "INCIDENTE" and not pd.isna(prio):
            prob = probabilidade(p_cls, prio, log_upd, r.Categoria, r.GrupoAtribuicao)
        perfil = None if horas is None else atribuir_perfil(p_agr, np.log10(horas + 1), log_upd, prio)
        linhas.append({
            "numero": r.Número, "tipo_chamado": r.TipoChamado, "prioridade": r.Prioridade,
            "prioridade_num": None if pd.isna(prio) else int(prio),
            "estado": r.Estado, "grupo_atribuicao": r.GrupoAtribuicao,
            "analista": None if r.Analista in ("", "SEM-ANALISTA") else r.Analista,
            "categoria": r.Categoria, "data_criacao": pd.Timestamp(r.DataCriacao).date(),
            "user_type": r.UserType, "vip": vip, "qtd_atualizacoes": int(r.QuantidadeAtualizacoes),
            "horas_contratadas": horas_c,
            "tempo_decorrido_horas": None if horas is None else round(horas, 2),
            "pct_sla_consumido": None if pct is None else round(pct, 2),
            "horas_restantes": None if horas is None else round(max(horas_c - horas, 0), 2),
            "horas_excedidas": None if horas is None else round(max(horas - horas_c, 0), 2),
            "sla_violado": None if pct is None else bool(pct > 100),
            "faixa_consumo": faixa_consumo(pct),
            "prob_violacao": None if prob is None else round(float(prob), 4),
            "perfil_analitico": perfil,
        })
    return pd.DataFrame(linhas)


# ------------------------------------------------------------------- SQL
def valor_sql(v):
    if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NaT:
        return "NULL"
    if isinstance(v, (bool, np.bool_)):
        return "true" if v else "false"
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    if isinstance(v, (float, np.floating)):
        return repr(round(float(v), 4))
    if isinstance(v, (date, pd.Timestamp)):
        return f"'{pd.Timestamp(v).date().isoformat()}'"
    return "'" + str(v).replace("'", "''") + "'"


def inserir(tabela, colunas, linhas, tamanho=50):
    blocos = []
    for i in range(0, len(linhas), tamanho):
        valores = ",\n".join("  (" + ", ".join(valor_sql(v) for v in l) + ")" for l in linhas[i:i + tamanho])
        blocos.append(f"insert into {tabela} ({', '.join(colunas)}) values\n{valores};\n")
    return "\n".join(blocos)


def gerar_sql(historico, fila_pronta):
    partes = ["-- Gerado por analytics/treinar_modelos.py. Não edite à mão.",
              "truncate regras_sla, criterios, alternativas, chamados_historicos, chamados_ativos restart identity;\n"]
    partes.append(inserir("regras_sla", ["tipo_chamado", "prioridade", "vip", "horas_contratadas", "descricao"],
                          [list(r) for r in REGRAS_SLA]))
    partes.append(inserir("criterios", ["nome", "origem", "peso_inicial", "descricao", "ordem"],
                          [[n, o, p, d, i] for i, (n, o, p, d) in enumerate(CRITERIOS, start=1)]))
    partes.append(inserir("alternativas", ["nome", "descricao", "ordem"],
                          [[n, d, i] for i, (n, d) in enumerate(ALTERNATIVAS, start=1)]))
    colunas_h = ["numero", "tipo_chamado", "prioridade", "prioridade_num", "estado", "grupo_atribuicao",
                 "analista", "categoria", "data_criacao", "user_type", "qtd_atualizacoes",
                 "horas_contratadas", "tempo_decorrido_horas", "pct_sla_consumido", "sla_violado",
                 "faixa_consumo", "perfil_analitico"]
    h = historico
    linhas_h = []
    for r in h.itertuples():
        pct = float(r.PercentualSLAConsumido)
        linhas_h.append([r.Número, r.TipoChamado, r.Prioridade, int(r.PrioridadeNumerica), r.Estado,
                         r.GrupoAtribuicao, r.Analista, r.Categoria, r.DataCriacao,
                         None if pd.isna(r.UserType) else r.UserType, int(r.QuantidadeAtualizacoes),
                         float(r.HorasContratadasSLA), float(r.TempoDecorridoHoras), pct,
                         bool(pct > 100), faixa_consumo(pct), r.perfil_analitico])
    partes.append(inserir("chamados_historicos", colunas_h, linhas_h))
    colunas_a = list(fila_pronta.columns)
    partes.append(inserir("chamados_ativos", colunas_a,
                          [[None if (not isinstance(v, (list, str, bool)) and pd.isna(v)) else v for v in l]
                           for l in fila_pronta.astype(object).values.tolist()]))
    return "\n".join(partes)


# ------------------------------------------------------------------- main
def main():
    for caminho in (SAIDA_MODELO.parent, SAIDA_SQL.parent, PASTA_FIGURAS):
        caminho.mkdir(parents=True, exist_ok=True)
    if not BASE.exists() or not FILA.exists():
        sys.exit("Faltam arquivos em data/. Rode antes anonimizar_datas.py e gerar_fila_ficticia.py.")

    historico, p_agr, r_agr = agrupar(BASE)
    historico = limpar_base(historico)
    resumo = sumarizar(historico)
    p_cls, validacao, coeficientes = classificar(historico)

    fila = pd.read_excel(FILA)
    fila["Categoria"] = fila["Categoria"].replace(
        {"DeskPhone and Mobile devices": "Desk Phone and Mobile devices"})
    fila_pronta = preparar_fila(fila, p_cls, p_agr)
    fila_pronta["prioridade_num"] = fila_pronta["prioridade_num"].astype("Int64")

    SAIDA_SQL.write_text(gerar_sql(historico, fila_pronta), encoding="utf-8")

    modelo = {
        "gerado_em": date.today().isoformat(),
        "aviso": "Modelo treinado offline em base reduzida e anonimizada; uso demonstrativo.",
        "faixas": [{"nome": n, "min": a, "max": b} for n, a, b in FAIXAS],
        "regras_sla": {"incidente": {"vip": 8, "1": 4, "2": 8, "3": 16, "4": 24},
                       "requisicao": {"vip": 24, "standard": 72}},
        "classificacao": p_cls,
        "agrupamento": p_agr,
        "relatorio": {  # números exibidos na tela Funções Analíticas
            "sumarizacao": resumo,
            "agrupamento": r_agr,
            "classificacao": {"validacao": validacao, "coeficientes": coeficientes[:12]},
        },
    }
    SAIDA_MODELO.write_text(json.dumps(modelo, ensure_ascii=False, indent=2), encoding="utf-8")
    SAIDA_METRICAS.write_text(json.dumps({
        "sumarizacao": resumo, "agrupamento": r_agr,
        "classificacao": {"validacao": validacao, "coeficientes": coeficientes[:12]},
        "fila_ficticia": {
            "chamados": int(len(fila_pronta)),
            "por_faixa": fila_pronta["faixa_consumo"].value_counts().to_dict()},
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    rl = validacao["regressao_logistica"]
    print("=== Sumarização ===")
    print(f"{resumo['chamados']} chamados; {resumo['taxa_violacao_pct']}% violaram o SLA")
    print("=== Agrupamento ===")
    print(f"k = {r_agr['k']}, silhouette = {r_agr['silhouette']}")
    for p in r_agr["perfis"]:
        print(f"  {p['nome']}: {p['chamados']} chamados, {p['taxa_violacao_sla']}% violados")
    print("=== Classificação (validação cruzada 5x10) ===")
    print(f"  acurácia {rl['accuracy']['media']} | AUC {rl['roc_auc']['media']} | "
          f"baseline {validacao['baseline_classe_majoritaria']['accuracy']['media']}")
    print(f"  sem atualizações: AUC {validacao['regressao_logistica_sem_atualizacoes']['roc_auc']['media']}")
    print(f"  temporal 70/30: {validacao['temporal_70_30']}")
    print("=== Fila fictícia ===")
    print(fila_pronta["faixa_consumo"].value_counts().to_string())
    print("\nArquivos gerados: docs/dados/modelo.json, database/02_dados_iniciais.sql,")
    print("documentacao/metricas.json e documentacao/figuras/*.png")


if __name__ == "__main__":
    main()
