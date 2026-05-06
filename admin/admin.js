/**
 * admin.js — Panel administration La Carte Royale
 */

// ── Import Supabase functions via chemin relatif ──────────
import {
  db,
  adminSignIn, adminSignOut, getAdminSession,
  fetchAdminStats, fetchAdminOrders, updateOrderStatus,
  fetchAdminProducts, upsertProduct, toggleProductActive,
  addProductImage, deleteProductImage, uploadProductImage,
  fetchAdminCustomRequests, updateCustomRequestStatus,
  fetchNotifications, markNotificationsRead, subscribeToNotifications,
} from '../js/supabase.js';

import { initNotifications } from '../js/notifications.js';

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
const state = {
  view:          'dashboard',
  ordersPage:    0,
  orderStatus:   'all',
  orderSearch:   '',
  reqStatus:     'all',
  editProduct:   null,
};

let _products = [];
let _toastTimer;

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  const session = await getAdminSession();
  if (session) {
    showApp();
  } else {
    showLogin();
  }

  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('loginEmail').addEventListener('keydown', e => e.key === 'Enter' && handleLogin());
  document.getElementById('loginPassword').addEventListener('keydown', e => e.key === 'Enter' && handleLogin());
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Sidebar navigation
  document.querySelectorAll('.s-link[data-view]').forEach(a => {
    a.addEventListener('click', () => switchView(a.dataset.view));
  });

  // Realtime new notifications → update badge
  subscribeToNotifications(() => refreshSidebar());
});

// ═══════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pwd   = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.getElementById('loginBtn');

  if (!email || !pwd) { showLoginErr('Email et mot de passe requis.'); return; }

  btn.textContent = 'Connexion…'; btn.disabled = true;
  const { error } = await adminSignIn(email, pwd);
  btn.textContent = 'Se connecter'; btn.disabled = false;

  if (error) { showLoginErr('Identifiants incorrects.'); return; }
  showApp();
}

function showLoginErr(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function handleLogout() {
  await adminSignOut();
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.body.classList.remove('loading-state');
}

async function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
  document.body.classList.remove('loading-state');

  await initNotifications('#adminNotifMount', { isAdmin: true });
  await refreshSidebar();
  switchView('dashboard');
}

// ═══════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════
function switchView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.s-link').forEach(a => a.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
  document.getElementById('viewTitle').textContent = {
    dashboard: 'Tableau de bord', orders: 'Commandes',
    products: 'Produits', requests: 'Demandes personnalisées',
    notifications: 'Notifications',
  }[name] || name;
  loadView(name);
}

async function loadView(name) {
  if (name === 'dashboard')     await loadDashboard();
  if (name === 'orders')        await loadOrders();
  if (name === 'products')      await loadProducts();
  if (name === 'requests')      await loadRequests();
  if (name === 'notifications') await loadNotificationsView();
}

// ═══════════════════════════════════════════
//  SIDEBAR BADGES
// ═══════════════════════════════════════════
async function refreshSidebar() {
  const { unreadNotifs, totalOrders } = await fetchAdminStats();
  setBadge('sbNotifs', unreadNotifs);
  // Commandes en attente
  const { data } = await fetchAdminOrders({ status: 'pending', limit: 50 });
  setBadge('sbOrders', data?.length || 0);
  // Demandes nouvelles
  const { data: reqs } = await fetchAdminCustomRequests({ status: 'new' });
  setBadge('sbRequests', reqs?.length || 0);
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = count > 9 ? '9+' : String(count);
  el.style.display = count > 0 ? 'inline-block' : 'none';
}

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
async function loadDashboard() {
  const stats = await fetchAdminStats();
  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card">
      <p class="stat-label">Commandes totales</p>
      <p class="stat-value">${stats.totalOrders}</p>
    </div>
    <div class="stat-card">
      <p class="stat-label">Chiffre d'affaires</p>
      <p class="stat-value gold">${fmt(stats.revenue)} €</p>
    </div>
    <div class="stat-card">
      <p class="stat-label">Demandes perso</p>
      <p class="stat-value">${stats.customRequests}</p>
    </div>
    <div class="stat-card">
      <p class="stat-label">Notifs non lues</p>
      <p class="stat-value">${stats.unreadNotifs}</p>
    </div>
  `;

  const [{ data: orders }, { data: requests }] = await Promise.all([
    fetchAdminOrders({ limit: 5 }),
    fetchAdminCustomRequests({ limit: 5 }),
  ]);

  document.getElementById('dashRecentOrders').innerHTML = renderOrderMiniTable(orders || []);
  document.getElementById('dashRecentRequests').innerHTML = renderRequestMiniTable(requests || []);
}

function renderOrderMiniTable(orders) {
  if (!orders.length) return `<p class="table-loading">Aucune commande</p>`;
  return `<table style="width:100%;border-collapse:collapse">
    ${orders.map(o => `
      <tr style="border-bottom:1px solid var(--cream2);cursor:pointer" onclick="openOrderModal(${JSON.stringify(o).replace(/"/g,'&quot;')})">
        <td style="padding:9px 12px;font-size:12px">${o.customer_name}</td>
        <td style="padding:9px 12px;font-size:12px;color:var(--gold-dark)">${fmt(o.total)} €</td>
        <td style="padding:9px 12px">${statusBadge(o.status)}</td>
      </tr>`).join('')}
  </table>`;
}

function renderRequestMiniTable(reqs) {
  if (!reqs.length) return `<p class="table-loading">Aucune demande</p>`;
  return `<table style="width:100%;border-collapse:collapse">
    ${reqs.map(r => `
      <tr style="border-bottom:1px solid var(--cream2);cursor:pointer" onclick="openRequestModal(${JSON.stringify(r).replace(/"/g,'&quot;')})">
        <td style="padding:9px 12px;font-size:12px">${r.first_name} ${r.last_name}</td>
        <td style="padding:9px 12px;font-size:11px;color:var(--muted)">${r.request_type || '—'}</td>
        <td style="padding:9px 12px">${statusBadge(r.status)}</td>
      </tr>`).join('')}
  </table>`;
}

// ═══════════════════════════════════════════
//  COMMANDES
// ═══════════════════════════════════════════
async function loadOrders() {
  const tbody = document.getElementById('ordersTbody');
  tbody.innerHTML = `<tr><td colspan="8" class="table-loading">Chargement…</td></tr>`;

  const { data: orders, error } = await fetchAdminOrders({
    status: state.orderStatus, search: state.orderSearch, page: state.ordersPage,
  });

  if (error || !orders) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading">Erreur chargement</td></tr>`;
    return;
  }

  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading">Aucune commande</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const addr = o.shipping_address || {};
    const relayLine = addr.relay_name
      ? `<div style="font-size:12px;font-weight:600;color:var(--dark)">${esc(addr.relay_name)}</div>
         <div style="font-size:11px;color:var(--muted)">${esc(addr.zip||'')} ${esc(addr.city||'')}</div>`
      : `<div style="font-size:11px;color:var(--muted)">${esc(addr.line1||'—')}</div>
         <div style="font-size:11px;color:var(--muted)">${esc(addr.zip||'')} ${esc(addr.city||'')}</div>`;
    return `
    <tr>
      <td><code style="font-size:11px">#${o.id.slice(0,8).toUpperCase()}</code></td>
      <td>
        <div style="font-size:13px">${esc(o.customer_name)}</div>
        <div style="font-size:11px;color:var(--muted)">${esc(o.customer_email)}</div>
      </td>
      <td style="font-size:11.5px;color:var(--mid);max-width:180px">
        ${(o.items || []).map(i => `${esc(i.name)} ×${i.qty}`).join(', ')}
      </td>
      <td style="max-width:160px">${relayLine}</td>
      <td style="font-family:'Cormorant Garamond',serif;font-size:17px;color:var(--gold-dark)">${fmt(o.total)} €</td>
      <td>${o.payment_status ? statusBadge(o.payment_status) : '<span style="color:var(--muted);font-size:11px">—</span>'}</td>
      <td>
        <select class="status-select" onchange="changeOrderStatus('${o.id}', this.value)">
          ${['pending','confirmed','shipped','delivered','cancelled'].map(s =>
            `<option value="${s}" ${o.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`
          ).join('')}
        </select>
      </td>
      <td style="font-size:11px;color:var(--muted)">${fmtDate(o.created_at)}</td>
      <td><button class="btn-icon" onclick='openOrderModal(${JSON.stringify(o).replace(/'/g,"&#39;")})'>→</button></td>
    </tr>`
  }).join('');

  // Search + filter wiring (once)
  const searchEl = document.getElementById('orderSearch');
  const filterEl = document.getElementById('orderStatusFilter');
  searchEl.onkeyup = debounce(() => { state.orderSearch = searchEl.value; state.ordersPage = 0; loadOrders(); }, 400);
  filterEl.onchange = () => { state.orderStatus = filterEl.value; state.ordersPage = 0; loadOrders(); };
}

async function changeOrderStatus(id, status) {
  let tracking_number = null;

  // Demander le numéro de suivi si expédiée
  if (status === 'shipped') {
    tracking_number = prompt('Numéro de suivi Mondial Relay (optionnel) :');
  }

  const { error } = await updateOrderStatus(id, status, tracking_number);
  if (error) { toast('Erreur mise à jour', true); return; }
  toast('Statut mis à jour');
  await refreshSidebar();

  // Envoyer email
  const { data: order } = await db
    .from('orders')
    .select('*, order_items(product_name, quantity, product_price)')
    .eq('id', id)
    .single();

  if (order) {
    if (tracking_number) order.tracking_number = tracking_number;
    await db.functions.invoke('send-order-email', {
      body: { order, isConfirmation: false },
    });
  }
}
window.changeOrderStatus = changeOrderStatus;

// ─── Order detail modal ──────────────────────────────────
window.openOrderModal = function(order) {
  const addr = order.shipping_address || {};
  document.getElementById('orderModalTitle').textContent = `Commande #${order.id.slice(0,8).toUpperCase()}`;
  document.getElementById('orderModalBody').innerHTML = `
    <div class="order-detail-grid">
      <div class="detail-section">
        <p class="detail-section-title">Client</p>
        <p class="detail-line"><strong>${esc(order.customer_name)}</strong></p>
        <p class="detail-line">${esc(order.customer_email)}</p>
        ${order.customer_phone ? `<p class="detail-line">${esc(order.customer_phone)}</p>` : ''}
      </div>
      <div class="detail-section">
        <p class="detail-section-title">Point Relais Mondial Relay</p>
        ${addr.relay_name ? `<p class="detail-line"><strong style="font-size:14px">${esc(addr.relay_name)}</strong></p>` : ''}
        <p class="detail-line">${esc(addr.line1 || '—')}</p>
        <p class="detail-line">${esc(addr.zip || '')} ${esc(addr.city || '')}</p>
        <p class="detail-line">${esc(addr.country || 'France')}</p>
        <a href="https://www.google.com/maps/search/${encodeURIComponent((addr.relay_name||'') + ' ' + (addr.line1||'') + ' ' + (addr.zip||'') + ' ' + (addr.city||''))}" target="_blank" rel="noopener" style="font-size:11px;color:var(--gold-dark);text-decoration:underline;margin-top:4px;display:inline-block">Voir sur Maps ↗</a>
      </div>
    </div>
    <div class="detail-section" style="margin-bottom:1rem">
      <p class="detail-section-title">Articles</p>
      ${(order.items || []).map(i => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--cream3);font-size:13px">
          <span>${esc(i.name)} <span style="color:var(--muted)">× ${i.qty}</span></span>
          <span style="color:var(--gold-dark)">${fmt(i.price * i.qty)} €</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-family:'Cormorant Garamond',serif;font-size:20px;color:var(--gold-dark)">
        <span>Total</span><span>${fmt(order.total)} €</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--muted)">Statut :</span>
      ${statusBadge(order.status)}
      <select class="status-select" onchange="changeOrderStatus('${order.id}',this.value);this.closest('.modal-wrap').querySelector('.modal').scrollTop=0">
        ${['pending','confirmed','shipped','delivered','cancelled'].map(s =>
          `<option value="${s}" ${order.status===s?'selected':''}>${statusLabel(s)}</option>`
        ).join('')}
      </select>
    </div>
  `;
  document.getElementById('orderModal').classList.remove('hidden');
};
window.closeOrderModal = () => document.getElementById('orderModal').classList.add('hidden');

// ═══════════════════════════════════════════
//  PRODUITS
// ═══════════════════════════════════════════
async function loadProducts() {
  const grid = document.getElementById('productAdminGrid');
  grid.innerHTML = '<div class="table-loading">Chargement…</div>';

  const { data, error } = await fetchAdminProducts();
  if (error || !data) { grid.innerHTML = '<div class="table-loading">Erreur</div>'; return; }
  _products = data;

  grid.innerHTML = data.map(p => `
    <div class="pa-card ${p.active ? '' : 'inactive'}" id="pac-${p.id}">
      ${p.image_url
        ? `<img class="pa-img" src="${esc(p.image_url)}" alt="${esc(p.name)}" />`
        : `<div class="pa-placeholder">${p.suit_icon || '♠'}</div>`}
      <div class="pa-info">
        <p class="pa-name">${esc(p.name)}</p>
        <p class="pa-price">${fmt(p.price)} €</p>
        <p class="pa-img-count">${(p.product_images || []).length} photo(s)</p>
        <div class="pa-actions">
          <button class="btn-icon" onclick="openProductModal('${p.id}')">✏️ Modifier</button>
          <button class="btn-icon" onclick="toggleActive('${p.id}', ${!p.active})">${p.active ? '🙈 Masquer' : '👁 Afficher'}</button>
        </div>
      </div>
    </div>
  `).join('');

  document.getElementById('newProductBtn').onclick = () => openProductModalNew();
}

window.openProductModal = function(productId) {
  const p = _products.find(x => x.id === productId);
  if (p) showProductForm(p);
};
window.closeProductModal = () => document.getElementById('productModal').classList.add('hidden');

function openProductModalNew() {
  showProductForm(null);
}

function showProductForm(product) {
  const isNew = !product;
  document.getElementById('productModalTitle').textContent = isNew ? 'Nouveau produit' : 'Modifier le produit';
  const existingImages = product?.product_images || [];

  document.getElementById('productModalBody').innerHTML = `
    <div class="form-row">
      <div class="field"><label>Nom *</label><input id="pf_name" value="${esc(product?.name || '')}" /></div>
      <div class="field"><label>Prix (€) *</label><input id="pf_price" type="number" step="0.01" value="${product?.price || ''}" /></div>
    </div>
    <div class="field"><label>Description</label><textarea id="pf_desc" rows="3">${esc(product?.description || '')}</textarea></div>
    <div class="form-row">
      <div class="field">
        <label>Catégorie</label>
        <select id="pf_cat">
          <option value="">—</option>
          ${['prefait','personnalise','coffret'].map(c =>
            `<option value="${c}" ${product?.category===c?'selected':''}>${c}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field"><label>Badge</label><input id="pf_badge" value="${esc(product?.badge || '')}" placeholder="Bestseller, Nouveau…" /></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Symbole carte</label><input id="pf_suit" value="${esc(product?.suit_icon || '♠')}" /></div>
      <div class="field"><label>Stock</label><input id="pf_stock" type="number" value="${product?.stock ?? 99}" /></div>
    </div>
    <div class="field"><label>URL image principale</label><input id="pf_imgurl" value="${esc(product?.image_url || '')}" placeholder="https://…" /></div>

    <div style="margin:1.2rem 0 .5rem;font-size:9.5px;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted)">Photos galerie</div>

    ${isNew ? `<p style="font-size:11.5px;color:var(--muted)">Sauvegardez d'abord le produit pour ajouter des photos.</p>` : `
      <div class="img-thumbs-grid" id="imgThumbsGrid">
        ${existingImages.map(img => `
          <div class="img-thumb-wrap">
            <img src="${esc(img.url)}" alt="" />
            <button class="img-thumb-del" onclick="deleteImg('${img.id}', '${product.id}')">✕</button>
          </div>`).join('')}
      </div>
      <div class="img-upload-zone" onclick="document.getElementById('imgFileInput').click()">
        <input type="file" id="imgFileInput" accept="image/*" multiple onchange="uploadImgs(event, '${product.id}')" />
        <div>📷 Cliquer pour ajouter des photos</div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px">JPG, PNG, WEBP · Max 5MB chacune</div>
      </div>
      <div id="uploadProgress"></div>
    `}

    <div style="display:flex;gap:.8rem;margin-top:1.5rem">
      <button class="btn-primary" onclick="saveProduct('${product?.id || ''}')">
        ${isNew ? 'Créer le produit' : 'Enregistrer'}
      </button>
      <button class="btn-secondary" onclick="closeProductModal()">Annuler</button>
    </div>
  `;
  document.getElementById('productModal').classList.remove('hidden');
}

window.saveProduct = async function(existingId) {
  const name  = document.getElementById('pf_name').value.trim();
  const price = parseFloat(document.getElementById('pf_price').value);
  if (!name || isNaN(price)) { toast('Nom et prix requis', true); return; }

  const payload = {
    name,
    price,
    description: document.getElementById('pf_desc').value.trim() || null,
    category:    document.getElementById('pf_cat').value || null,
    badge:       document.getElementById('pf_badge').value.trim() || null,
    suit_icon:   document.getElementById('pf_suit').value.trim() || '♠',
    stock:       parseInt(document.getElementById('pf_stock').value) || 99,
    image_url:   document.getElementById('pf_imgurl').value.trim() || null,
    active:      true,
  };
  if (existingId) payload.id = existingId;

  const { data, error } = await upsertProduct(payload);
  if (error) { toast('Erreur : ' + error.message, true); return; }

  toast(existingId ? 'Produit mis à jour !' : 'Produit créé !');
  closeProductModal();
  await loadProducts();
};

window.toggleActive = async function(id, active) {
  const { error } = await toggleProductActive(id, active);
  if (error) { toast('Erreur', true); return; }
  toast(active ? 'Produit visible' : 'Produit masqué');
  await loadProducts();
};

window.deleteImg = async function(imgId, productId) {
  if (!confirm('Supprimer cette photo ?')) return;
  const { error } = await deleteProductImage(imgId);
  if (error) { toast('Erreur suppression', true); return; }
  // Rafraîchir le formulaire
  const p = _products.find(x => x.id === productId);
  if (p) {
    p.product_images = p.product_images.filter(i => i.id !== imgId);
    showProductForm(p);
  }
};

window.uploadImgs = async function(event, productId) {
  const files = Array.from(event.target.files);
  const prog  = document.getElementById('uploadProgress');
  prog.innerHTML = `<p style="font-size:11px;color:var(--muted);margin-top:.5rem">Upload en cours (0/${files.length})…</p>`;

  let done = 0;
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) { toast(`${file.name} trop lourd (max 5MB)`, true); continue; }
    const { url, error } = await uploadProductImage(file, productId);
    if (error) { toast('Erreur upload : ' + error.message, true); continue; }
    await addProductImage(productId, url, file.name.split('.')[0], done);
    done++;
    prog.innerHTML = `<p style="font-size:11px;color:var(--muted);margin-top:.5rem">Upload ${done}/${files.length}…</p>`;
  }

  prog.innerHTML = `<p style="font-size:11px;color:green;margin-top:.5rem">✓ ${done} photo(s) ajoutée(s)</p>`;
  await loadProducts();
  const p = _products.find(x => x.id === productId);
  if (p) showProductForm(p);
};

// ═══════════════════════════════════════════
//  DEMANDES PERSO
// ═══════════════════════════════════════════
async function loadRequests() {
  const tbody = document.getElementById('requestsTbody');
  tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Chargement…</td></tr>`;

  const { data, error } = await fetchAdminCustomRequests({ status: state.reqStatus });
  if (error || !data) { tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Erreur</td></tr>`; return; }
  if (!data.length) { tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Aucune demande</td></tr>`; return; }

  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${esc(r.first_name)} ${esc(r.last_name)}</td>
      <td style="font-size:11.5px;color:var(--muted)">${esc(r.email)}</td>
      <td style="font-size:12px">${esc(r.request_type || '—')}</td>
      <td style="font-size:12px">${esc(r.budget || '—')}</td>
      <td>${statusBadge(r.status)}</td>
      <td style="font-size:11px;color:var(--muted)">${fmtDate(r.created_at)}</td>
      <td><button class="btn-icon" onclick='openRequestModal(${JSON.stringify(r).replace(/'/g,"&#39;")})'>→</button></td>
    </tr>
  `).join('');

  document.getElementById('requestStatusFilter').onchange = function() {
    state.reqStatus = this.value; loadRequests();
  };
}

window.openRequestModal = function(req) {
  document.getElementById('requestModalBody').innerHTML = `
    <div class="detail-section" style="margin-bottom:1rem">
      <p class="detail-section-title">Contact</p>
      <p class="detail-line"><strong>${esc(req.first_name)} ${esc(req.last_name)}</strong></p>
      <p class="detail-line"><a href="mailto:${esc(req.email)}">${esc(req.email)}</a></p>
    </div>
    <div class="form-row" style="margin-bottom:1rem">
      <div class="detail-section">
        <p class="detail-section-title">Type</p>
        <p class="detail-line">${esc(req.request_type || '—')}</p>
      </div>
      <div class="detail-section">
        <p class="detail-section-title">Budget / Quantité</p>
        <p class="detail-line">${esc(req.budget || '—')} / ${esc(req.quantity || '—')}</p>
      </div>
    </div>
    ${req.colors?.length ? `
      <div class="detail-section" style="margin-bottom:1rem">
        <p class="detail-section-title">Couleurs</p>
        <p class="detail-line">${req.colors.join(', ')}</p>
      </div>` : ''}
    <div class="detail-section" style="margin-bottom:1.2rem">
      <p class="detail-section-title">Description</p>
      <p class="detail-line" style="white-space:pre-wrap">${esc(req.description)}</p>
    </div>
    <div style="display:flex;align-items:center;gap:.8rem;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--muted)">Statut :</span>
      ${statusBadge(req.status)}
      <select class="status-select" onchange="changeReqStatus('${req.id}', this.value)">
        ${['new','in_review','quoted','accepted','declined'].map(s =>
          `<option value="${s}" ${req.status===s?'selected':''}>${reqStatusLabel(s)}</option>`
        ).join('')}
      </select>
    </div>
    <div style="margin-top:1rem">
      <a href="mailto:${esc(req.email)}?subject=Votre demande personnalisée —  Em'shop"
         class="btn-primary sm" style="display:inline-block;text-decoration:none">
        ✉️ Répondre par email
      </a>
    </div>
  `;
  document.getElementById('requestModal').classList.remove('hidden');
};
window.closeRequestModal = () => document.getElementById('requestModal').classList.add('hidden');

window.changeReqStatus = async function(id, status) {
  const { error } = await updateCustomRequestStatus(id, status);
  if (error) { toast('Erreur', true); return; }
  toast('Statut mis à jour');
  await loadRequests();
  await refreshSidebar();
};

// ═══════════════════════════════════════════
//  NOTIFICATIONS VIEW
// ═══════════════════════════════════════════
async function loadNotificationsView() {
  const list = document.getElementById('notifFullList');
  list.innerHTML = '<div class="table-loading">Chargement…</div>';

  const { data, error } = await fetchNotifications(50);
  if (error || !data) { list.innerHTML = '<div class="table-loading">Erreur</div>'; return; }
  if (!data.length) { list.innerHTML = '<div class="table-loading">Aucune notification</div>'; return; }

  const TYPE_ICONS = { new_order:'🛍️', new_custom_request:'✏️', payment_received:'💳', low_stock:'⚠️' };

  list.innerHTML = data.map(n => `
    <div class="nfl-item ${n.read ? '' : 'unread'}">
      <span class="nfl-icon">${TYPE_ICONS[n.type] || '🔔'}</span>
      <div class="nfl-body">
        <p class="nfl-title">${esc(n.title)}</p>
        <p class="nfl-msg">${esc(n.message || '')}</p>
        <p class="nfl-time">${fmtDate(n.created_at, true)}</p>
      </div>
      ${!n.read ? '<span class="nfl-dot"></span>' : ''}
    </div>
  `).join('');

  document.getElementById('markAllReadBtn').onclick = async () => {
    const unread = data.filter(n => !n.read).map(n => n.id);
    if (unread.length) {
      await markNotificationsRead(unread);
      await loadNotificationsView();
      await refreshSidebar();
      toast('Tout marqué comme lu');
    }
  };
}

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmt(n) {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d, full = false) {
  if (!d) return '—';
  const dt = new Date(d);
  if (full) return dt.toLocaleString('fr-FR');
  return dt.toLocaleDateString('fr-FR');
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const STATUS_LABELS  = { pending:'En attente', confirmed:'Confirmée', shipped:'Expédiée', delivered:'Livrée', cancelled:'Annulée', paid:'Payé', failed:'Échoué', pending_pay:'En attente' };
const REQ_LABELS     = { new:'Nouveau', in_review:'En examen', quoted:'Devisé', accepted:'Accepté', declined:'Refusé' };

function statusLabel(s)    { return STATUS_LABELS[s] || s; }
function reqStatusLabel(s) { return REQ_LABELS[s] || s; }
function statusBadge(s)    { return `<span class="status-badge s-${s}">${statusLabel(s) || reqStatusLabel(s)}</span>`; }

let _t;
function toast(msg, isErr = false) {
  const el = document.getElementById('adminToast');
  el.textContent = msg;
  el.className = `a-toast show${isErr ? ' err' : ''}`;
  clearTimeout(_t);
  _t = setTimeout(() => el.classList.remove('show'), 2800);
}