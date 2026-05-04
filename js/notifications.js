/**
 * notifications.js — Notification bell widget & push permission
 */

import { fetchNotifications, markNotificationsRead } from './supabase.js';

export async function initNotifications(containerSelector, { isAdmin = false } = {}) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'notif-widget';
  wrapper.innerHTML = `
    <button class="notif-bell" aria-label="Notifications" aria-expanded="false">
      🔔
      <span class="notif-badge" style="display:none">0</span>
    </button>
    <div class="notif-dropdown" hidden>
      <div class="notif-header">
        <span class="notif-title">Notifications</span>
        <button class="notif-mark-all">Tout lire</button>
      </div>
      <ul class="notif-list">
        <li class="notif-empty">Chargement…</li>
      </ul>
    </div>
  `;
  container.appendChild(wrapper);

  const bell = wrapper.querySelector('.notif-bell');
  const badge = wrapper.querySelector('.notif-badge');
  const dropdown = wrapper.querySelector('.notif-dropdown');
  const list = wrapper.querySelector('.notif-list');
  const markAllBtn = wrapper.querySelector('.notif-mark-all');

  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    bell.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) await renderList();
  });

  document.addEventListener('click', () => {
    dropdown.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
  });
  dropdown.addEventListener('click', e => e.stopPropagation());

  markAllBtn.addEventListener('click', async () => {
    const { data } = await fetchNotifications(50);
    const unread = (data || []).filter(n => !n.read).map(n => n.id);
    if (unread.length) {
      await markNotificationsRead(unread);
      await renderList();
      updateBadge(0);
    }
  });

  async function renderList() {
    list.innerHTML = '<li class="notif-empty">Chargement…</li>';
    const { data, error } = await fetchNotifications(20);
    if (error || !data) { list.innerHTML = '<li class="notif-empty">Erreur</li>'; return; }
    if (!data.length) { list.innerHTML = '<li class="notif-empty">Aucune notification</li>'; updateBadge(0); return; }

    const TYPE_ICONS = { new_order:'🛍️', new_custom_request:'✏️', payment_received:'💳', low_stock:'⚠️' };

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

    list.querySelectorAll('.notif-item.unread').forEach(el => {
      el.addEventListener('click', async () => {
        await markNotificationsRead([el.dataset.id]);
        el.classList.remove('unread');
        el.querySelector('.notif-dot')?.remove();
        updateBadge(list.querySelectorAll('.notif-item.unread').length);
      });
    });

    updateBadge(data.filter(n => !n.read).length);
  }

  function updateBadge(count) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }

  await renderList();
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}