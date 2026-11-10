-- Tabela mínima e pública usada só para manter o projeto ativo.
-- O Supabase gratuito pausa o projeto após cerca de 7 dias sem atividade; uma rotina
-- agendada (GitHub Actions) consulta esta tabela a cada 2 dias.
-- Ela só tem uma linha sem informação sensível e é somente leitura para quem não tem login.
create table if not exists public.ping (
  id   int primary key,
  nota text not null
);
insert into public.ping (id, nota) values (1, 'keep-alive do SAD-SLA') on conflict (id) do nothing;

alter table public.ping enable row level security;
drop policy if exists ping_leitura on public.ping;
create policy ping_leitura on public.ping for select to anon, authenticated using (true);
grant select on public.ping to anon, authenticated;
