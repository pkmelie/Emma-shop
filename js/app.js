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
    Cart.addItem(product);
    UI.toast(`"${product.name}" ajouté au panier`);
  });

  // Notifications dans la nav
  await initNotifications('.nav-links', { isAdmin: false });
  requestNotificationPermission();

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
    document.getElementById('productGrid').innerHTML =
      `<p class="empty-state">Impossible de charger les produits.</p>`;
    UI.toast('Erreur chargement produits', 'error');
    return;
  }

  UI.renderProducts(data, product => {
    Cart.addItem(product);
    UI.toast(`"${product.name}" ajouté au panier`);
  });

  // Clic sur la carte (hors bouton +) → modal
  document.getElementById('productGrid').addEventListener('click', e => {
    const card  = e.target.closest('.product-card');
    const isBtn = e.target.closest('.add-btn');
    if (card && !isBtn) {
      const id = card.dataset.id;
      const product = data.find(p => p.id === id);
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
    if (btn) Cart.changeQty(btn.dataset.id, btn.dataset.action === 'inc' ? 1 : -1);
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
}

function openCheckoutModal() {
  UI.renderOrderSummary(Cart.getItems());
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
    { id: 'o_addr',  test: v => v.length > 3,           msg: 'Requis' },
    { id: 'o_city',  test: v => v.length > 0,           msg: 'Requis' },
    { id: 'o_zip',   test: v => /^\d{4,5}$/.test(v),    msg: 'Code postal invalide' },
  ]);
  if (!valid) return;

  UI.setLoading('placeBtn', true);

  const customer = {
    firstName: document.getElementById('o_first').value.trim(),
    lastName:  document.getElementById('o_last').value.trim(),
    email:     document.getElementById('o_email').value.trim(),
    phone:     document.getElementById('o_phone').value.trim(),
    address:   document.getElementById('o_addr').value.trim(),
    city:      document.getElementById('o_city').value.trim(),
    zip:       document.getElementById('o_zip').value.trim(),
    country:   document.getElementById('o_country').value.trim(),
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