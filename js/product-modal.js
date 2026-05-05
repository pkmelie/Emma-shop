/**
 * product-modal.js — Modal de détail produit avec carousel d'images
 */

let _onAdd = null;
let _currentProduct = null;
let _images = [];
let _currentIndex = 0;

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
        <div class="pm-carousel" id="pmCarousel">
          <div class="pm-carousel-track" id="pmTrack"></div>
          <button class="pm-carousel-btn pm-carousel-prev" id="pmPrev" aria-label="Image précédente">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="pm-carousel-btn pm-carousel-next" id="pmNext" aria-label="Image suivante">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div class="pm-thumbs" id="pmThumbs"></div>
        <div class="pm-suits" aria-hidden="true">
          <span>♠</span><span>♥</span><span>♦</span><span>♣</span>
        </div>
      </div>

      <div class="pm-right">
        <button class="pm-close" id="pmClose" aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="pm-eyebrow" id="pmBadge"></div>
        <h2 class="pm-name" id="pmName"></h2>
        <div class="pm-divider"></div>
        <p class="pm-desc" id="pmDesc"></p>
        <div class="pm-details">
          <div class="pm-detail-item"><span class="pm-detail-icon">♠</span><span>54 cartes · Format standard</span></div>
          <div class="pm-detail-item"><span class="pm-detail-icon">✦</span><span>Fabrication artisanale · France</span></div>
          <div class="pm-detail-item"><span class="pm-detail-icon">◈</span><span>Boîte rigide incluse</span></div>
          <div class="pm-detail-item"><span class="pm-detail-icon">→</span><span>Livraison 3–7 jours ouvrés</span></div>
        </div>
        <div class="pm-footer">
          <div class="pm-price-block">
            <span class="pm-price-label">Prix</span>
            <span class="pm-price" id="pmPrice"></span>
          </div>
          <button class="pm-add-btn" id="pmAdd">
            <span class="pm-add-label">Ajouter au panier</span>
            <svg class="pm-add-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
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

// ── Carousel ────────────────────────────────────────────

function buildCarousel(images) {
  _images = images;
  _currentIndex = 0;

  const track = document.getElementById('pmTrack');
  const thumbs = document.getElementById('pmThumbs');
  const prev   = document.getElementById('pmPrev');
  const next   = document.getElementById('pmNext');

  track.innerHTML = images.map((src, i) => `
    <div class="pm-slide ${i === 0 ? 'pm-slide-active' : ''}" data-index="${i}">
      <img src="${esc(src)}" alt="Image ${i + 1}" class="pm-img" loading="${i === 0 ? 'eager' : 'lazy'}" />
    </div>
  `).join('');

  if (images.length > 1) {
    thumbs.innerHTML = images.map((src, i) => `
      <button class="pm-thumb ${i === 0 ? 'pm-thumb-active' : ''}" data-index="${i}" aria-label="Voir image ${i + 1}">
        <img src="${esc(src)}" alt="" loading="lazy" />
      </button>
    `).join('');
    thumbs.style.display = '';
    prev.style.display = '';
    next.style.display = '';
  } else {
    thumbs.innerHTML = '';
    thumbs.style.display = 'none';
    prev.style.display = 'none';
    next.style.display = 'none';
  }
}

function buildPlaceholder(suit) {
  const suits = ['♠', '♥', '♦', '♣'];
  const s = suit || suits[Math.floor(Math.random() * suits.length)];
  document.getElementById('pmPrev').style.display = 'none';
  document.getElementById('pmNext').style.display = 'none';
  const thumbs = document.getElementById('pmThumbs');
  thumbs.style.display = 'none';
  thumbs.innerHTML = '';
  document.getElementById('pmTrack').innerHTML = `
    <div class="pm-slide pm-slide-active">
      <div class="pm-placeholder">
        <span class="pm-placeholder-suit">${esc(s)}</span>
        <div class="pm-placeholder-grid" aria-hidden="true">
          ${Array(9).fill(`<span>${esc(s)}</span>`).join('')}
        </div>
      </div>
    </div>`;
}

function goToSlide(index) {
  if (_images.length === 0) return;
  if (index < 0) index = _images.length - 1;
  if (index >= _images.length) index = 0;
  _currentIndex = index;
  document.querySelectorAll('.pm-slide').forEach((el, i) => {
    el.classList.toggle('pm-slide-active', i === index);
  });
  document.querySelectorAll('.pm-thumb').forEach((el, i) => {
    el.classList.toggle('pm-thumb-active', i === index);
  });
}

// ── Init ────────────────────────────────────────────────

export function initProductModal(onAdd) {
  _onAdd = onAdd;
  createModalHTML();

  document.getElementById('pmClose').addEventListener('click', closeProductModal);
  document.getElementById('pmBackdrop').addEventListener('click', closeProductModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape')      closeProductModal();
    if (e.key === 'ArrowLeft')   goToSlide(_currentIndex - 1);
    if (e.key === 'ArrowRight')  goToSlide(_currentIndex + 1);
  });

  document.getElementById('pmPrev').addEventListener('click', () => goToSlide(_currentIndex - 1));
  document.getElementById('pmNext').addEventListener('click', () => goToSlide(_currentIndex + 1));

  document.getElementById('pmThumbs').addEventListener('click', e => {
    const btn = e.target.closest('.pm-thumb');
    if (btn) goToSlide(Number(btn.dataset.index));
  });

  // Swipe mobile
  let touchStartX = 0;
  const carousel = document.getElementById('pmCarousel');
  carousel.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) goToSlide(_currentIndex + (diff > 0 ? 1 : -1));
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

  // Fusionner image_url + images[]
  let allImages = [];
  if (product.image_url) allImages.push(product.image_url);
  if (Array.isArray(product.images)) {
    product.images.forEach(url => {
      if (url && !allImages.includes(url)) allImages.push(url);
    });
  }

  if (allImages.length > 0) {
    buildCarousel(allImages);
  } else {
    buildPlaceholder(product.suit_icon);
  }

  document.getElementById('pmBadge').textContent = product.badge || 'Collection Artisanale';
  document.getElementById('pmName').textContent  = product.name;
  document.getElementById('pmDesc').textContent  = product.description ||
    "Un jeu de cartes d'exception, conçu et fabriqué à la main en France avec des matériaux soigneusement sélectionnés.";
  document.getElementById('pmPrice').textContent =
    Number(product.price).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

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
