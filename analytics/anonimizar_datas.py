"""
Reduz o risco de reidentificação da base publicada no repositório.
- DataCriacao: mantém só a data (remove hora, minuto e segundo).
- IdadeDesdeCriacaoHorasCorridas: removida (permitiria reconstruir a hora exata).
Uso (na raiz do repositório):  python analytics/anonimizar_datas.py
"""
import sys
from pathlib import Path
import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "data" / "Base_Oficial_SAD_SLA_Final.xlsx"
SAIDA = RAIZ / "data" / "base_sad_sla_anonimizada.xlsx"

wb = openpyxl.load_workbook(ENTRADA)
ws = wb["Treinamento"]
cab = {c.value: c.column for c in ws[1]}

col_data = cab["DataCriacao"]
for linha in range(2, ws.max_row + 1):
    celula = ws.cell(row=linha, column=col_data)
    if celula.value is not None:
        celula.value = celula.value.replace(hour=0, minute=0, second=0, microsecond=0)
        celula.number_format = "dd/mm/yyyy"

if "IdadeDesdeCriacaoHorasCorridas" in cab:
    ws.delete_cols(cab["IdadeDesdeCriacaoHorasCorridas"])

wb.save(SAIDA)
print(f"Arquivo gerado: {SAIDA}")