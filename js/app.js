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

  // ── Recherche point relais Mondial Relay ──────────────────
  document.getElementById('relaySearchBtn').addEventListener('click', searchRelayPoints);
  document.getElementById('relay_zip').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); searchRelayPoints(); }
  });
  document.getElementById('relayChangeBtn').addEventListener('click', () => {
    document.getElementById('relaySelected').classList.add('hidden');
    document.getElementById('relayList').classList.remove('hidden');
    clearSelectedRelay();
  });
}

// ── Google Maps + Places API — Points Relais ──────────────────────────────
let gMap = null;
let gMarkers = [];
let gInfoWindow = null;

async function searchRelayPoints() {
  const zip = document.getElementById('relay_zip').value.trim();
  const errEl = document.getElementById('relayError');
  errEl.textContent = '';

  if (!/^\d{4,5}$/.test(zip)) {
    errEl.textContent = 'Entrez un code postal valide (ex. 44150)';
    return;
  }

  const btn = document.getElementById('relaySearchBtn');
  btn.disabled = true;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Recherche…';

  // Attendre que Google Maps soit prêt
  await waitForGoogle();

  // Géocoder le code postal pour obtenir les coordonnées
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ address: zip + ', France' }, (results, status) => {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Rechercher';

    if (status !== 'OK' || !results.length) {
      errEl.textContent = 'Code postal introuvable. Vérifiez et réessayez.';
      return;
    }

    const location = results[0].geometry.location;
    initMap(location);
    searchNearbyRelays(location);
  });
}

function waitForGoogle() {
  return new Promise(resolve => {
    if (window.google && window.google.maps) { resolve(); return; }
    const interval = setInterval(() => {
      if (window.google && window.google.maps) { clearInterval(interval); resolve(); }
    }, 100);
  });
}

function initMap(center) {
  const wrap = document.getElementById('relayMapWrap');
  wrap.classList.remove('hidden');

  if (!gMap) {
    gMap = new google.maps.Map(document.getElementById('relayMap'), {
      center,
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      ],
    });
    gInfoWindow = new google.maps.InfoWindow();
  } else {
    gMap.setCenter(center);
    gMap.setZoom(14);
  }

  // Effacer anciens marqueurs
  gMarkers.forEach(m => m.setMap(null));
  gMarkers = [];
  document.getElementById('relayList').innerHTML = '';
}

function searchNearbyRelays(location) {
  const service = new google.maps.places.PlacesService(gMap);
  const errEl = document.getElementById('relayError');

  service.nearbySearch({
    location,
    radius: 3000,
    keyword: 'Mondial Relay point relais',
    type: 'establishment',
  }, (results, status) => {
    if (status !== google.maps.places.PlacesServiceStatus.OK || !results.length) {
      errEl.textContent = 'Aucun point relais Mondial Relay trouvé près de ce code postal.';
      return;
    }

    const points = results.slice(0, 8);
    const listEl = document.getElementById('relayList');
    listEl.innerHTML = '';

    points.forEach((place, i) => {
      const relay = {
        id:   place.place_id,
        name: place.name,
        addr: place.vicinity || '',
        city: extractCity(place.vicinity),
        zip:  document.getElementById('relay_zip').value.trim(),
        lat:  place.geometry.location.lat(),
        lng:  place.geometry.location.lng(),
      };

      // Marqueur sur la carte
      const marker = new google.maps.Marker({
        position: place.geometry.location,
        map: gMap,
        title: place.name,
        label: { text: String(i + 1), color: '#fff', fontSize: '11px', fontWeight: 'bold' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: '#1a1612',
          fillOpacity: 1,
          strokeColor: '#c9a96e',
          strokeWeight: 2,
        },
      });

      marker.addListener('click', () => {
        gInfoWindow.setContent(`<div style="font-size:13px;padding:4px 2px"><strong>${place.name}</strong><br><span style="color:#666">${place.vicinity || ''}</span></div>`);
        gInfoWindow.open(gMap, marker);
      });
      gMarkers.push(marker);

      // Item dans la liste
      const item = document.createElement('div');
      item.className = 'relay-item';
      item.innerHTML = `
        <div class="relay-item-num">${i + 1}</div>
        <div class="relay-item-info">
          <strong>${place.name}</strong>
          <span>${place.vicinity || ''}</span>
        </div>
        <button type="button" class="relay-item-btn" data-idx="${i}">Choisir</button>
      `;
      item.querySelector('.relay-item-btn').addEventListener('click', () => selectRelay(relay));
      // Hover sur item → bounce marqueur
      item.addEventListener('mouseenter', () => {
        gMap.panTo(place.geometry.location);
        gInfoWindow.setContent(`<div style="font-size:13px;padding:4px 2px"><strong>${place.name}</strong><br><span style="color:#666">${place.vicinity || ''}</span></div>`);
        gInfoWindow.open(gMap, marker);
      });
      listEl.appendChild(item);
    });
  });
}

function extractCity(vicinity) {
  if (!vicinity) return '';
  const parts = vicinity.split(',');
  return parts[parts.length - 1].trim();
}

function selectRelay(relay) {
  document.getElementById('o_relay_id').value   = relay.id;
  document.getElementById('o_relay_name').value = relay.name;
  document.getElementById('o_relay_addr').value = relay.addr;
  document.getElementById('o_relay_city').value = relay.city;
  document.getElementById('o_relay_zip').value  = relay.zip;

  document.getElementById('relaySelectedName').textContent = relay.name;
  document.getElementById('relaySelectedAddr').textContent = `${relay.addr}`;
  document.getElementById('relaySelected').classList.remove('hidden');
  document.getElementById('relayMapWrap').classList.add('hidden');
  document.getElementById('relayError').textContent = '';
}

function clearSelectedRelay() {
  ['o_relay_id','o_relay_name','o_relay_addr','o_relay_city','o_relay_zip'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('relayMapWrap').classList.remove('hidden');
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
  ]);
  if (!valid) return;

  // Vérifier qu'un point relais est bien sélectionné
  const relayId = document.getElementById('o_relay_id').value;
  if (!relayId) {
    document.getElementById('relayError').textContent = 'Veuillez sélectionner un point relais.';
    document.getElementById('relay_zip').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  UI.setLoading('placeBtn', true);

  const customer = {
    firstName:   document.getElementById('o_first').value.trim(),
    lastName:    document.getElementById('o_last').value.trim(),
    email:       document.getElementById('o_email').value.trim(),
    phone:       document.getElementById('o_phone').value.trim(),
    // Point relais Mondial Relay
    address:     document.getElementById('o_relay_addr').value.trim(),
    city:        document.getElementById('o_relay_city').value.trim(),
    zip:         document.getElementById('o_relay_zip').value.trim(),
    country:     'France',
    relayId:     document.getElementById('o_relay_id').value.trim(),
    relayName:   document.getElementById('o_relay_name').value.trim(),
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