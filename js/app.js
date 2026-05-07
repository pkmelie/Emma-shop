/**
 * app.js — Point d'entrée principal v2
 * Stripe Checkout · Modal produit · Notifications temps réel
 */

import { fetchProducts, createOrder, createStripeCheckout } from './supabase.js';
import { createCustomRequest } from './supabase.js';
import * as Cart from './cart.js';
import * as UI   from './ui.js';
import { initProductModal, openProductModal } from './product-modal.js';
import { initNotifications, requestNotificationPermission } from './notifications.js';

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initCart();
  initCheckout();
  initContact();
  initProductModal(product => {
    const ok = Cart.addItem(product);
    if (ok) UI.toast(`"${product.name}" ajouté au panier`);
    else    UI.toast(`Stock épuisé pour "${product.name}"`, 'error');
  });

  

  await loadCatalog();
  handlePaymentReturn();
});

// ═══════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════
function initNavigation() {
  document.body.addEventListener('click', e => {
    const el = e.target.closest('[data-page]');
    if (el) { e.preventDefault(); UI.showPage(el.dataset.page); }
  });
}

// ═══════════════════════════════════════════
//  CATALOGUE + click → modal produit
// ═══════════════════════════════════════════
async function loadCatalog() {
  const { data, error } = await fetchProducts();
  if (error) {
    document.getElementById('productGrid').innerHTML = `
      <div class="empty-state-full error-state">
        <div class="empty-state-suits" aria-hidden="true">♠ ♥ ♦ ♣</div>
        <h3>Chargement impossible</h3>
        <p>Une erreur s'est produite lors du chargement des produits.<br>Vérifiez votre connexion ou réessayez dans quelques instants.</p>
        <div class="error-state-actions">
          <button class="btn-outline" onclick="window.location.reload()">Réessayer</button>
          <button class="btn-outline" data-page="contact">Nous contacter</button>
        </div>
      </div>`;
    UI.toast('Erreur chargement produits', 'error');
    return;
  }

  UI.renderProducts(data, product => {
    const ok = Cart.addItem(product);
    if (ok) UI.toast(`"${product.name}" ajouté au panier`);
    else    UI.toast(`Stock épuisé pour "${product.name}"`, 'error');
  });

  // Clic sur la carte (hors bouton +) → modal
  document.getElementById('productGrid').addEventListener('click', e => {
    const card  = e.target.closest('.product-card');
    const isBtn = e.target.closest('.add-btn');
    if (card && !isBtn) {
      const id = card.dataset.id;
      const product = data.find(p => p.id == id);  // == tolère string/number
      if (product) openProductModal(product);
    }
  });
}

// ═══════════════════════════════════════════
//  RETOUR DEPUIS STRIPE
// ═══════════════════════════════════════════
function handlePaymentReturn() {
  const params  = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  if (payment === 'success') {
    Cart.clear();
    UI.toast('🎉 Paiement confirmé ! Vous allez recevoir un email.');
    window.history.replaceState({}, '', '/');
  } else if (payment === 'cancelled') {
    UI.toast('Paiement annulé — votre panier est conservé.', 'error');
    window.history.replaceState({}, '', '/');
  }
}

// ═══════════════════════════════════════════
//  PANIER
// ═══════════════════════════════════════════
function initCart() {
  const overlay  = document.getElementById('cartOverlay');
  const drawer   = document.getElementById('cartDrawer');
  const toggle   = document.getElementById('cartToggle');
  const close    = document.getElementById('cartClose');
  const backdrop = document.getElementById('cartBackdrop');

  const open  = () => { overlay.classList.add('open'); drawer.classList.add('open'); };
  const close_ = () => { overlay.classList.remove('open'); drawer.classList.remove('open'); };

  toggle.addEventListener('click', open);
  close.addEventListener('click', close_);
  backdrop.addEventListener('click', close_);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close_();
  });

  document.getElementById('cartBody').addEventListener('click', e => {
    const btn = e.target.closest('.qty-btn');
    if (!btn) return;
    const delta = btn.dataset.action === 'inc' ? 1 : -1;
    const ok = Cart.changeQty(btn.dataset.id, delta);
    if (!ok) UI.toast('Stock maximum atteint pour cet article', 'error');
  });

  document.getElementById('checkoutBtn').addEventListener('click', () => {
    close_();
    openCheckoutModal();
  });

  Cart.subscribe(items => {
    UI.renderCartBody(items);
    const count = Cart.getCount();
    const badge = document.getElementById('cartBadge');
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  });
}

// ═══════════════════════════════════════════
//  CHECKOUT (infos client → Stripe)
// ═══════════════════════════════════════════
function initCheckout() {
  document.getElementById('modalClose').addEventListener('click', closeCheckoutModal);
  document.getElementById('modalBackdrop').addEventListener('click', closeCheckoutModal);
  document.getElementById('orderSuccessClose')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('checkoutForm').addEventListener('submit', async e => {
    e.preventDefault();
    await handlePlaceOrder();
  });
  // Relay search
  document.getElementById('relaySearchBtn')?.addEventListener('click', searchRelayPoints);
  document.getElementById('o_relay_zip_search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); searchRelayPoints(); }
  });
  document.getElementById('relayChangeBtn')?.addEventListener('click', resetRelaySelection);
}

async function searchRelayPoints() {
  const zipInput = document.getElementById('o_relay_zip_search');
  const errEl    = document.getElementById('relayError');
  const resultsEl = document.getElementById('relayResults');
  if (!zipInput || !errEl || !resultsEl) return;

  const zip = zipInput.value.trim();
  if (!/^\d{5}$/.test(zip)) {
    errEl.textContent = 'Entrez un code postal à 5 chiffres.';
    return;
  }
  errEl.textContent = '';
  UI.setLoading('relaySearchBtn', true);
  resultsEl.classList.remove('hidden');
  resultsEl.innerHTML = '<p class="relay-loading">Recherche en cours…</p>';

  try {
    const res = await fetch(`/api/relay-points?zip=${zip}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || 'Erreur serveur');
    if (!json.points?.length) {
      resultsEl.innerHTML = `<p class="relay-empty">Aucun point relais trouvé pour ce code postal.<br>Essayez un code voisin.</p>`;
    } else {
      resultsEl.innerHTML = json.points.map(p => `
        <button type="button" class="relay-point-item" data-name="${escHtmlAttr(p.name)}" data-addr="${escHtmlAttr(p.addr)}" data-zip="${escHtmlAttr(p.zip)}" data-city="${escHtmlAttr(p.city)}">
          <span class="relay-point-icon">📍</span>
          <span class="relay-point-info">
            <strong>${escHtml(p.name)}</strong>
            <span>${p.addr ? escHtml(p.addr) + ', ' : ''}${escHtml(p.zip)} ${escHtml(p.city)}</span>
          </span>
        </button>`).join('');
      resultsEl.addEventListener('click', e => {
        const item = e.target.closest('.relay-point-item');
        if (item) selectRelayPoint(item.dataset.name, item.dataset.addr, item.dataset.zip, item.dataset.city);
      }, { once: true });
    }
  } catch(err) {
    resultsEl.innerHTML = `<p class="relay-empty">Impossible de charger les points relais.<br><small>${err.message}</small></p>`;
  } finally {
    UI.setLoading('relaySearchBtn', false);
  }
}

function selectRelayPoint(name, addr, zip, city) {
  document.getElementById('o_relay_name_input').value = name;
  document.getElementById('o_relay_addr_input').value = addr;
  document.getElementById('o_relay_zip_input').value  = zip;
  document.getElementById('o_relay_city_input').value = city;
  document.getElementById('relaySelectedLabel').textContent = `${name} — ${addr ? addr + ', ' : ''}${zip} ${city}`;
  document.getElementById('relaySelected').classList.remove('hidden');
  document.getElementById('relayResults').classList.add('hidden');
  document.getElementById('relayError').textContent = '';
}

function resetRelaySelection() {
  ['o_relay_name_input','o_relay_addr_input','o_relay_zip_input','o_relay_city_input'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('relaySelected').classList.add('hidden');
  document.getElementById('relayResults').classList.add('hidden');
  document.getElementById('o_relay_zip_search').value = '';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escHtmlAttr(str) { return escHtml(str || ''); }

function openCheckoutModal() {
  UI.renderOrderSummary(Cart.getItems());
  // Réinitialiser le sélecteur de point relais
  resetRelaySelection();
  document.getElementById('o_relay_zip_search').value = '';
  const errEl = document.getElementById('relayError');
  if (errEl) errEl.textContent = '';
  document.getElementById('checkoutModal').classList.remove('hidden');
  document.getElementById('checkoutForm').style.display = '';
  document.getElementById('orderSuccess')?.classList.add('hidden');
}
function closeCheckoutModal() {
  document.getElementById('checkoutModal').classList.add('hidden');
}

async function handlePlaceOrder() {
  const valid = UI.validateForm('checkoutForm', [
    { id: 'o_first', test: v => v.length > 0,           msg: 'Requis' },
    { id: 'o_last',  test: v => v.length > 0,           msg: 'Requis' },
    { id: 'o_email', test: v => /\S+@\S+\.\S+/.test(v), msg: 'Email invalide' },
  ]);
  if (!valid) return;

  // Vérifier que les champs relais sont remplis
  const relayName = document.getElementById('o_relay_name_input').value.trim();
  const relayAddr = document.getElementById('o_relay_addr_input').value.trim();
  const relayZip  = document.getElementById('o_relay_zip_input').value.trim();
  const relayCity = document.getElementById('o_relay_city_input').value.trim();

  if (!relayName || !relayAddr || !relayZip || !relayCity) {
    document.getElementById('relayError').textContent = 'Veuillez renseigner l\'adresse complète du point relais.';
    document.getElementById('o_relay_name_input').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  UI.setLoading('placeBtn', true);

  const customer = {
    firstName:   document.getElementById('o_first').value.trim(),
    lastName:    document.getElementById('o_last').value.trim(),
    email:       document.getElementById('o_email').value.trim(),
    phone:       document.getElementById('o_phone').value.trim(),
    // Point relais — lus directement depuis les champs visibles
    relayName,
    address: relayAddr,
    city:    relayCity,
    zip:     relayZip,
    country: 'France',
    relayId: 'MANUEL',
  };

  // 1. Créer la commande en BDD (status: pending)
  const { order, error: orderErr } = await createOrder(customer, Cart.getItems());
  if (orderErr) {
    UI.toast('Erreur création commande : ' + orderErr.message, 'error');
    UI.setLoading('placeBtn', false);
    return;
  }

  // 2. Créer la session Stripe et rediriger
  const items = Cart.getItems();
  const { url, error: stripeErr } = await createStripeCheckout(customer, items, order.id);
  if (stripeErr || !url) {
    UI.toast('Erreur paiement : ' + (stripeErr?.message || 'Inconnue'), 'error');
    UI.setLoading('placeBtn', false);
    return;
  }

  // 3. Redirection vers Stripe Checkout
  window.location.href = url;
}

// ═══════════════════════════════════════════
//  CONTACT
// ═══════════════════════════════════════════
function initContact() {
  document.getElementById('swatchRow').addEventListener('click', e => {
    const swatch = e.target.closest('.swatch');
    if (swatch) swatch.classList.toggle('selected');
  });
  document.getElementById('contactForm').addEventListener('submit', async e => {
    e.preventDefault();
    await handleContactSubmit();
  });
}

async function handleContactSubmit() {
  const valid = UI.validateForm('contactForm', [
    { id: 'c_first', test: v => v.length > 0,           msg: 'Requis' },
    { id: 'c_email', test: v => /\S+@\S+\.\S+/.test(v), msg: 'Email invalide' },
    { id: 'c_desc',  test: v => v.length > 10,           msg: 'Min. 10 caractères' },
  ]);
  if (!valid) return;

  UI.setLoading('contactSubmit', true);

  const colors = [...document.querySelectorAll('.swatch.selected')].map(s => s.dataset.color);

  const { error } = await createCustomRequest({
    first_name:   document.getElementById('c_first').value.trim(),
    last_name:    document.getElementById('c_last').value.trim(),
    email:        document.getElementById('c_email').value.trim(),
    request_type: document.getElementById('c_type').value || null,
    quantity:     document.getElementById('c_qty').value.trim()    || null,
    budget:       document.getElementById('c_budget').value.trim() || null,
    colors:       colors.length ? colors : null,
    description:  document.getElementById('c_desc').value.trim(),
  });

  UI.setLoading('contactSubmit', false);

  if (error) { UI.toast('Erreur : ' + error.message, 'error'); return; }

  document.getElementById('contactForm').style.display = 'none';
  document.getElementById('contactSuccess').classList.remove('hidden');
  UI.toast('Demande envoyée !');
}