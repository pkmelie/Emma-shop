-- ============================================
-- LA CARTE ROYALE — Schéma Supabase
-- Exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Extension UUID
create extension if not exists "uuid-ossp";

-- ============================================
-- PRODUITS
-- ============================================
create table products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  price numeric(10,2) not null,
  badge text,
  category text check (category in ('prefait','personnalise','coffret')),
  stock integer default 99,
  image_url text,
  suit_icon text default '♠',
  active boolean default true,
  created_at timestamptz default now()
);

-- Données de démo
insert into products (name, description, price, badge, category, suit_icon) values
  ('Jeu Classique Noir & Or',  '54 cartes · finition dorée · boîte rigide',        24.00, 'Bestseller',  'prefait',        '♠'),
  ('Édition Bordeaux',          '54 cartes · illustration aquarelle · étui velours', 32.00, 'Nouveau',     'prefait',        '♥'),
  ('Collection Dorée',          '54 cartes · tranche dorée · numéroté',              45.00, 'Limité',      'prefait',        '♦'),
  ('Mini Jeu de Voyage',        '54 cartes format poche · boîte magnétique',         18.00, 'Populaire',   'prefait',        '♣'),
  ('Carte Tarot Artisanal',     '78 cartes · papier premium · tirage à la main',     58.00, 'Personnalisé','personnalise',   '★'),
  ('Coffret Duo Prestige',      '2 jeux assortis · coffret bois gravé · cadeau',     72.00, 'Coffret',     'coffret',        '✦');

-- ============================================
-- COMMANDES
-- ============================================
create table orders (
  id uuid primary key default uuid_generate_v4(),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  shipping_address jsonb,          -- {line1, city, zip, country}
  status text default 'pending'
    check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  total numeric(10,2) not null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- LIGNES DE COMMANDE
-- ============================================
create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,      -- snapshot au moment de la commande
  product_price numeric(10,2) not null,
  quantity integer not null default 1,
  subtotal numeric(10,2) generated always as (product_price * quantity) stored
);

-- ============================================
-- DEMANDES DE PERSONNALISATION
-- ============================================
create table custom_requests (
  id uuid primary key default uuid_generate_v4(),
  first_name text not null,
  last_name text not null,
  email text not null,
  request_type text,
  quantity text,
  budget text,
  colors text[],
  description text,
  status text default 'new'
    check (status in ('new','in_review','quoted','accepted','declined')),
  admin_notes text,
  created_at timestamptz default now()
);

-- ============================================
-- MISE À JOUR updated_at automatique
-- ============================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_updated_at
  before update on orders
  for each row execute function update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Products : lecture publique
alter table products enable row level security;
create policy "products_public_read"
  on products for select using (active = true);

-- Orders : insert public, lecture/modif admin seulement
alter table orders enable row level security;
create policy "orders_insert_public"
  on orders for insert with check (true);
create policy "orders_admin_all"
  on orders for all using (auth.role() = 'authenticated');

-- Order items : insert public, lecture admin
alter table order_items enable row level security;
create policy "order_items_insert_public"
  on order_items for insert with check (true);
create policy "order_items_admin_read"
  on order_items for select using (auth.role() = 'authenticated');

-- Custom requests : insert public, lecture admin
alter table custom_requests enable row level security;
create policy "custom_requests_insert"
  on custom_requests for insert with check (true);
create policy "custom_requests_admin"
  on custom_requests for all using (auth.role() = 'authenticated');

-- ============================================
-- VUE ADMIN : commandes avec leurs produits
-- ============================================
create view orders_full as
select
  o.id,
  o.customer_name,
  o.customer_email,
  o.status,
  o.total,
  o.created_at,
  json_agg(json_build_object(
    'product', oi.product_name,
    'qty',     oi.quantity,
    'price',   oi.product_price
  )) as items
from orders o
join order_items oi on oi.order_id = o.id
group by o.id;

-- ============================================
-- NOTIFICATIONS (add after initial schema)
-- ============================================
create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  type        text not null,            -- new_order | new_custom_request | payment_received | low_stock
  title       text not null,
  message     text,
  read        boolean default false,
  created_at  timestamptz default now()
);

alter table notifications enable row level security;
create policy "notifications_admin_all"
  on notifications for all using (auth.role() = 'authenticated');

-- Auto-notify on new order
create or replace function notify_new_order()
returns trigger language plpgsql security definer as $$
begin
  insert into notifications (type, title, message)
  values (
    'new_order',
    'Nouvelle commande',
    'Commande de ' || new.customer_name || ' — ' || new.total || ' €'
  );
  return new;
end;
$$;
create trigger orders_notify
  after insert on orders
  for each row execute function notify_new_order();

-- Auto-notify on new custom request
create or replace function notify_new_custom_request()
returns trigger language plpgsql security definer as $$
begin
  insert into notifications (type, title, message)
  values (
    'new_custom_request',
    'Nouvelle demande personnalisée',
    'De ' || new.first_name || ' ' || new.last_name || ' — ' || new.request_type
  );
  return new;
end;
$$;
create trigger custom_requests_notify
  after insert on custom_requests
  for each row execute function notify_new_custom_request();

-- ============================================
-- GESTION DU STOCK — Décrément automatique
-- ============================================

-- Fonction : décrémente le stock de chaque produit commandé
-- Appelée automatiquement après chaque insertion dans order_items
create or replace function decrement_stock_on_order()
returns trigger language plpgsql security definer as $$
begin
  -- Décrémente le stock, minimum 0
  update products
  set stock = greatest(0, stock - new.quantity)
  where id = new.product_id;

  -- Alerte si stock faible (≤ 3) après décrément
  if (select stock from products where id = new.product_id) <= 3 then
    insert into notifications (type, title, message)
    select
      'low_stock',
      'Stock faible',
      'Le produit "' || name || '" n''a plus que ' || stock || ' unité(s) en stock.'
    from products where id = new.product_id;
  end if;

  return new;
end;
$$;

-- Trigger sur order_items
create trigger order_items_decrement_stock
  after insert on order_items
  for each row execute function decrement_stock_on_order();

-- RLS : permettre à l'admin de mettre à jour le stock
create policy "products_admin_update"
  on products for update using (auth.role() = 'authenticated');

-- RLS : permettre à l'admin de lire tous les produits (actifs ou non)
create policy "products_admin_all"
  on products for all using (auth.role() = 'authenticated');
