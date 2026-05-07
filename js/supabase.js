/**
 * supabase.js — Client Supabase & toutes les requêtes API
 * ─────────────────────────────────────────────────────────
 * Les clés sont injectées via des <meta> dans index.html,
 * elles-mêmes remplies par les variables d'environnement Vercel :
 *   VITE_SUPABASE_URL      → variable d'env Vercel (non préfixée VITE_ si pas de bundler)
 *   VITE_SUPABASE_ANON_KEY → idem
 *
 * Dans index.html (head) :
 *   <meta name="supabase-url"  content="%VITE_SUPABASE_URL%">
 *   <meta name="supabase-key"  content="%VITE_SUPABASE_ANON_KEY%">
 *
 * ⚠️  NE JAMAIS coller les vraies valeurs ici — ce fichier est public.
 */

function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  if (!el || !el.content) throw new Error(`[supabase.js] <meta name="${name}"> manquante ou vide.`);
  return el.content;
}

const SUPABASE_URL      = getMeta('supabase-url');
const SUPABASE_ANON_KEY = getMeta('supabase-key');

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
    .select('id, name, description, price, badge, category, suit_icon, image_url, images, stock')
    .eq('active', true)
    .order('created_at', { ascending: true });
  return { data, error };
}

// ═══════════════════════════════════════════
//  COMMANDES
// ═══════════════════════════════════════════

/**
 * Crée une commande + ses lignes en deux insertions.
 *
 * ⚠️  SÉCURITÉ — Les prix NE sont PAS calculés ici :
 *   - `total` et `product_price` sont calculés côté serveur dans
 *     l'Edge Function `create-checkout` qui relit les prix depuis la BDD.
 *   - On insère `total: 0` comme placeholder ; la fonction le met à jour
 *     après vérification via `update_order_total()`.
 *   - On stocke uniquement les `product_id` et `quantity` — jamais le prix
 *     venu du client.
 *
 * @param {{ firstName, lastName, email, phone, address }} customer
 * @param {CartItem[]} items  — seuls id et qty sont utilisés
 * @returns {{ order: Order | null, error: Error | null }}
 */
export async function createOrder(customer, items) {
  // 1. Insérer la commande (total = 0, sera mis à jour par l'Edge Function)
  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert({
      customer_name:    `${customer.firstName} ${customer.lastName}`.trim(),
      customer_email:   customer.email,
      customer_phone:   customer.phone || null,
      shipping_address: {
        type:       'point_relais',
        relay_id:   customer.relayId,
        relay_name: customer.relayName,
        line1:      customer.address,
        city:       customer.city,
        zip:        customer.zip,
        country:    customer.country || 'France',
      },
      total:  0,          // placeholder — recalculé serveur-side
      status: 'pending',
    })
    .select()
    .single();

  if (orderErr) return { order: null, error: orderErr };

  // 2. Insérer les lignes — product_price volontairement omis (0 par défaut)
  //    L'Edge Function `create-checkout` relit les vrais prix depuis products
  //    et met à jour order_items.product_price + orders.total.
  const rows = items.map(i => ({
    order_id:     order.id,
    product_id:   i.id,
    product_name: i.name,   // snapshot visuel uniquement
    quantity:     i.qty,
    product_price: 0,       // sera écrasé par l'Edge Function
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
  const [ordersRes, notifsRes, revenueRes, customRes] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true }),
    db.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false),
    db.from('orders').select('total'),
    db.from('custom_requests').select('id', { count: 'exact', head: true }),
  ]);
  const revenue = (revenueRes.data ?? []).reduce((sum, o) => sum + Number(o.total ?? 0), 0);
  return {
    totalOrders:    ordersRes.count  ?? 0,
    unreadNotifs:   notifsRes.count  ?? 0,
    revenue,
    customRequests: customRes.count  ?? 0,
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

export async function updateOrderStatus(id, status, tracking_number = null) {
  const payload = { status };
  if (tracking_number) payload.tracking_number = tracking_number;
  return db.from('orders').update(payload).eq('id', id);
}


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
//  STOCK
// ═══════════════════════════════════════════

/**
 * Met à jour manuellement le stock d'un produit (depuis le panel admin).
 * @param {string} productId
 * @param {number} newStock
 * @returns {{ error }}
 */
export async function updateStock(productId, newStock) {
  return db
    .from('products')
    .update({ stock: Math.max(0, parseInt(newStock) || 0) })
    .eq('id', productId);
}

/**
 * Souscrit aux changements de stock en temps réel (Supabase Realtime).
 * Appelle `callback(payload)` dès qu'une ligne products est mise à jour.
 * @param {(payload: object) => void} callback
 * @returns {RealtimeChannel}  Appeler `.unsubscribe()` pour nettoyer.
 */
export function subscribeToProducts(callback) {
  return db
    .channel('products-stock')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'products' },
      (payload) => callback(payload)
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