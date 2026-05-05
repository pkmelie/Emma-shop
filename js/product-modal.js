/**
 * product-modal.js — Modal de détail produit (version premium)
 */

let _onAdd = null;
let _currentProduct = null;

function createModalHTML() {
  const el = document.createElement('div');
  el.id = 'productModal';
  el.className = 'pm-wrap hidden';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Détail produit');
  el.innerHTML = `
    <div class="pm-box" id="productModalBox">

      <div class="pm-left">
        <div class="pm-media" id="pmMedia"></div>
        <div class="pm-suits" aria-hidden="true">
          <span>♠</span><span>♥</span><span>♦</span><span>♣</span>
        </div>
      </div>

      <div class="pm-right">
        <button class="pm-close" id="pmClose" aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.8">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div class="pm-eyebrow" id="pmBadge"></div>
        <h2 class="pm-name" id="pmName"></h2>
        <div class="pm-divider"></div>
        <p class="pm-desc" id="pmDesc"></p>

        <div class="pm-details">
          <div class="pm-detail-item">
            <span class="pm-detail-icon">♠</span>
            <span>54 cartes · Format standard</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-icon">✦</span>
            <span>Fabrication artisanale · France</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-icon">◈</span>
            <span>Boîte rigide incluse</span>
          </div>
          <div class="pm-detail-item">
            <span class="pm-detail-icon">→</span>
            <span>Livraison 3–7 jours ouvrés</span>
          </div>
        </div>

        <div class="pm-footer">
          <div class="pm-price-block">
            <span class="pm-price-label">Prix</span>
            <span class="pm-price" id="pmPrice"></span>
          </div>
          <button class="pm-add-btn" id="pmAdd">
            <span class="pm-add-label">Ajouter au panier</span>
            <svg class="pm-add-icon" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
    <div class="pm-backdrop" id="pmBackdrop"></div>
  `;
  document.body.appendChild(el);
}

export function initProductModal(onAdd) {
  _onAdd = onAdd;
  createModalHTML();

  document.getElementById('pmClose').addEventListener('click', closeProductModal);
  document.getElementById('pmBackdrop').addEventListener('click', closeProductModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeProductModal();
  });

  document.getElementById('pmAdd').addEventListener('click', () => {
    if (!_currentProduct || !_onAdd) return;
    _onAdd(_currentProduct);
    const btn   = document.getElementById('pmAdd');
    const label = btn.querySelector('.pm-add-label');
    btn.classList.add('pm-added');
    label.textContent = '✓ Ajouté !';
    setTimeout(() => {
      btn.classList.remove('pm-added');
      label.textContent = 'Ajouter au panier';
    }, 1400);
  });
}

export function openProductModal(product) {
  _currentProduct = product;

  const media = document.getElementById('pmMedia');
  if (product.image_url) {
    media.innerHTML = `<img src="${esc(product.image_url)}" alt="${esc(product.name)}" class="pm-img" />`;
  } else {
    const suits = ['♠', '♥', '♦', '♣'];
    const suit  = product.suit_icon || suits[Math.floor(Math.random() * suits.length)];
    media.innerHTML = `
      <div class="pm-placeholder">
        <span class="pm-placeholder-suit">${esc(suit)}</span>
        <div class="pm-placeholder-grid" aria-hidden="true">
          ${Array(9).fill(`<span>${esc(suit)}</span>`).join('')}
        </div>
      </div>`;
  }

  const badge = document.getElementById('pmBadge');
  badge.textContent = product.badge || 'Collection Artisanale';

  document.getElementById('pmName').textContent = product.name;
  document.getElementById('pmDesc').textContent = product.description || "Un jeu de cartes d'exception, conçu et fabriqué à la main en France avec des matériaux soigneusement sélectionnés.";
  document.getElementById('pmPrice').textContent =
    Number(product.price).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €';

  const btn = document.getElementById('pmAdd');
  btn.classList.remove('pm-added');
  btn.querySelector('.pm-add-label').textContent = 'Ajouter au panier';

  const wrap = document.getElementById('productModal');
  wrap.classList.remove('hidden');
  requestAnimationFrame(() => wrap.classList.add('pm-open'));
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  const wrap = document.getElementById('productModal');
  wrap.classList.remove('pm-open');
  wrap.addEventListener('transitionend', () => {
    wrap.classList.add('hidden');
  }, { once: true });
  document.body.style.overflow = '';
  _currentProduct = null;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
