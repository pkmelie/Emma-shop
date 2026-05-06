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

// ── Points Relais Mondial Relay — WebService SOAP ────────────────────
// Appel direct au WebService officiel Mondial Relay (SOAP/XML).
// Mode démo : Brand = "BDTEST  " (espace à la fin requis).
// En production : remplacer Brand + Enseigne par votre compte Mondial Relay.
// Doc WS : https://www.mondialrelay.fr/media/108937/Solution_Technique_V4.6.pdf

const MR_WS_URL   = 'https://www.mondialrelay.fr/WebService/Web_Services.asmx';
const MR_BRAND    = 'BDTEST  '; // ← remplacer par votre code client (11 chars, espaces compris)
const MR_ENSEIGNE = 'CC_DEMO '; // ← remplacer par votre enseigne

/**
 * Appelle le WebService Mondial Relay pour obtenir les points relais proches.
 * @param {string} zip  Code postal (5 chiffres)
 * @returns {Promise<Array>} Liste de points relais
 */
async function fetchRelayPoints(zip) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI_RecherchePointRelais xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${MR_ENSEIGNE}</Enseigne>
      <Pays>FR</Pays>
      <CP>${zip}</CP>
      <Nombre>7</Nombre>
      <DelaiEnvoi>0</DelaiEnvoi>
      <RayonRecherche>20</RayonRecherche>
      <TypeActivite>EXP</TypeActivite>
    </WSI_RecherchePointRelais>
  </soap:Body>
</soap:Envelope>`;

  const res = await fetch(MR_WS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction':   'http://www.mondialrelay.fr/webservice/WSI_RecherchePointRelais',
    },
    body,
  });

  if (!res.ok) throw new Error(`WS HTTP ${res.status}`);
  const xml  = await res.text();
  const doc  = new DOMParser().parseFromString(xml, 'text/xml');
  const pts  = [...doc.querySelectorAll('PointRelais_Details')];

  return pts.map(p => ({
    id:   p.querySelector('Num')?.textContent?.trim()   || '',
    name: p.querySelector('LgAdr1')?.textContent?.trim() || 'Point Relais',
    addr: [
      p.querySelector('LgAdr3')?.textContent?.trim(),
      p.querySelector('LgAdr4')?.textContent?.trim(),
    ].filter(Boolean).join(', '),
    city: p.querySelector('Ville')?.textContent?.trim()  || '',
    zip:  p.querySelector('CP')?.textContent?.trim()     || zip,
    lat:  parseFloat(p.querySelector('Latitude')?.textContent?.replace(',', '.') || '0'),
    lon:  parseFloat(p.querySelector('Longitude')?.textContent?.replace(',', '.') || '0'),
    hours: {
      lun: p.querySelector('Horaires_Lundi')?.textContent?.trim()    || '',
      mar: p.querySelector('Horaires_Mardi')?.textContent?.trim()    || '',
      mer: p.querySelector('Horaires_Mercredi')?.textContent?.trim() || '',
      jeu: p.querySelector('Horaires_Jeudi')?.textContent?.trim()    || '',
      ven: p.querySelector('Horaires_Vendredi')?.textContent?.trim() || '',
      sam: p.querySelector('Horaires_Samedi')?.textContent?.trim()   || '',
    },
  }));
}

// Carte Leaflet inline
let leafMap = null;
let leafMarkers = [];

function initLeafletMap(lat, lon) {
  const wrap = document.getElementById('relayMapWrap');
  wrap.style.display = '';
  wrap.classList.remove('hidden');

  leafMarkers.forEach(m => m.remove());
  leafMarkers = [];

  if (!leafMap) {
    leafMap = L.map('relayMap', { zoomControl: true }).setView([lat, lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(leafMap);
  } else {
    leafMap.setView([lat, lon], 13);
  }
}

function renderRelayList(points) {
  const listEl = document.getElementById('relayList');
  listEl.innerHTML = '';

  points.forEach((p, i) => {
    const markerIcon = L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;background:#1a1612;border:2px solid #c9a96e;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#c9a96e">${i+1}</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13],
    });
    const marker = L.marker([p.lat, p.lon], { icon: markerIcon }).addTo(leafMap);
    marker.bindPopup(`<strong>${p.name}</strong><br><span style="font-size:12px;color:#555">${p.addr}, ${p.city}</span>`);
    leafMarkers.push(marker);

    const item = document.createElement('div');
    item.className = 'relay-item';
    item.innerHTML = `
      <div class="relay-item-num">${i+1}</div>
      <div class="relay-item-info">
        <strong>${p.name}</strong>
        <span>${p.addr}${p.city ? (p.addr ? ', ' : '') + p.city : ''}</span>
      </div>
      <button type="button" class="relay-item-btn">Choisir</button>`;
    item.querySelector('.relay-item-btn').addEventListener('click', () => selectRelay(p));
    item.addEventListener('mouseenter', () => { leafMap.panTo([p.lat, p.lon]); marker.openPopup(); });
    listEl.appendChild(item);
  });
}

/**
 * Lance la recherche de points relais via le WebService Mondial Relay.
 */
async function searchRelayPoints() {
  const zip   = document.getElementById('relay_zip').value.trim();
  const errEl = document.getElementById('relayError');
  errEl.textContent = '';

  if (!/^\d{4,5}$/.test(zip)) {
    errEl.textContent = 'Entrez un code postal valide (ex. 44150)';
    return;
  }

  const btn = document.getElementById('relaySearchBtn');
  btn.disabled = true;

  try {
    const points = await fetchRelayPoints(zip);

    if (!points.length) {
      errEl.textContent = 'Aucun point relais trouvé pour ce code postal. Essayez un code postal voisin.';
      return;
    }

    // Centre la carte sur le 1er résultat
    initLeafletMap(points[0].lat, points[0].lon);
    renderRelayList(points);

  } catch (err) {
    console.error(err);
    errEl.textContent = 'Erreur lors de la recherche. Vérifiez votre connexion et réessayez.';
  } finally {
    btn.disabled = false;
  }
}

function selectRelay(relay) {
  document.getElementById('o_relay_id').value   = relay.id;
  document.getElementById('o_relay_name').value = relay.name;
  document.getElementById('o_relay_addr').value = relay.addr;
  document.getElementById('o_relay_city').value = relay.city;
  document.getElementById('o_relay_zip').value  = relay.zip;

  document.getElementById('relaySelectedName').textContent = relay.name;
  document.getElementById('relaySelectedAddr').textContent = `${relay.addr}${relay.city ? ', ' + relay.city : ''}`;
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