/**
 * ui.js — Helpers de rendu DOM & micro-interactions
 */

// ── Toast ───────────────────────────────────────────────
let _toastTimer;
export function toast(msg, type = 'default') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Navigation ──────────────────────────────────────────
export function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === name);
  });
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Formatage ───────────────────────────────────────────
export function formatPrice(n) {
  return Number(n).toLocaleString('fr-FR', {
    minimumFractionDigits:  2,
    maximumFractionDigits:  2,
  });
}

// ── Produits ────────────────────────────────────────────
export function renderProducts(products, onAdd) {
  const grid = document.getElementById('productGrid');
  document.getElementById('productCount').textContent =
    products.length + ' article' + (products.length > 1 ? 's' : '');

  if (!products.length) {
    grid.innerHTML = `
      <div class="empty-state-full">
        <div class="empty-state-suits" aria-hidden="true">♠ ♥ ♦ ♣</div>
        <h3>Bientôt disponible</h3>
        <p>Notre collection est en cours de préparation.<br>Contactez-nous pour en savoir plus ou passer une commande personnalisée.</p>
        <button class="btn-outline" data-page="contact">Demande sur mesure →</button>
      </div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const inStock = p.stock === undefined || p.stock === null || p.stock > 0;
    const lowStock = p.stock !== undefined && p.stock !== null && p.stock > 0 && p.stock <= 3;
    return `
    <article class="product-card${!inStock ? ' out-of-stock' : ''}" data-id="${p.id}">
      <div class="product-media">
        ${p.image_url
          ? `<img src="${p.image_url}" alt="${escHtml(p.name)}" loading="lazy" class="product-img"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
             <div class="product-placeholder" aria-hidden="true" style="display:none">
               <span class="suit-icon">${p.suit_icon || '♠'}</span>
             </div>`
          : `<div class="product-placeholder" aria-hidden="true">
               <span class="suit-icon">${p.suit_icon || '♠'}</span>
             </div>`
        }
        ${p.badge ? `<span class="product-badge">${escHtml(p.badge)}</span>` : ''}
        ${!inStock ? `<span class="stock-badge out">Épuisé</span>` : ''}
        ${lowStock ? `<span class="stock-badge low">Derniers exemplaires</span>` : ''}
      </div>
      <div class="product-info">
        <h3 class="product-name">${escHtml(p.name)}</h3>
        <p class="product-desc">${escHtml(p.description || '')}</p>
        <div class="product-footer">
          <span class="product-price">${formatPrice(p.price)} <small>€</small></span>
          <button class="add-btn" data-id="${p.id}" aria-label="Ajouter ${escHtml(p.name)} au panier"
            ${!inStock ? 'disabled aria-disabled="true"' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
    </article>`;
  }).join('');

  // Délégation d'événement sur la grille
  grid.addEventListener('click', e => {
    const btn = e.target.closest('.add-btn');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    const product = products.find(p => p.id === id);
    if (product) {
      onAdd(product);
      // micro-animation
      btn.classList.add('pop');
      btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
    }
  });
}

// ── Panier ──────────────────────────────────────────────
export function renderCartBody(items) {
  const el = document.getElementById('cartBody');
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('cartTotal').textContent = formatPrice(total) + ' €';
  document.getElementById('checkoutBtn').disabled = items.length === 0;

  if (!items.length) {
    el.innerHTML = `
      <div class="cart-empty">
        <span class="suit-icon" style="font-size:2.5rem;opacity:.25">♠</span>
        <p>Votre panier est vide</p>
      </div>`;
    return;
  }

  el.innerHTML = items.map(i => `
    <div class="cart-item" data-id="${i.id}">
      <div class="cart-item-suit">${i.suit}</div>
      <div class="cart-item-info">
        <p class="cart-item-name">${escHtml(i.name)}</p>
        <p class="cart-item-price">${formatPrice(i.price)} €</p>
      </div>
      <div class="cart-item-qty">
        <button class="qty-btn" data-action="dec" data-id="${i.id}" aria-label="Diminuer">−</button>
        <span class="qty-num">${i.qty}</span>
        <button class="qty-btn" data-action="inc" data-id="${i.id}" aria-label="Augmenter">+</button>
      </div>
    </div>
  `).join('');
}

export function renderOrderSummary(items) {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('orderSummary').innerHTML = `
    ${items.map(i => `
      <div class="summary-line">
        <span>${escHtml(i.name)} × ${i.qty}</span>
        <span>${formatPrice(i.price * i.qty)} €</span>
      </div>`).join('')}
    <div class="summary-total">
      <span>Total</span>
      <span>${formatPrice(total)} €</span>
    </div>`;
}

// ── Spinner helpers ─────────────────────────────────────
export function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector('.btn-label').classList.toggle('hidden', loading);
  btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
}

// ── Validation de formulaire ────────────────────────────
export function validateForm(formId, rules) {
  let valid = true;
  rules.forEach(({ id, test, msg }) => {
    const el = document.getElementById(id);
    const errEl = el?.closest('.field')?.querySelector('.field-err');
    const ok = test(el?.value?.trim() ?? '');
    if (errEl) errEl.textContent = ok ? '' : msg;
    el?.classList.toggle('invalid', !ok);
    if (!ok) valid = false;
  });
  return valid;
}

// ── Sécurité ────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
