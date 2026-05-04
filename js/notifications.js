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
