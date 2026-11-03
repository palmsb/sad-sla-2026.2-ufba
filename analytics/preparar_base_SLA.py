#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prepara uma base histórica enriquecida para o SAD-SLA.

Entradas esperadas:
  - incidentes.xlsx
  - requisicoes.xlsx

Saída:
  - Base_Historica_SAD_SLA.xlsx

Execução:
  python preparar_base_sad_sla.py
"""

import argparse
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd


# =========================================================
# REGRAS DE NEGÓCIO
# =========================================================

SLA_INCIDENTE_HORAS = {
    "1 - critica": 4,
    "1 - crítica": 4,
    "2 - alta": 8,
    "3 - media": 16,
    "3 - média": 16,
    "4 - baixo": 24,
    "4 - baixa": 24,
}

SLA_INCIDENTE_VIP_HORAS = 8
SLA_REQUISICAO_STANDARD_HORAS = 72
SLA_REQUISICAO_VIP_HORAS = 24

ESTADOS_ATIVOS_SLA = {
    "aberto",
    "novo",
    "open",
    "new",
    "analista designado",
    "assigned",
    "trabalho em andamento",
    "work in progress",
}

ESTADOS_ENCERRADOS = {
    "resolvido",
    "resolved",
    "fechado",
    "closed",
    "concluido",
    "complete",
    "completed",
    "encerrado",
    "fechado completo",
    "fechado incompleto",
}

ESTADOS_CANCELADOS = {
    "cancelado",
    "cancelled",
    "canceled",
    "cancelado / pendencia de terceiros",
}

ESTADOS_PAUSADOS = {
    "em espera",
    "on hold",
    "pendente",
    "pending",
}

GRUPO_ALVO = "it operations"


# =========================================================
# NORMALIZAÇÃO
# =========================================================

def remover_acentos(valor):
    if pd.isna(valor):
        return ""
    texto = str(valor).strip()
    return "".join(
        caractere for caractere in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caractere)
    )


def normalizar_texto(valor):
    return re.sub(r"\s+", " ", remover_acentos(valor).lower()).strip()


def normalizar_nome_coluna(valor):
    texto = normalizar_texto(valor)
    texto = re.sub(r"[^a-z0-9]+", "_", texto)
    return texto.strip("_")


def texto_original(serie):
    return serie.fillna("").astype(str).str.strip()


def converter_data(serie):
    # Tenta preservar datas já reconhecidas pelo Excel e interpretar textos.
    return pd.to_datetime(serie, errors="coerce", dayfirst=True)


def converter_numero(serie):
    def converter(valor):
        if pd.isna(valor) or str(valor).strip() == "":
            return np.nan
        if isinstance(valor, (int, float, np.integer, np.floating)):
            return float(valor)
        texto = str(valor).strip()
        if "," in texto:
            texto = texto.replace(".", "").replace(",", ".")
        return pd.to_numeric(texto, errors="coerce")

    return serie.apply(converter)


def coluna(df, *nomes, padrao=""):
    """Retorna a primeira coluna existente entre os aliases informados."""
    for nome in nomes:
        chave = normalizar_nome_coluna(nome)
        if chave in df.columns:
            return df[chave]
    return pd.Series([padrao] * len(df), index=df.index)


def ler_excel(caminho):
    df = pd.read_excel(caminho, engine="openpyxl")
    df.columns = [normalizar_nome_coluna(c) for c in df.columns]
    return df


# =========================================================
# CAMPOS DERIVADOS
# =========================================================

def valor_indica_vip(valor):
    texto = normalizar_texto(valor).upper()
    if texto in {"VIP", "YES", "SIM", "TRUE"}:
        return True
    return bool(re.search(r"(^|[^A-Z])VIP([^A-Z]|$)", texto))


def registro_vip(linha):
    campos = [
        "user_type",
        "tipo_de_usuario",
        "prioridade",
        "categoria",
        "tipo",
        "item",
        "descricao_curta",
        "vip",
    ]
    return any(
        valor_indica_vip(linha.get(campo, ""))
        for campo in campos
        if campo in linha.index
    )


def converter_tempo_decorrido_segundos(serie):
    """
    Converte Tempo decorrido para segundos.
    Prioridade: valor numérico já expresso em segundos.
    Também aceita timedelta do pandas e textos como '1 days 02:30:00' ou '02:30:00'.
    """
    resultados = []
    for valor in serie:
        if pd.isna(valor) or str(valor).strip() == "":
            resultados.append(np.nan)
            continue

        if isinstance(valor, pd.Timedelta):
            resultados.append(valor.total_seconds())
            continue

        if isinstance(valor, (int, float, np.integer, np.floating)):
            resultados.append(float(valor))
            continue

        texto = str(valor).strip()
        numero = pd.to_numeric(texto.replace(".", "").replace(",", "."), errors="coerce")
        if pd.notna(numero):
            resultados.append(float(numero))
            continue

        duracao = pd.to_timedelta(texto, errors="coerce")
        resultados.append(duracao.total_seconds() if pd.notna(duracao) else np.nan)

    return pd.Series(resultados, index=serie.index, dtype="float64")


def horas_contratadas(tipo_chamado, prioridade, eh_vip):
    if tipo_chamado == "INCIDENTE":
        if eh_vip:
            return SLA_INCIDENTE_VIP_HORAS
        return SLA_INCIDENTE_HORAS.get(normalizar_texto(prioridade), 24)

    if eh_vip:
        return SLA_REQUISICAO_VIP_HORAS
    return SLA_REQUISICAO_STANDARD_HORAS


def tipo_contagem_sla(tipo_chamado, prioridade, eh_vip):
    if tipo_chamado == "INCIDENTE" and not eh_vip:
        prioridade_norm = normalizar_texto(prioridade)
        if prioridade_norm in {"1 - critica", "2 - alta"}:
            return "HORAS CORRIDAS"
    return "HORAS ÚTEIS"


def prioridade_numerica(valor):
    texto = normalizar_texto(valor)
    correspondencia = re.match(r"\s*([1-4])", texto)
    return int(correspondencia.group(1)) if correspondencia else np.nan


def faixa_consumo(percentual):
    if pd.isna(percentual):
        return "Sem cálculo"
    if percentual > 100:
        return "Atrasado (>100%)"
    if percentual >= 90:
        return "Crítico (90%-100%)"
    if percentual >= 75:
        return "Atenção (75%-90%)"
    if percentual >= 50:
        return "Acompanhamento (50%-75%)"
    return "Normal (0%-50%)"


def status_sla(percentual, tempo_informado):
    if not tempo_informado or pd.isna(percentual):
        return "Sem cálculo"
    return "Atrasado" if percentual > 100 else "No prazo"


def acao_sugerida(linha):
    if linha["TempoDecorridoInformado"] == "Não":
        return "Validar tempo decorrido"
    if linha["PossuiAnalista"] == "Não" and linha["ChamadoEncerrado"] == "Não":
        return "Atribuir responsável"
    percentual = linha["PercentualSLAConsumido"]
    if pd.isna(percentual):
        return "Validar dados"
    if percentual > 100:
        return "Tratar atraso e avaliar escalonamento"
    if percentual >= 90:
        return "Intervenção imediata"
    if percentual >= 75:
        return "Priorizar atendimento"
    if percentual >= 50:
        return "Monitorar"
    return "Manter fluxo normal"


# =========================================================
# PADRONIZAÇÃO DAS ENTRADAS
# =========================================================

def preparar_incidentes(df):
    out = pd.DataFrame(index=df.index)
    out["Número"] = texto_original(coluna(df, "Número"))
    out["TipoChamado"] = "INCIDENTE"
    out["Prioridade"] = texto_original(coluna(df, "Prioridade"))
    out["Estado"] = texto_original(coluna(df, "Estado"))
    out["GrupoAtribuicao"] = texto_original(coluna(df, "Grupo de atribuição"))
    out["Analista"] = texto_original(coluna(df, "Atribuído a"))
    out["Categoria"] = texto_original(coluna(df, "Categoria", "Tipo", "Tipo de tarefa"))
    out["Item"] = ""
    out["DescricaoCurta"] = texto_original(coluna(df, "Descrição curta"))
    out["DataCriacao"] = converter_data(coluna(df, "Criação em"))
    out["LocalidadeUsuario"] = texto_original(coluna(df, "Localidade do Usuário"))
    out["UserType"] = texto_original(coluna(df, "User type", "Tipo de usuário"))
    out["Fase"] = ""
    out["ComentariosUltimaAtualizacao"] = texto_original(coluna(
        df,
        "Comentários Adicionais e Anotações de trabalho",
        "Comentários e Anotações de trabalho",
        "Comentários adicionais",
        "Anotações de trabalho",
    ))
    out["QuantidadeAtualizacoes"] = converter_numero(coluna(df, "Atualizações")).fillna(0)
    out["TempoDecorridoSegundos"] = converter_tempo_decorrido_segundos(
        coluna(df, "Tempo decorrido", "Tempo de resolução")
    )
    out["EhVIP"] = df.apply(registro_vip, axis=1)
    return out


def preparar_requisicoes(df):
    out = pd.DataFrame(index=df.index)

    # Item Requisitado é priorizado porque representa o RITM.
    item_requisitado = texto_original(coluna(df, "Item Requisitado"))
    numero = texto_original(coluna(df, "Número"))
    out["Número"] = item_requisitado.where(item_requisitado.ne(""), numero)

    out["TipoChamado"] = "REQUISIÇÃO"
    out["Prioridade"] = texto_original(coluna(df, "Prioridade"))

    # Se houver duas colunas Estado, o pandas normalmente renomeia a segunda como estado_1.
    estado_principal = texto_original(coluna(df, "Estado"))
    estado_secundario = texto_original(coluna(df, "Estado.1", "Estado 1"))
    out["Estado"] = estado_principal.where(estado_principal.ne(""), estado_secundario)

    out["GrupoAtribuicao"] = texto_original(coluna(df, "Grupo de atribuição"))
    out["Analista"] = texto_original(coluna(df, "Atribuído a"))
    out["Categoria"] = texto_original(coluna(df, "Item"))
    out["Item"] = texto_original(coluna(df, "Item"))
    out["DescricaoCurta"] = texto_original(coluna(df, "Descrição curta", "Item"))
    out["DataCriacao"] = converter_data(coluna(df, "Criação em", "Aberto"))
    out["LocalidadeUsuario"] = texto_original(coluna(df, "Localidade do Usuário"))
    out["UserType"] = texto_original(coluna(df, "VIP"))
    out["Fase"] = texto_original(coluna(df, "Fase"))
    out["ComentariosUltimaAtualizacao"] = texto_original(coluna(
        df,
        "Comentários Adicionais e Anotações de trabalho",
        "Comentários e Anotações de trabalho",
        "Comentários adicionais",
        "Anotações de trabalho",
    ))
    out["QuantidadeAtualizacoes"] = converter_numero(coluna(df, "Atualizações")).fillna(0)
    out["TempoDecorridoSegundos"] = converter_tempo_decorrido_segundos(
        coluna(df, "Tempo decorrido", "Tempo de resolução")
    )
    out["EhVIP"] = df.apply(registro_vip, axis=1)
    return out


# =========================================================
# ENRIQUECIMENTO DA BASE
# =========================================================

def enriquecer(base):
    base = base.copy()

    base = base[
        base["Número"].notna() & base["Número"].astype(str).str.strip().ne("")
    ].copy()

    base["EstadoPadronizado"] = base["Estado"].apply(normalizar_texto)
    base["GrupoPadronizado"] = base["GrupoAtribuicao"].apply(normalizar_texto)
    base["CategoriaPadronizada"] = base["Categoria"].apply(normalizar_texto)
    base["PrioridadeNumerica"] = base["Prioridade"].apply(prioridade_numerica)

    base["ChamadoEncerrado"] = base["EstadoPadronizado"].isin(ESTADOS_ENCERRADOS).map(
        {True: "Sim", False: "Não"}
    )
    base["ChamadoCancelado"] = base["EstadoPadronizado"].isin(ESTADOS_CANCELADOS).map(
        {True: "Sim", False: "Não"}
    )
    base["EstadoAtivoSLA"] = base["EstadoPadronizado"].isin(ESTADOS_ATIVOS_SLA).map(
        {True: "Sim", False: "Não"}
    )
    base["EstadoPausado"] = base["EstadoPadronizado"].isin(ESTADOS_PAUSADOS).map(
        {True: "Sim", False: "Não"}
    )
    base["NaFilaITOperations"] = base["GrupoPadronizado"].str.contains(
        GRUPO_ALVO, regex=False, na=False
    ).map({True: "Sim", False: "Não"})

    base["PossuiAnalista"] = base["Analista"].astype(str).str.strip().ne("").map(
        {True: "Sim", False: "Não"}
    )
    base["PossuiGrupo"] = base["GrupoAtribuicao"].astype(str).str.strip().ne("").map(
        {True: "Sim", False: "Não"}
    )
    base["PossuiAtualizacao"] = base["ComentariosUltimaAtualizacao"].astype(str).str.strip().ne("").map(
        {True: "Sim", False: "Não"}
    )
    base["SemAtualizacoesRegistradas"] = (base["QuantidadeAtualizacoes"] <= 0).map(
        {True: "Sim", False: "Não"}
    )

    # O texto dos comentários pode conter dados pessoais e informações internas.
    # Depois de gerar os indicadores acima, ele é removido da base acadêmica.
    base = base.drop(
        columns=["ComentariosUltimaAtualizacao"],
        errors="ignore",
    )

    base["HorasContratadasSLA"] = base.apply(
        lambda r: horas_contratadas(r["TipoChamado"], r["Prioridade"], r["EhVIP"]),
        axis=1,
    )
    base["TipoContagemSLA"] = base.apply(
        lambda r: tipo_contagem_sla(r["TipoChamado"], r["Prioridade"], r["EhVIP"]),
        axis=1,
    )

    base["TempoDecorridoInformado"] = base["TempoDecorridoSegundos"].notna().map(
        {True: "Sim", False: "Não"}
    )
    base["TempoDecorridoHoras"] = base["TempoDecorridoSegundos"] / 3600
    base["TempoDecorridoDias24h"] = base["TempoDecorridoSegundos"] / 86400

    base["PercentualSLAConsumido"] = np.where(
        base["TempoDecorridoSegundos"].notna() & (base["HorasContratadasSLA"] > 0),
        (base["TempoDecorridoHoras"] / base["HorasContratadasSLA"]) * 100,
        np.nan,
    )
    base["HorasRestantesSLA"] = np.where(
        base["PercentualSLAConsumido"].notna(),
        np.maximum(base["HorasContratadasSLA"] - base["TempoDecorridoHoras"], 0),
        np.nan,
    )
    base["HorasExcedidasSLA"] = np.where(
        base["PercentualSLAConsumido"].notna(),
        np.maximum(base["TempoDecorridoHoras"] - base["HorasContratadasSLA"], 0),
        np.nan,
    )
    base["SLAViolado"] = np.where(
        base["PercentualSLAConsumido"].isna(),
        "Sem cálculo",
        np.where(base["PercentualSLAConsumido"] > 100, "Sim", "Não"),
    )
    base["StatusSLA"] = base.apply(
        lambda r: status_sla(
            r["PercentualSLAConsumido"],
            r["TempoDecorridoInformado"] == "Sim",
        ),
        axis=1,
    )
    base["FaixaConsumoSLA"] = base["PercentualSLAConsumido"].apply(faixa_consumo)

    agora = pd.Timestamp.now()
    base["IdadeDesdeCriacaoHorasCorridas"] = (
        agora - base["DataCriacao"]
    ).dt.total_seconds() / 3600
    base.loc[base["IdadeDesdeCriacaoHorasCorridas"] < 0, "IdadeDesdeCriacaoHorasCorridas"] = np.nan

    base["ElegivelTreinamento"] = (
        (base["ChamadoEncerrado"] == "Sim")
        & (base["ChamadoCancelado"] == "Não")
        & base["TempoDecorridoSegundos"].notna()
        & (base["HorasContratadasSLA"] > 0)
    ).map({True: "Sim", False: "Não"})

    def motivo_exclusao(r):
        if r["ChamadoCancelado"] == "Sim": return "Cancelado: não representa resolução"
        if r["ChamadoEncerrado"] != "Sim": return "Chamado ainda não encerrado"
        if r["TempoDecorridoInformado"] != "Sim": return "Tempo decorrido não disponível na exportação"
        if r["HorasContratadasSLA"] <= 0: return "Regra de SLA não identificada"
        return "Elegível"
    base["MotivoElegibilidadeTreinamento"] = base.apply(motivo_exclusao, axis=1)

    base["AcaoSugerida"] = base.apply(acao_sugerida, axis=1)

    # Mantém percentuais acima de 100% para medir a dimensão do atraso.
    colunas_numericas = [
        "QuantidadeAtualizacoes",
        "TempoDecorridoSegundos",
        "TempoDecorridoHoras",
        "TempoDecorridoDias24h",
        "HorasContratadasSLA",
        "PercentualSLAConsumido",
        "HorasRestantesSLA",
        "HorasExcedidasSLA",
        "IdadeDesdeCriacaoHorasCorridas",
    ]
    base[colunas_numericas] = base[colunas_numericas].round(2)

    return base.sort_values(
        by=["SLAViolado", "PercentualSLAConsumido"],
        ascending=[False, False],
        na_position="last",
    )


# =========================================================
# EXPORTAÇÃO
# =========================================================

def ajustar_planilha(writer, nome_aba, df):
    ws = writer.book[nome_aba]
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    ws.sheet_view.showGridLines = False

    for cell in ws[1]:
        cell.font = cell.font.copy(bold=True, color="FFFFFF")
        cell.fill = cell.fill.copy(fill_type="solid", fgColor="1F4E78")

    for coluna_excel, nome_coluna in enumerate(df.columns, start=1):
        tamanho = max(
            len(str(nome_coluna)),
            min(45, max((len(str(v)) for v in df[nome_coluna].head(300).fillna("")), default=0)),
        )
        ws.column_dimensions[ws.cell(1, coluna_excel).column_letter].width = min(tamanho + 2, 45)

    for idx, nome_coluna in enumerate(df.columns, start=1):
        if nome_coluna == "PercentualSLAConsumido":
            for cell in ws.iter_cols(min_col=idx, max_col=idx, min_row=2):
                for c in cell:
                    c.number_format = '0.00"%"'
        elif nome_coluna in {"DataCriacao"}:
            for cell in ws.iter_cols(min_col=idx, max_col=idx, min_row=2):
                for c in cell:
                    c.number_format = "dd/mm/yyyy hh:mm:ss"


def criar_dicionario():
    linhas = [
        ("Número", "Identificador do incidente ou item requisitado."),
        ("TipoChamado", "INCIDENTE ou REQUISIÇÃO."),
        ("TempoDecorridoSegundos", "Tempo oficial contabilizado pelo ServiceNow, informado na exportação."),
        ("HorasContratadasSLA", "Carga de SLA conforme tipo, prioridade e VIP."),
        ("PercentualSLAConsumido", "Tempo decorrido em horas dividido pelas horas contratadas, vezes 100."),
        ("SLAViolado", "Sim quando o consumo é superior a 100%."),
        ("FaixaConsumoSLA", "Normal, acompanhamento, atenção, crítico ou atrasado."),
        ("ChamadoCancelado", "Identifica cancelamentos, que são excluídos do treinamento."),
        ("ElegivelTreinamento", "Sim para chamados resolvidos/encerrados, não cancelados, com tempo decorrido e SLA calculável."),
        ("MotivoElegibilidadeTreinamento", "Explica por que o registro entrou ou não na aba de treinamento."),
        ("QuantidadeAtualizacoes", "Quantidade de atualizações registrada no chamado."),
        ("PossuiAtualizacao", "Indica se existe comentário/anotação de última atualização."),
        ("AcaoSugerida", "Ação operacional simples derivada do consumo do SLA e atribuição."),
    ]
    return pd.DataFrame(linhas, columns=["Coluna", "Descrição"])


def exportar_excel(base, caminho_saida):
    treinamento = base[base["ElegivelTreinamento"] == "Sim"].copy()
    fotografia = base[(base["ChamadoEncerrado"] == "Não") & (base["ChamadoCancelado"] == "Não")].copy()
    dicionario = criar_dicionario()

    with pd.ExcelWriter(
        caminho_saida,
        engine="openpyxl",
        datetime_format="dd/mm/yyyy hh:mm:ss",
    ) as writer:
        base.to_excel(writer, sheet_name="Base Completa", index=False)
        treinamento.to_excel(writer, sheet_name="Treinamento", index=False)
        fotografia.to_excel(writer, sheet_name="Fotografia Atual", index=False)
        dicionario.to_excel(writer, sheet_name="Dicionario", index=False)

        ajustar_planilha(writer, "Base Completa", base)
        ajustar_planilha(writer, "Treinamento", treinamento)
        ajustar_planilha(writer, "Fotografia Atual", fotografia)
        ajustar_planilha(writer, "Dicionario", dicionario)

    return len(base), len(treinamento), len(fotografia)


def main():
    parser = argparse.ArgumentParser(
        description="Consolida incidentes e requisições e prepara a base histórica do SAD-SLA."
    )
    parser.add_argument("--incidentes", default="incidentes.xlsx")
    parser.add_argument("--requisicoes", default="requisicoes.xlsx")
    parser.add_argument("--saida", default="Base_Historica_SAD_SLA.xlsx")
    args = parser.parse_args()

    caminho_inc = Path(args.incidentes)
    caminho_req = Path(args.requisicoes)

    if not caminho_inc.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {caminho_inc}")
    if not caminho_req.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {caminho_req}")

    incidentes = preparar_incidentes(ler_excel(caminho_inc))
    requisicoes = preparar_requisicoes(ler_excel(caminho_req))
    base = enriquecer(pd.concat([incidentes, requisicoes], ignore_index=True))

    total, treino, atuais = exportar_excel(base, args.saida)

    print("Processamento concluído.")
    print(f"Arquivo gerado: {args.saida}")
    print(f"Registros totais: {total}")
    print(f"Registros elegíveis para treinamento: {treino}")
    print(f"Registros não encerrados: {atuais}")


if __name__ == "__main__":
    main()
