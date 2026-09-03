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
  payment_method text not null check (payment_method in ('PIX','Cartão','Dinheiro')),
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
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_settings public.store_settings%rowtype;
  v_customer_id bigint;
  v_order_id bigint;
  v_total numeric(10,2);
  v_number text;
  v_result jsonb;
  v_requested_count integer;
  v_valid_count integer;
begin
  if length(trim(p_customer_name)) < 3 or length(trim(p_phone)) < 8 or jsonb_array_length(p_items) = 0 then raise exception 'Revise os dados do pedido.'; end if;
  select * into v_settings from public.store_settings where id = 1;
  if extract(dow from p_pickup_date)::smallint = any(v_settings.closed_days) then raise exception 'A loja não atende nesta data.'; end if;
  if p_pickup_time < v_settings.open_time or p_pickup_time >= v_settings.close_time then raise exception 'A loja não atende nesse horário.'; end if;
  if (p_pickup_date + p_pickup_time) < (now() at time zone 'America/Sao_Paulo') + make_interval(mins => v_settings.prep_minutes) then raise exception 'Escolha um horário com mais antecedência.'; end if;
  if (select count(*) from public.orders where pickup_date = p_pickup_date and pickup_time = p_pickup_time and status <> 'cancelled') >= v_settings.orders_per_slot then raise exception 'Esse horário está lotado. Escolha outro.'; end if;

  select count(*), count(p.id), coalesce(sum(p.price * greatest(1, least(30, (item->>'quantity')::int))),0)
  into v_requested_count, v_valid_count, v_total
  from jsonb_array_elements(p_items) item
  left join public.products p on p.id = (item->>'product_id')::bigint and p.active and not p.sold_out;
  if v_requested_count <> v_valid_count then raise exception 'Um item do carrinho não está mais disponível.'; end if;

  insert into public.customers (name, phone) values (trim(p_customer_name), trim(p_phone))
  on conflict (phone) do update set name = excluded.name, updated_at = now() returning id into v_customer_id;
  v_number := to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || lpad(floor(random() * 1000)::int::text, 3, '0');
  insert into public.orders (order_number, customer_id, customer_name, phone, pickup_date, pickup_time, notes, payment_method, total)
  values (v_number, v_customer_id, trim(p_customer_name), trim(p_phone), p_pickup_date, p_pickup_time, coalesce(trim(p_notes),''), p_payment_method, v_total)
  returning id into v_order_id;
  insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, options, notes)
  select v_order_id, p.id, p.name, greatest(1, least(30, (item->>'quantity')::int)), p.price, coalesce(item->'options','[]'::jsonb), coalesce(item->>'notes','')
  from jsonb_array_elements(p_items) item join public.products p on p.id = (item->>'product_id')::bigint;
  select to_jsonb(o.*) || jsonb_build_object('order_items', coalesce(jsonb_agg(to_jsonb(oi.*)) filter (where oi.id is not null), '[]'::jsonb)) into v_result
  from public.orders o left join public.order_items oi on oi.order_id = o.id where o.id = v_order_id group by o.id;
  return v_result;
end;
$$;

revoke all on function public.create_pickup_order(text,text,date,time,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_pickup_order(text,text,date,time,text,text,jsonb) to service_role;

alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.store_settings enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins for select to authenticated using (user_id = auth.uid());
drop policy if exists "admins read orders" on public.orders;
create policy "admins read orders" on public.orders for select to authenticated using (public.is_admin());
drop policy if exists "admins read order items" on public.order_items;
create policy "admins read order items" on public.order_items for select to authenticated using (public.is_admin());

drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select to anon, authenticated using (active = true);
drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products for select to anon, authenticated using (active = true);
drop policy if exists "public read settings" on public.store_settings;
create policy "public read settings" on public.store_settings for select to anon, authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images',true,8000000,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = true, file_size_limit = 8000000;

drop policy if exists "public product images" on storage.objects;
create policy "public product images" on storage.objects for select to public using (bucket_id = 'product-images');

alter publication supabase_realtime add table public.orders;
