-- Execute este arquivo uma vez no SQL Editor do Supabase.
create extension if not exists pgcrypto;

create table if not exists public.admins (
  id bigint generated always as identity primary key,
  user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists public.products (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.categories(id),
  name text not null,
  description text not null default '',
  price numeric(10,2) not null check (price > 0),
  image_url text not null default 'sprite:0',
  options jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sold_out boolean not null default false,
  featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  order_number text not null unique,
  customer_id bigint references public.customers(id),
  customer_name text not null,
  phone text not null,
  pickup_date date not null,
  pickup_time time not null,
  notes text not null default '',
  payment_method text not null check (char_length(trim(payment_method)) between 1 and 60),
  status text not null default 'received' check (status in ('received','confirmed','preparing','ready','picked_up','cancelled')),
  total numeric(10,2) not null check (total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id bigint not null references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity between 1 and 30),
  unit_price numeric(10,2) not null,
  options jsonb not null default '[]'::jsonb,
  notes text not null default ''
);

create table if not exists public.store_settings (
  id integer primary key default 1 check (id = 1),
  store_name text not null default 'Doce é Ser',
  phone text not null default '(11) 99999-9999',
  whatsapp text not null default '5511999999999',
  instagram text not null default '@doceeser',
  address text not null default 'Configure o endereço da loja no painel',
  maps_url text not null default '',
  open_time time not null default '09:00',
  close_time time not null default '18:00',
  interval_minutes integer not null default 30 check (interval_minutes between 10 and 180),
  orders_per_slot integer not null default 6 check (orders_per_slot between 1 and 100),
  closed_days smallint[] not null default '{0}',
  prep_minutes integer not null default 120 check (prep_minutes between 0 and 10080),
  payment_methods text[] not null default array['PIX','Cartão','Dinheiro'],
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_category_active on public.products(category_id, active);
create index if not exists idx_orders_pickup_slot on public.orders(pickup_date, pickup_time) where status <> 'cancelled';
create index if not exists idx_orders_status_created on public.orders(status, created_at desc);
create index if not exists idx_orders_phone_number on public.orders(phone, order_number);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_items_product_id on public.order_items(product_id);
create index if not exists idx_orders_customer_id on public.orders(customer_id);

insert into public.store_settings (id) values (1) on conflict (id) do nothing;
insert into public.categories (name, slug, sort_order) values
  ('Bolos','bolos',0),('Fatias','fatias',1),('Doces','doces',2),('Brigadeiros','brigadeiros',3),
  ('Sobremesas','sobremesas',4),('Bebidas','bebidas',5),('Kits','kits',6),('Especiais','especiais',7)
on conflict (slug) do nothing;

insert into public.products (category_id, name, description, price, image_url, options, featured, sort_order)
select c.id, v.name, v.description, v.price, v.image_url, v.options, v.featured, v.sort_order
from (values
  ('fatias','Fatia Chocolatuda','Massa úmida, brigadeiro cremoso e ganache intensa.',18.90,'sprite:0','[{"name":"Cobertura","values":["Ganache","Brigadeiro"]}]'::jsonb,true,0),
  ('brigadeiros','Caixa de Brigadeiros','Seis brigadeiros artesanais com chocolate nobre.',24.00,'sprite:1','[]'::jsonb,true,1),
  ('sobremesas','Tortinha de Morango','Creme leve, massa amanteigada e morangos frescos.',16.50,'sprite:2','[]'::jsonb,true,2),
  ('doces','Brownie de Caramelo','Brownie intenso, caramelo cremoso e flor de sal.',14.90,'sprite:3','[]'::jsonb,true,3),
  ('bolos','Bolo de Chocolate','Bolo inteiro para celebrar momentos especiais.',89.00,'sprite:0','[{"name":"Tamanho","values":["Pequeno","Médio","Grande"]},{"name":"Recheio","values":["Brigadeiro","Doce de leite"]}]'::jsonb,false,4),
  ('kits','Kit Café da Tarde','Fatia, dois brigadeiros e bebida à escolha.',39.90,'sprite:1','[]'::jsonb,false,5)
) as v(category_slug,name,description,price,image_url,options,featured,sort_order)
join public.categories c on c.slug = v.category_slug
where not exists (select 1 from public.products);

create or replace function public.create_pickup_order(
  p_customer_name text, p_phone text, p_pickup_date date, p_pickup_time time,
  p_notes text, p_payment_method text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_settings public.store_settings%rowtype;
  v_customer_id bigint;
  v_order_id bigint;
  v_total numeric(10,2);
  v_number text;
  v_result jsonb;
  v_requested_count integer;
  v_valid_count integer;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_now timestamp := now() at time zone 'America/Sao_Paulo';
begin
  if char_length(trim(coalesce(p_customer_name, ''))) not between 3 and 100
    or char_length(v_phone) not between 8 and 15
    or char_length(coalesce(p_notes, '')) > 500
    or p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 40
  then
    raise exception 'Revise os dados do pedido.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where not coalesce((item->>'product_id') ~ '^[1-9][0-9]*$', false)
      or not coalesce((item->>'quantity') ~ '^[1-9][0-9]*$', false)
      or (item->>'quantity')::integer not between 1 and 30
      or jsonb_typeof(coalesce(item->'options', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(item->'options', '[]'::jsonb)) > 20
      or char_length(coalesce(item->>'notes', '')) > 300
  ) then
    raise exception 'Revise os itens do pedido.';
  end if;

  select * into v_settings from public.store_settings where id = 1;
  if not found then raise exception 'A loja ainda não está configurada.'; end if;
  if not (p_payment_method = any(v_settings.payment_methods)) then raise exception 'Forma de pagamento indisponível.'; end if;
  if p_pickup_date < v_now::date or p_pickup_date > v_now::date + 180 then raise exception 'Escolha uma data de retirada válida.'; end if;
  if extract(dow from p_pickup_date)::smallint = any(v_settings.closed_days) then raise exception 'A loja não atende nesta data.'; end if;
  if p_pickup_time < v_settings.open_time or p_pickup_time >= v_settings.close_time then raise exception 'A loja não atende nesse horário.'; end if;
  if mod((extract(epoch from (p_pickup_time - v_settings.open_time)) / 60)::integer, v_settings.interval_minutes) <> 0 then raise exception 'Escolha um horário disponível.'; end if;
  if (p_pickup_date + p_pickup_time) < v_now + make_interval(mins => v_settings.prep_minutes) then raise exception 'Escolha um horário com mais antecedência.'; end if;
  if (select count(*) from public.orders where phone = v_phone and created_at > now() - interval '10 minutes' and status <> 'cancelled') >= 5 then raise exception 'Aguarde alguns minutos antes de enviar outro pedido.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_pickup_date::text || ':' || p_pickup_time::text, 0));
  if (select count(*) from public.orders where pickup_date = p_pickup_date and pickup_time = p_pickup_time and status <> 'cancelled') >= v_settings.orders_per_slot then raise exception 'Esse horário está lotado. Escolha outro.'; end if;

  select count(*), count(p.id), coalesce(sum(p.price * (item->>'quantity')::integer), 0)
  into v_requested_count, v_valid_count, v_total
  from jsonb_array_elements(p_items) item
  left join public.products p on p.id = (item->>'product_id')::bigint and p.active and not p.sold_out;
  if v_requested_count <> v_valid_count then raise exception 'Um item do carrinho não está mais disponível.'; end if;

  insert into public.customers (name, phone) values (trim(p_customer_name), v_phone)
  on conflict (phone) do update set name = excluded.name, updated_at = now() returning id into v_customer_id;
  v_number := to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || lpad(floor(random() * 1000)::int::text, 3, '0');
  insert into public.orders (order_number, customer_id, customer_name, phone, pickup_date, pickup_time, notes, payment_method, total)
  values (v_number, v_customer_id, trim(p_customer_name), v_phone, p_pickup_date, p_pickup_time, coalesce(trim(p_notes),''), p_payment_method, v_total)
  returning id into v_order_id;
  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, options, notes)
  select v_order_id, p.id, p.name, (item->>'quantity')::integer, p.price, coalesce(item->'options','[]'::jsonb), trim(coalesce(item->>'notes',''))
  from jsonb_array_elements(p_items) item join public.products p on p.id = (item->>'product_id')::bigint;
  select to_jsonb(o.*) || jsonb_build_object('order_items', coalesce(jsonb_agg(to_jsonb(oi.*)) filter (where oi.id is not null), '[]'::jsonb)) into v_result
  from public.orders o left join public.order_items oi on oi.order_id = o.id where o.id = v_order_id group by o.id;
  return v_result;
end;
$$;

revoke all on function public.create_pickup_order(text,text,date,time,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_pickup_order(text,text,date,time,text,text,jsonb) to anon, authenticated, service_role;

create or replace function public.get_pickup_order(p_order_number text, p_phone text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select
    to_jsonb(o.*) || jsonb_build_object(
      'order_items',
      coalesce(jsonb_agg(to_jsonb(oi.*)) filter (where oi.id is not null), '[]'::jsonb)
    )
  from public.orders o
  left join public.order_items oi on oi.order_id = o.id
  where o.order_number = trim(p_order_number)
    and o.phone = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    and char_length(trim(coalesce(p_order_number, ''))) between 3 and 40
    and char_length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) between 8 and 15
  group by o.id;
$$;
revoke all on function public.get_pickup_order(text,text) from public, anon, authenticated;
grant execute on function public.get_pickup_order(text,text) to anon, authenticated, service_role;

alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.store_settings enable row level security;

drop function if exists public.is_admin() cascade;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

do $$
begin
  if (select count(*) from auth.users) = 1 and (select count(*) from public.admins) = 0 then
    insert into public.admins (user_id, email)
    select id, email from auth.users limit 1
    on conflict do nothing;
  end if;
end
$$;

grant select on public.categories, public.products, public.store_settings to anon, authenticated;
grant insert, update, delete on public.categories, public.products to authenticated;
grant update on public.store_settings to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items, public.admins to authenticated;
grant usage, select on sequence public.categories_id_seq, public.products_id_seq to authenticated;

drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins for select to authenticated using (user_id = auth.uid());
drop policy if exists "admins read orders" on public.orders;
create policy "admins read orders" on public.orders for select to authenticated using ((select private.is_admin()));
drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders" on public.orders for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admins read order items" on public.order_items;
create policy "admins read order items" on public.order_items for select to authenticated using ((select private.is_admin()));

drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select to anon, authenticated using (active = true);
drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products for select to anon, authenticated using (active = true);
drop policy if exists "public read settings" on public.store_settings;
create policy "public read settings" on public.store_settings for select to anon, authenticated using (true);

drop policy if exists "admins manage categories" on public.categories;
drop policy if exists "admins insert categories" on public.categories;
create policy "admins insert categories" on public.categories for insert to authenticated with check ((select private.is_admin()));
drop policy if exists "admins update categories" on public.categories;
create policy "admins update categories" on public.categories for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admins delete categories" on public.categories;
create policy "admins delete categories" on public.categories for delete to authenticated using ((select private.is_admin()));

drop policy if exists "admins manage products" on public.products;
drop policy if exists "admins insert products" on public.products;
create policy "admins insert products" on public.products for insert to authenticated with check ((select private.is_admin()));
drop policy if exists "admins update products" on public.products;
create policy "admins update products" on public.products for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admins delete products" on public.products;
create policy "admins delete products" on public.products for delete to authenticated using ((select private.is_admin()));

drop policy if exists "admins update settings" on public.store_settings;
create policy "admins update settings" on public.store_settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images',true,8000000,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = true, file_size_limit = 8000000;

drop policy if exists "public product images" on storage.objects;
create policy "public product images" on storage.objects for select to public using (bucket_id = 'product-images');

drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and (select private.is_admin()));
drop policy if exists "admins update product images" on storage.objects;
create policy "admins update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and (select private.is_admin())) with check (bucket_id = 'product-images' and (select private.is_admin()));
drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and (select private.is_admin()));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['orders', 'categories', 'products', 'store_settings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;
