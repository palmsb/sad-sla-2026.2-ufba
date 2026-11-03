-- Rode DEPOIS de criar os 3 usuários em Authentication > Users (veja o passo a passo).
-- Associa cada e-mail ao seu perfil. Pode ser executado de novo sem problema.
insert into perfis (id, nome, perfil)
select id, 'Analista de suporte', 'analista' from auth.users where email = 'analista@sadsla.demo'
union all
select id, 'Líder de TI', 'gestor' from auth.users where email = 'gestor@sadsla.demo'
union all
select id, 'Administrador', 'administrador' from auth.users where email = 'admin@sadsla.demo'
on conflict (id) do update set nome = excluded.nome, perfil = excluded.perfil;

select u.email, p.perfil from perfis p join auth.users u on u.id = p.id order by p.perfil;
