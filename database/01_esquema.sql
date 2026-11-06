-- SAD-SLA: esquema do banco (Supabase / PostgreSQL)
-- Pode ser executado de novo sem erro: ele recria tudo do zero.

drop view if exists vw_violacao_por_categoria, vw_violacao_por_prioridade, vw_autonomia_decisor;
drop table if exists cenarios, decisoes, chamados_ativos, chamados_historicos,
                     alternativas, criterios, regras_sla, perfis cascade;
drop function if exists public.perfil_atual();

-- ---------------------------------------------------------------- tabelas
create table perfis (
  id     uuid primary key references auth.users (id) on delete cascade,
  nome   text not null,
  perfil text not null check (perfil in ('analista', 'gestor', 'administrador'))
);

create table regras_sla (
  id                serial primary key,
  tipo_chamado      text    not null check (tipo_chamado in ('INCIDENTE', 'REQUISIÇÃO')),
  prioridade        text,
  vip               boolean not null default false,
  horas_contratadas numeric not null check (horas_contratadas > 0),
  descricao         text    not null
);

create table criterios (
  id           serial primary key,
  nome         text    not null unique,
  descricao    text,
  origem       text    not null check (origem in ('sistema', 'usuario')),
  peso_inicial numeric not null default 0 check (peso_inicial between 0 and 100),
  ordem        int     not null
);

create table alternativas (
  id        serial primary key,
  nome      text not null unique,
  descricao text,
  ordem     int  not null
);

create table chamados_historicos (
  numero                text primary key,
  tipo_chamado          text    not null,
  prioridade            text,
  prioridade_num        int,
  estado                text,
  grupo_atribuicao      text,
  analista              text,
  categoria             text,
  data_criacao          date,
  user_type             text,
  qtd_atualizacoes      int     not null default 0,
  horas_contratadas     numeric not null,
  tempo_decorrido_horas numeric,
  pct_sla_consumido     numeric,
  sla_violado           boolean,
  faixa_consumo         text,
  perfil_analitico      text
);

create table chamados_ativos (
  numero                text primary key,
  tipo_chamado          text    not null,
  prioridade            text,
  prioridade_num        int,
  estado                text,
  grupo_atribuicao      text,
  analista              text,            -- nulo = chamado sem analista
  categoria             text,
  data_criacao          date,
  user_type             text,
  vip                   boolean not null default false,
  qtd_atualizacoes      int     not null default 0,
  horas_contratadas     numeric not null,
  tempo_decorrido_horas numeric,         -- nulo = sem dados suficientes
  pct_sla_consumido     numeric,
  horas_restantes       numeric,
  horas_excedidas       numeric,
  sla_violado           boolean,
  faixa_consumo         text    not null,
  prob_violacao         numeric check (prob_violacao between 0 and 1),
  perfil_analitico      text,
  importado_em          timestamptz not null default now()
);

-- Sem chave estrangeira para chamados_ativos: a decisão guarda o número do chamado
-- como registro histórico, mesmo que a fila seja reimportada depois.
create table decisoes (
  id                        uuid primary key default gen_random_uuid(),
  usuario_id                uuid not null references auth.users (id),
  chamado_numero            text not null,
  data_analise              timestamptz not null default now(),
  alternativa_maior_pontuacao text not null,
  pontuacao_maior           numeric,
  alternativa_escolhida     text not null,
  pontuacao_escolhida       numeric,
  justificativa             text not null check (length(trim(justificativa)) > 0),
  criterios_relevantes      text,
  pesos                     jsonb,
  notas                     jsonb,
  resultado_posterior       text,
  contexto                  jsonb          -- retrato do chamado no momento da decisão
);

create table cenarios (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references auth.users (id),
  chamado_numero text not null,
  nome           text not null,
  pesos          jsonb not null,
  ranking        jsonb not null,
  criado_em      timestamptz not null default now()
);

-- ------------------------------------------------------------------ views
-- (sumarização feita no próprio banco)
create view vw_violacao_por_categoria with (security_invoker = true) as
select categoria,
       count(*)                                         as chamados,
       count(*) filter (where sla_violado)              as violados,
       round(100.0 * count(*) filter (where sla_violado) / count(*), 1) as pct_violacao
from chamados_historicos
group by categoria;

create view vw_violacao_por_prioridade with (security_invoker = true) as
select prioridade,
       count(*)                                         as chamados,
       count(*) filter (where sla_violado)              as violados,
       round(100.0 * count(*) filter (where sla_violado) / count(*), 1) as pct_violacao
from chamados_historicos
group by prioridade;

-- % de decisões em que o decisor escolheu algo diferente da alternativa de maior pontuação
create view vw_autonomia_decisor with (security_invoker = true) as
select count(*) as decisoes,
       count(*) filter (where alternativa_escolhida <> alternativa_maior_pontuacao) as diferentes,
       round(100.0 * count(*) filter (where alternativa_escolhida <> alternativa_maior_pontuacao)
             / nullif(count(*), 0), 1) as pct_autonomia
from decisoes;

-- ------------------------------------------------------- segurança (RLS)
create function public.perfil_atual() returns text
language sql stable security definer set search_path = public as
$$ select perfil from public.perfis where id = auth.uid() $$;

alter table perfis              enable row level security;
alter table regras_sla          enable row level security;
alter table criterios           enable row level security;
alter table alternativas        enable row level security;
alter table chamados_historicos enable row level security;
alter table chamados_ativos     enable row level security;
alter table decisoes            enable row level security;
alter table cenarios            enable row level security;

-- Perfis: nome e função são visíveis a quem está logado (para mostrar o responsável
-- de cada decisão no histórico). Ninguém altera perfis pelo site.
create policy perfis_leitura on perfis for select to authenticated using (true);

-- Tabelas de apoio: todos os usuários logados leem; só administrador altera.
create policy regras_leitura  on regras_sla          for select to authenticated using (true);
create policy criterios_leit  on criterios           for select to authenticated using (true);
create policy alternat_leit   on alternativas        for select to authenticated using (true);
create policy historico_leit  on chamados_historicos for select to authenticated using (true);
create policy regras_admin    on regras_sla          for all to authenticated
  using (perfil_atual() = 'administrador') with check (perfil_atual() = 'administrador');
create policy criterios_admin on criterios           for all to authenticated
  using (perfil_atual() = 'administrador') with check (perfil_atual() = 'administrador');
create policy alternat_admin  on alternativas        for all to authenticated
  using (perfil_atual() = 'administrador') with check (perfil_atual() = 'administrador');
create policy historico_admin on chamados_historicos for all to authenticated
  using (perfil_atual() = 'administrador') with check (perfil_atual() = 'administrador');

-- Fila ativa: todos leem; analista e administrador importam e alteram.
create policy ativos_leitura on chamados_ativos for select to authenticated using (true);
create policy ativos_escrita on chamados_ativos for all to authenticated
  using (perfil_atual() in ('analista', 'administrador'))
  with check (perfil_atual() in ('analista', 'administrador'));

-- Decisões e cenários: só gestor e administrador registram e consultam.
create policy decisoes_leitura on decisoes for select to authenticated
  using (perfil_atual() in ('gestor', 'administrador'));
create policy decisoes_insere on decisoes for insert to authenticated
  with check (usuario_id = auth.uid() and perfil_atual() in ('gestor', 'administrador'));
create policy decisoes_resultado on decisoes for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy cenarios_leitura on cenarios for select to authenticated
  using (usuario_id = auth.uid() and perfil_atual() in ('gestor', 'administrador'));
create policy cenarios_insere on cenarios for insert to authenticated
  with check (usuario_id = auth.uid() and perfil_atual() in ('gestor', 'administrador'));

-- Permissões de acesso às tabelas (o RLS acima decide quem faz o quê).
grant select on all tables in schema public to authenticated;
grant insert, update, delete on regras_sla, criterios, alternativas, chamados_historicos,
      chamados_ativos, decisoes, cenarios to authenticated;
