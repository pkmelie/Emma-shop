/**
 * notifications.js — Notification bell widget & push permission
 * ──────────────────────────────────────────────────────────────
 * Exports:
 *   initNotifications(containerSelector, { isAdmin })
 *   requestNotificationPermission()
 */

import { db, fetchNotifications, markNotificationsRead } from './supabase.js';

// ═══════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════

/**
 * Mount a notification bell button inside `containerSelector`.
 * Clicking it toggles a dropdown of recent notifications.
 *
 * @param {string} containerSelector  CSS selector for the mount point
 * @param {{ isAdmin: boolean }}       options
 */
export async function initNotifications(containerSelector, { isAdmin = false } = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  // ── Build bell widget ──────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'notif-widget';
  wrapper.innerHTML = `
  `;

  container.appendChild(wrapper);

  const bell      = wrapper.querySelector('.notif-bell');
  const badge     = wrapper.querySelector('.notif-badge');
  const dropdown  = wrapper.querySelector('.notif-dropdown');
  const list      = wrapper.querySelector('.notif-list');
  const markAllBtn = wrapper.querySelector('.notif-mark-all');

  // ── Toggle dropdown ────────────────────────────────────────
  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    bell.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) await renderList();
  });

  // Close on outside click
  document.addEventListener('click', () => {
    dropdown.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
  });
  dropdown.addEventListener('click', e => e.stopPropagation());

  // ── Mark all read ──────────────────────────────────────────
  markAllBtn.addEventListener('click', async () => {
    const { data } = await fetchNotifications(50);
    const unread = (data || []).filter(n => !n.read).map(n => n.id);
    if (unread.length) {
      await markNotificationsRead(unread);
      await renderList();
      updateBadge(0);
    }
  });

  // ── Initial badge count ────────────────────────────────────
  async function renderList() {
    list.innerHTML = '<li class="notif-empty">Chargement…</li>';
    const { data, error } = await fetchNotifications(20);
    if (error || !data) {
      list.innerHTML = '<li class="notif-empty">Erreur de chargement</li>';
      return;
    }
    if (!data.length) {
      list.innerHTML = '<li class="notif-empty">Aucune notification</li>';
      updateBadge(0);
      return;
    }

    const TYPE_ICONS = {
      new_order:          '🛍️',
      new_custom_request: '✏️',
      payment_received:   '💳',
      low_stock:          '⚠️',
    };

    list.innerHTML = data.map(n => `
      <li class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
        <span class="notif-icon">${TYPE_ICONS[n.type] || '🔔'}</span>
        <div class="notif-body">
          <p class="notif-item-title">${esc(n.title)}</p>
          <p class="notif-item-msg">${esc(n.message || '')}</p>
          <p class="notif-item-time">${fmtDate(n.created_at)}</p>
        </div>
        ${!n.read ? '<span class="notif-dot"></span>' : ''}
      </li>
    `).join('');

    // Click on item → mark it read
    list.querySelectorAll('.notif-item.unread').forEach(el => {
      el.addEventListener('click', async () => {
        await markNotificationsRead([el.dataset.id]);
        el.classList.remove('unread');
        el.querySelector('.notif-dot')?.remove();
        const remaining = list.querySelectorAll('.notif-item.unread').length;
        updateBadge(remaining);
      });
    });

    const unreadCount = data.filter(n => !n.read).length;
    updateBadge(unreadCount);
  }

  function updateBadge(count) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }

  await renderList();
}

/**
 * Ask the browser for push-notification permission (front-end only).
 * Safe to call even if notifications are not supported.
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}
