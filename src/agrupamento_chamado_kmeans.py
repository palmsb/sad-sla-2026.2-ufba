#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agrupamento (K-means) de chamados de TI encerrados.

Objetivo mostrar o fluxo completo da função de agrupamento:
  1) selecionar variáveis e tratar a assimetria (log10(x + 1))
  2) padronizar as variáveis
  3) escolher o número de grupos (método do cotovelo + silhouette)
  4) ajustar o K-means e descrever o perfil de cada grupo
  5) gerar uma figura para a apresentação

Uso:
  python agrupamento_chamados_kmeans.py --arquivo Base_Oficial_SAD_SLA_Final.xlsx
  python agrupamento_chamados_kmeans.py --arquivo base.xlsx --k 4
"""

import argparse

import matplotlib
matplotlib.use("Agg")  # gera a figura sem precisar de janela
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler


def carregar(caminho):
    df = pd.read_excel(caminho, sheet_name="Treinamento")
    # Variáveis de perfil: tempo gasto, esforço (atualizações) e prioridade.
    # Tempo e atualizações têm cauda longa, então usamos log10(x + 1).
    df["log_horas"] = np.log10(df["TempoDecorridoHoras"] + 1)
    df["log_atualizacoes"] = np.log10(df["QuantidadeAtualizacoes"] + 1)
    df["violou_sla"] = (df["SLAViolado"] == "Sim").astype(int)
    return df


def escolher_k(X, k_max=8):
    """Calcula inércia (cotovelo) e silhouette para cada k."""
    inercias, silhuetas = {}, {}
    for k in range(1, k_max + 1):
        modelo = KMeans(n_clusters=k, n_init=10, random_state=42).fit(X)
        inercias[k] = modelo.inertia_
        if k >= 2:
            silhuetas[k] = silhouette_score(X, modelo.labels_)
    return inercias, silhuetas


def perfil_dos_grupos(df):
    perfil = df.groupby("grupo").agg(
        chamados=("violou_sla", "size"),
        mediana_horas=("TempoDecorridoHoras", "median"),
        mediana_atualizacoes=("QuantidadeAtualizacoes", "median"),
        prioridade_media=("PrioridadeNumerica", "mean"),
        taxa_violacao_sla=("violou_sla", "mean"),
    )
    perfil["taxa_violacao_sla"] = (perfil["taxa_violacao_sla"] * 100).round(1)
    return perfil.round(2)


def gerar_figura(X, df, inercias, silhuetas, k, caminho):
    fig, eixos = plt.subplots(1, 3, figsize=(16, 4.8))

    eixos[0].plot(list(inercias), list(inercias.values()), marker="o")
    eixos[0].axvline(k, color="gray", linestyle="--")
    eixos[0].set_title("Método do cotovelo")
    eixos[0].set_xlabel("Número de grupos (k)")
    eixos[0].set_ylabel("Inércia (WCSS)")

    eixos[1].plot(list(silhuetas), list(silhuetas.values()), marker="o", color="tab:green")
    eixos[1].axvline(k, color="gray", linestyle="--")
    eixos[1].set_title("Índice de silhouette")
    eixos[1].set_xlabel("Número de grupos (k)")
    eixos[1].set_ylabel("Silhouette médio")

    pontos = eixos[2].scatter(
        df["log_horas"], df["log_atualizacoes"], c=df["grupo"], cmap="viridis", s=28, alpha=0.8
    )
    eixos[2].set_title(f"Grupos de chamados (k = {k})")
    eixos[2].set_xlabel("log10(horas decorridas + 1)")
    eixos[2].set_ylabel("log10(atualizações + 1)")
    eixos[2].legend(*pontos.legend_elements(), title="Grupo", loc="lower right")

    fig.tight_layout()
    fig.savefig(caminho, dpi=160)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="K-means sobre chamados de TI encerrados.")
    parser.add_argument("--arquivo", default="Base_Oficial_SAD_SLA_Final.xlsx")
    parser.add_argument("--k", type=int, default=None, help="força um k; se omitido, usa o melhor silhouette")
    parser.add_argument("--figura", default="agrupamento_chamados.png")
    args = parser.parse_args()

    df = carregar(args.arquivo)
    colunas = ["log_horas", "log_atualizacoes", "PrioridadeNumerica"]
    X = StandardScaler().fit_transform(df[colunas])

    inercias, silhuetas = escolher_k(X)
    k = args.k or max(silhuetas, key=silhuetas.get)

    print("k  inércia   silhouette")
    for n in inercias:
        sil = f"{silhuetas[n]:.3f}" if n in silhuetas else "   -"
        print(f"{n}  {inercias[n]:8.1f}  {sil}")
    print(f"\nk escolhido: {k}\n")

    modelo = KMeans(n_clusters=k, n_init=10, random_state=42).fit(X)
    df["grupo"] = modelo.labels_ + 1  # grupos numerados a partir de 1

    print(perfil_dos_grupos(df).to_string())

    gerar_figura(X, df, inercias, silhuetas, k, args.figura)
    print(f"\nFigura salva em: {args.figura}")


if __name__ == "__main__":
    main()