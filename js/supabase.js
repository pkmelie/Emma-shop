/**
 * supabase.js — Client Supabase & toutes les requêtes API
 * ─────────────────────────────────────────────────────────
 * Remplace SUPABASE_URL et SUPABASE_ANON_KEY par tes valeurs
 * Supabase Dashboard → Settings → API
 */

const SUPABASE_URL      = 'https://tosizlovzlijltbaosiu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_c-8V_FDu4ngA1rFom_unBQ_0pfwFYzd';

// ── Init client (UMD global chargé via <script> dans index.html) ──────────
export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════
//  PRODUITS
// ═══════════════════════════════════════════

/**
 * Récupère tous les produits actifs, triés par date de création
 * @returns {{ data: Product[] | null, error: Error | null }}
 */
export async function fetchProducts() {
  const { data, error } = await db
    .from('products')
    .select('id, name, description, price, badge, category, suit_icon, image_url, stock')
    .eq('active', true)
    .order('created_at', { ascending: true });
  return { data, error };
}

// ═══════════════════════════════════════════
//  COMMANDES
// ═══════════════════════════════════════════

/**
 * Crée une commande + ses lignes en deux insertions
 * @param {{ firstName, lastName, email, phone, address }} customer
 * @param {CartItem[]} items
 * @returns {{ order: Order | null, error: Error | null }}
 */
export async function createOrder(customer, items) {
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  // 1. Insérer la commande
  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert({
      customer_name:    `${customer.firstName} ${customer.lastName}`.trim(),
      customer_email:   customer.email,
      customer_phone:   customer.phone || null,
      shipping_address: {
        line1:   customer.address,
        city:    customer.city,
        zip:     customer.zip,
        country: customer.country || 'France',
      },
      total:  parseFloat(total.toFixed(2)),
      status: 'pending',
    })
    .select()
    .single();

  if (orderErr) return { order: null, error: orderErr };

  // 2. Insérer les lignes
  const rows = items.map(i => ({
    order_id:      order.id,
    product_id:    i.id,
    product_name:  i.name,
    product_price: i.price,
    quantity:      i.qty,
  }));

  const { error: itemsErr } = await db.from('order_items').insert(rows);
  if (itemsErr) return { order: null, error: itemsErr };

  return { order, error: null };
}

// ═══════════════════════════════════════════
//  DEMANDES PERSONNALISÉES
// ═══════════════════════════════════════════

/**
 * Enregistre une demande de carte personnalisée
 * @param {CustomRequest} payload
 * @returns {{ data, error }}
 */
export async function createCustomRequest(payload) {
  const { data, error } = await db
    .from('custom_requests')
    .insert(payload)
    .select()
    .single();
  return { data, error };
}

// ═══════════════════════════════════════════
//  AUTH (admin)
// ═══════════════════════════════════════════

export async function adminSignIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function adminSignOut() {
  return db.auth.signOut();
}

export async function getAdminSession() {
  const { data } = await db.auth.getSession();
  return data?.session ?? null;
}

// ═══════════════════════════════════════════
//  ADMIN — STATS
// ═══════════════════════════════════════════

export async function fetchAdminStats() {
  const [ordersRes, notifsRes] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true }),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false),
  ]);
  return {
    totalOrders:   ordersRes.count  ?? 0,
    unreadNotifs:  notifsRes.count  ?? 0,
  };
}

// ═══════════════════════════════════════════
//  ADMIN — ORDERS
// ═══════════════════════════════════════════

export async function fetchAdminOrders({ status = 'all', limit = 20, offset = 0, search = '' } = {}) {
  let q = db
    .from('orders')
    .select('*, order_items(product_name, quantity, product_price)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== 'all') q = q.eq('status', status);
  if (search)           q = q.ilike('customer_name', `%${search}%`);

  return q;
}

export async function updateOrderStatus(id, status) {
  return db.from('orders').update({ status }).eq('id', id);
}

window.changeOrderStatus = changeOrderStatus;
// ═══════════════════════════════════════════
//  ADMIN — PRODUCTS
// ═══════════════════════════════════════════

export async function fetchAdminProducts() {
  return db
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });
}

export async function upsertProduct(product) {
  return db
    .from('products')
    .upsert(product)
    .select()
    .single();
}

export async function toggleProductActive(id, active) {
  return db.from('products').update({ active }).eq('id', id);
}

export async function uploadProductImage(file) {
  const path = `products/${Date.now()}-${file.name}`;
  const { error } = await db.storage.from('images').upload(path, file);
  if (error) return { url: null, error };
  const { data } = db.storage.from('images').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function addProductImage(productId, url) {
  return db.from('products').update({ image_url: url }).eq('id', productId);
}

export async function deleteProductImage(productId) {
  return db.from('products').update({ image_url: null }).eq('id', productId);
}

// ═══════════════════════════════════════════
//  ADMIN — CUSTOM REQUESTS
// ═══════════════════════════════════════════

export async function fetchAdminCustomRequests({ status = 'all' } = {}) {
  let q = db
    .from('custom_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (status !== 'all') q = q.eq('status', status);
  return q;
}

export async function updateCustomRequestStatus(id, status, admin_notes = '') {
  return db.from('custom_requests').update({ status, admin_notes }).eq('id', id);
}

// ═══════════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════════

/**
 * Fetch the most recent notifications.
 * @param {number} limit
 * @returns {{ data, error }}
 */
export async function fetchNotifications(limit = 20) {
  return db
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
}

/**
 * Mark an array of notification IDs as read.
 * @param {string[]} ids
 */
export async function markNotificationsRead(ids) {
  if (!ids?.length) return;
  return db.from('notifications').update({ read: true }).in('id', ids);
}

/**
 * Subscribe to new notifications via Supabase Realtime.
 * Calls `callback` whenever a new row is inserted.
 * @param {() => void} callback
 * @returns {RealtimeChannel}  Call `.unsubscribe()` to clean up.
 */
export function subscribeToNotifications(callback) {
  return db
    .channel('notifications-insert')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      () => callback()
    )
    .subscribe();
}

// ═══════════════════════════════════════════
//  STRIPE CHECKOUT
// ═══════════════════════════════════════════

/**
 * Crée une session Stripe Checkout via une Edge Function Supabase.
 * La fonction "create-checkout" doit être déployée dans ton projet Supabase.
 *
 * @param {{ firstName, lastName, email }} customer
 * @param {CartItem[]} items
 * @param {string} orderId
 * @returns {{ url: string|null, error: Error|null }}
 */
export async function createStripeCheckout(customer, items, orderId) {
  const { data, error } = await db.functions.invoke('create-checkout', {
    body: { customer, items, orderId },
  });
  if (error) return { url: null, error };
  return { url: data?.url ?? null, error: null };
}
