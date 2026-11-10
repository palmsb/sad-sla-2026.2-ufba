# SAD-SLA — Sistema de Apoio à Decisão para Gerenciamento de Risco de SLA em Chamados de TI

> **A análise apoia. Você decide.**

Atuadores>
Paloma Silva de Brito · Jair Sampaio Soares Junior

O SAD-SLA ajuda equipes de operações de TI a decidir o que fazer com chamados que correm o risco de violar o prazo de atendimento (SLA). O sistema importa a fila de chamados, calcula o consumo do SLA, estima o risco, compara alternativas de ação lado a lado, permite simular cenários e registra a decisão com a justificativa. A decisão final é sempre da pessoa responsável.

A descrição completa do método, da validação e dos resultados está no **relatório em PDF**.

## Acesso rápido

| | |
|---|---|
| **Sistema (online)** | https://palmsb.github.io/sad-sla-2026.2-ufba/ |
| **Repositório** | https://github.com/palmsb/sad-sla-2026.2-ufba |
| **Vídeo de demonstração** | _(colar o link do vídeo aqui)_ |

**Credenciais de demonstração** (as senhas estão no relatório em PDF):

| Perfil | O que pode fazer |
|---|---|
| Analista de suporte | Importa a fila, vê a fila e a matriz de decisão (não registra decisões) |
| Líder de TI (decisor)| Analisa na matriz, registra decisões, simula cenários, vê histórico e funções analíticas |
| Administrador |Acesso a todas as telas |

> Os dados são **fictícios ou anonimizados**.

## Arquitetura

![Arquitetura do SAD-SLA](documentacao/figuras/arquitetura.png)

- **Python (offline):** prepara os dados e os modelos analíticos.
- **Supabase:** banco PostgreSQL, login e controle de acesso por perfil.
- **Site estático (GitHub Pages):** HTML, CSS e JavaScript.

## Telas

Visão Geral · Importar Dados · Análise da Fila · Matriz de Decisão · Análise de Sensibilidade · Histórico de Decisões · Funções Analíticas · Sobre o SAD. O menu exibido depende do perfil de acesso.

## Como executar

### Opção A: só usar
Abra o endereço do sistema acima e entre com um dos perfis.

### Opção B: rodar uma cópia
Pré-requisitos: Python 3.10+, Git, conta no [Supabase](https://supabase.com) e no GitHub. Esta opção só é permitida para fins de avaliação acadêmica (veja a seção Licença).

1. **Clonar e instalar**
   ```bash
   git clone https://github.com/palmsb/sad-sla-2026.2-ufba.git
   cd sad-sla-2026.2-ufba
   python -m pip install -r requirements.txt
   ```
2. **Criar o banco no Supabase.** Crie um projeto, abra o **SQL Editor** e rode, nesta ordem, `database/01_esquema.sql` e `database/02_dados_iniciais.sql`.
3. **Criar os 3 usuários** em *Authentication, Users, Add user* (marque *Auto Confirm User*) com os e-mails da tabela de credenciais e senhas à sua escolha. Depois rode `database/03_perfis_usuarios.sql` e `database/04_keepalive.sql`.
4. **Ligar o site ao banco.** Edite `docs/js/config.js` com a *Project URL* e a chave *publishable* (Project Settings). Nunca use a chave `service_role`.
5. **Abrir localmente:**
   ```bash
   python -m http.server 8000 --directory docs
   ```
   Acesse `http://localhost:8000`.
6. **Publicar:** no GitHub, *Settings, Pages, Deploy from a branch, branch `main`, pasta `/docs`*.

Se quiser regerar os arquivos de dados (opcional): `python analytics/gerar_fila_ficticia.py` e `python analytics/treinar_modelos.py`.

### Importar uma fila
Use a tela **Importar Dados** (há um botão para baixar um modelo de planilha). Colunas aceitas:

| Coluna | Obrigatória | Observação |
|---|---|---|
| Número | sim | Identificador do chamado (use códigos anonimizados) |
| Prioridade | sim | Ex.: `1 - Crítica`, `P2`, `Standard` |
| Estado | sim | Encerrados e cancelados são ignorados |
| TipoChamado | não | `INCIDENTE` ou `REQUISIÇÃO`; se ausente, é deduzido pelo prefixo do número |
| GrupoAtribuicao, Analista, Categoria, DataCriacao, UserType, QuantidadeAtualizacoes, EhVIP | não | `SEM-ANALISTA` ou vazio = sem analista |
| TempoDecorridoSegundos | não | Em segundos. Sem ele, o consumo do SLA não é calculado |

## Manter o Supabase ativo
O plano gratuito pausa o projeto após cerca de uma semana sem uso. O arquivo `.github/workflows/keep-alive.yml` consulta o banco a cada 2 dias (depende de `database/04_keepalive.sql` e de `docs/js/config.js` preenchido, com a URL e a chave **entre aspas simples**). Se o projeto pausar, reative-o no painel do Supabase.

## Privacidade
Os dados são anonimizados ou fictícios.

## Limitações
Protótipo acadêmico com base de dados pequena e parâmetros de demonstração, que precisam de validação antes de qualquer uso real. Detalhes no relatório.

## Tecnologias
Python (pandas, scikit-learn, matplotlib, openpyxl) · Supabase (PostgreSQL, Auth, RLS) · HTML, CSS e JavaScript · Chart.js · SheetJS · supabase-js · GitHub Pages e GitHub Actions.

## Licença
Todos os direitos reservados. Veja o arquivo [LICENSE](LICENSE).
