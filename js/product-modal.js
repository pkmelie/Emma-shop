/**
 * product-modal.js — Modal de détail produit
 * ────────────────────────────────────────────
 * Exports:
 *   initProductModal(onAdd)   — à appeler une fois au DOMContentLoaded
 *   openProductModal(product) — ouvre la modal pour un produit donné
 */

let _onAdd = null;

// ── Crée la modal dans le DOM ──────────────────────────
function createModalHTML() {
  const el = document.createElement('div');
  el.id = 'productModal';
  el.className = 'product-modal-wrap hidden';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Détail produit');
  el.innerHTML = `
    <div class="product-modal" id="productModalBox">
      <button class="product-modal-close icon-btn light" id="productModalClose" aria-label="Fermer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <div class="product-modal-media" id="productModalMedia"></div>

      <div class="product-modal-info">
        <span class="product-badge" id="productModalBadge" style="display:none"></span>
        <h2 class="product-modal-name" id="productModalName"></h2>
        <p class="product-modal-desc" id="productModalDesc"></p>
        <p class="product-modal-price" id="productModalPrice"></p>

        <button class="btn btn-primary product-modal-add" id="productModalAdd">
          <span class="btn-label">Ajouter au panier</span>
        </button>
      </div>
    </div>
    <div class="product-modal-backdrop" id="productModalBackdrop"></div>
  `;
  document.body.appendChild(el);
}

// ── Init (une seule fois) ──────────────────────────────
export function initProductModal(onAdd) {
  _onAdd = onAdd;
  createModalHTML();

  document.getElementById('productModalClose').addEventListener('click', closeProductModal);
  document.getElementById('productModalBackdrop').addEventListener('click', closeProductModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeProductModal();
  });

  document.getElementById('productModalAdd').addEventListener('click', () => {
    const product = _currentProduct;
    if (product && _onAdd) {
      _onAdd(product);
      // animation rapide sur le bouton
      const btn = document.getElementById('productModalAdd');
      btn.textContent = '✓ Ajouté !';
      setTimeout(() => { btn.innerHTML = '<span class="btn-label">Ajouter au panier</span>'; }, 1200);
    }
  });
}

// ── Ouvrir ─────────────────────────────────────────────
let _currentProduct = null;

export function openProductModal(product) {
  _currentProduct = product;

  // Média
  const media = document.getElementById('productModalMedia');
  media.innerHTML = product.image_url
    ? `<img src="${esc(product.image_url)}" alt="${esc(product.name)}" class="product-modal-img" />`
    : `<div class="product-placeholder product-modal-placeholder">
         <span class="suit-icon">${esc(product.suit_icon || '♠')}</span>
       </div>`;

  // Infos
  const badge = document.getElementById('productModalBadge');
  if (product.badge) {
    badge.textContent = product.badge;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }

  document.getElementById('productModalName').textContent  = product.name;
  document.getElementById('productModalDesc').textContent  = product.description || '';
  document.getElementById('productModalPrice').textContent =
    Number(product.price).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €';

  // Reset bouton
  document.getElementById('productModalAdd').innerHTML = '<span class="btn-label">Ajouter au panier</span>';

  // Afficher
  document.getElementById('productModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// ── Fermer ─────────────────────────────────────────────
function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
  document.body.style.overflow = '';
  _currentProduct = null;
}

// ── Utilitaire ─────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
