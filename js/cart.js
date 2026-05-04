/**
 * cart.js — Gestion du panier (state + localStorage)
 */

const STORAGE_KEY = 'lcr_cart_v1';

// ── État interne ────────────────────────────────────────
let _items = load();
const _listeners = new Set();

// ── Persistance ────────────────────────────────────────
function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_items));
  _listeners.forEach(fn => fn([..._items]));
}

// ── API publique ───────────────────────────────────────

/** S'abonner aux changements du panier */
export function subscribe(fn) {
  _listeners.add(fn);
  fn([..._items]); // état initial immédiatement
  return () => _listeners.delete(fn);
}

/** Tous les items actuels (copie) */
export function getItems() {
  return [..._items];
}

/** Total TTC */
export function getTotal() {
  return _items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

/** Nombre d'articles (somme des qty) */
export function getCount() {
  return _items.reduce((sum, i) => sum + i.qty, 0);
}

/**
 * Ajoute un produit. Si déjà présent, incrémente la quantité.
 * @param {{ id, name, price, suit_icon }} product
 */
export function addItem(product) {
  const existing = _items.find(i => i.id === product.id);
  if (existing) {
    existing.qty++;
  } else {
    _items.push({
      id:    product.id,
      name:  product.name,
      price: product.price,
      suit:  product.suit_icon || '♠',
      qty:   1,
    });
  }
  persist();
}

/**
 * Modifie la quantité d'un item (+1 / -1)
 * Si qty tombe à 0 ou moins → retire l'item
 * @param {string} id
 * @param {number} delta  +1 ou -1
 */
export function changeQty(id, delta) {
  const item = _items.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) _items = _items.filter(i => i.id !== id);
  persist();
}

/** Retire complètement un item */
export function removeItem(id) {
  _items = _items.filter(i => i.id !== id);
  persist();
}

/** Vide le panier */
export function clear() {
  _items = [];
  persist();
}
