#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera a fila ativa FICTÍCIA do SAD-SLA (30 chamados abertos), usada no dashboard.

Os dados são inventados para a demonstração: categorias, grupos e analistas
são sorteados da distribuição da base real anonimizada, mas o tempo decorrido
de cada chamado é definido à mão para cobrir todas as faixas de risco.

Uso (de qualquer pasta):  python analytics/gerar_fila_ficticia.py
Saída: data/fila_ficticia.xlsx  (também serve como planilha de teste na tela Importar Dados)
"""
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
BASE = RAIZ / "data" / "base_sad_sla_anonimizada.xlsx"
SAIDA = RAIZ / "data" / "fila_ficticia.xlsx"
DATA_REFERENCIA = date(2026, 11, 3)

PRIORIDADES = {1: "1 - Crítica", 2: "2 - Alta", 3: "3 - Média", 4: "4 - Baixo"}
HORAS_INCIDENTE = {1: 4, 2: 8, 3: 16, 4: 24}

# (tipo, prioridade, vip, % do SLA consumido, tem analista, estado, atualizações)
# prioridade 0 = requisição standard; pct None = tempo decorrido ausente
ESPEC = [
    ("INC", 1, True, 118, True, "Trabalho em andamento", 3),
    ("INC", 1, False, 95, True, "Trabalho em andamento", 6),
    ("INC", 2, True, 82, True, "Trabalho em andamento", 4),
    ("INC", 2, False, 108, True, "Trabalho em andamento", 5),
    ("INC", 2, False, 62, True, "Analista designado", 2),
    ("INC", 3, False, 91, True, "Trabalho em andamento", 3),
    ("INC", 3, False, 55, True, "Trabalho em andamento", 6),
    ("INC", 3, False, 20, False, "Novo", 0),
    ("INC", 3, False, 78, True, "Em espera", 4),
    ("INC", 4, False, 130, True, "Trabalho em andamento", 9),
    ("INC", 4, False, 97, True, "Trabalho em andamento", 5),
    ("INC", 4, False, 85, False, "Novo", 1),
    ("INC", 4, False, 70, True, "Trabalho em andamento", 7),
    ("INC", 4, False, 60, True, "Analista designado", 3),
    ("INC", 4, False, 45, True, "Trabalho em andamento", 8),
    ("INC", 4, False, 38, True, "Analista designado", 0),
    ("INC", 4, False, 30, True, "Trabalho em andamento", 5),
    ("INC", 4, False, 22, True, "Analista designado", 2),
    ("INC", 4, False, 15, True, "Trabalho em andamento", 4),
    ("INC", 4, False, 8, False, "Novo", 0),
    ("INC", 4, False, 5, True, "Trabalho em andamento", 1),
    ("INC", 4, True, 76, True, "Trabalho em andamento", 2),
    ("INC", 4, False, None, True, "Trabalho em andamento", 3),
    ("INC", 3, False, 12, True, "Analista designado", 1),
    ("INC", 4, False, 52, True, "Analista designado", 2),
    ("REQ", 0, False, 40, True, "Trabalho em andamento", 2),
    ("REQ", 0, False, 88, False, "Novo", 0),
    ("REQ", 0, False, 15, True, "Analista designado", 1),
    ("REQ", 0, True, 80, True, "Trabalho em andamento", 3),
    ("REQ", 0, False, None, False, "Novo", 0),
]


def horas_contratadas(tipo, prio, vip):
    if tipo == "INC":
        return 8 if vip else HORAS_INCIDENTE[prio]
    return 24 if vip else 72


def atualizacoes_realistas(rng, base, pct, estado, valor_padrao):
    """Chamados 'Novo' mantêm o valor definido à mão (ainda sem atendimento). Os demais
    sorteiam a quantidade de atualizações entre os 12 chamados reais com % de SLA mais próximo."""
    if estado == "Novo" or pct is None:
        return valor_padrao
    vizinhos = (base["PercentualSLAConsumido"] - pct).abs().sort_values().index[:12]
    return int(rng.choice(base.loc[vizinhos, "QuantidadeAtualizacoes"].to_numpy()))


def sortear(rng, serie):
    contagem = serie.value_counts(normalize=True)
    return rng.choice(contagem.index.to_numpy(), p=contagem.to_numpy())


def main():
    rng = np.random.default_rng(2026)
    base = pd.read_excel(BASE, sheet_name="Treinamento")
    base["Categoria"] = base["Categoria"].replace(
        {"DeskPhone and Mobile devices": "Desk Phone and Mobile devices"}
    )
    analistas = base.loc[base["Analista"] != "SEM-ANALISTA", "Analista"]

    linhas = []
    for i, (tipo, prio, vip, pct, tem_analista, estado, upd) in enumerate(ESPEC, start=1):
        horas = horas_contratadas(tipo, prio, vip)
        segundos = None if pct is None else int(round(pct / 100 * horas * 3600))
        dias = 0 if segundos is None else int(segundos / 3600 / 8 * 7 / 5)
        linhas.append({
            "Número": f"{'INC' if tipo == 'INC' else 'REQ'}_{9000 + i}",
            "TipoChamado": "INCIDENTE" if tipo == "INC" else "REQUISIÇÃO",
            "Prioridade": PRIORIDADES[prio] if tipo == "INC" else "Standard",
            "Estado": estado,
            "GrupoAtribuicao": sortear(rng, base["GrupoAtribuicao"]) if tipo == "INC" else "CMP-REQ-FILA-UM",
            "Analista": sortear(rng, analistas) if tem_analista else "SEM-ANALISTA",
            "Categoria": sortear(rng, base["Categoria"]),
            "DataCriacao": DATA_REFERENCIA - timedelta(days=dias),
            "UserType": "VIP" if vip else sortear(rng, base["UserType"].dropna()),
            "QuantidadeAtualizacoes": atualizacoes_realistas(rng, base, pct, estado, upd),
            "TempoDecorridoSegundos": segundos,
            "EhVIP": vip,
        })

    fila = pd.DataFrame(linhas)
    fila["DataCriacao"] = pd.to_datetime(fila["DataCriacao"])
    fila.to_excel(SAIDA, index=False)
    print(f"Fila fictícia gerada: {SAIDA} ({len(fila)} chamados)")


if __name__ == "__main__":
    main()
