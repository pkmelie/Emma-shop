/**
 * Edge Function Supabase — create-checkout
 * ─────────────────────────────────────────
 * Crée une session Stripe Checkout en vérifiant les prix DEPUIS LA BDD.
 * Le client envoie uniquement { product_id, quantity } — jamais les prix.
 *
 * Variables d'environnement à configurer dans Supabase → Settings → Edge Functions :
 *   STRIPE_SECRET_KEY        → sk_live_… ou sk_test_…
 *   STRIPE_SUCCESS_URL       → https://ton-site.com/merci
 *   STRIPE_CANCEL_URL        → https://ton-site.com/#panier
 *   SUPABASE_URL             → injecté automatiquement par Supabase
 *   SUPABASE_SERVICE_ROLE_KEY → injecté automatiquement par Supabase
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

// ── Constantes ───────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Handler ───────────────────────────────────────────────────────────────
serve(async (req: Request) => {

  // Pré-vol CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // 1. Lecture du body — on accepte seulement product_id + quantity
    const { customer, items, orderId } = await req.json() as {
      customer: { firstName: string; lastName: string; email: string };
      items:    { id: string; qty: number }[];   // ← pas de prix ici
      orderId:  string;
    };

    if (!items?.length || !orderId) {
      return json({ error: 'Paramètres manquants.' }, 400);
    }

    // 2. Relecture des prix DEPUIS LA BDD (service_role bypasse le RLS en lecture)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const productIds = items.map(i => i.id);
    const { data: products, error: dbErr } = await supabase
      .from('products')
      .select('id, name, price, active, stock')
      .in('id', productIds);

    if (dbErr || !products) {
      console.error('DB error:', dbErr);
      return json({ error: 'Impossible de vérifier les produits.' }, 500);
    }

    // 3. Vérifications métier : produit actif, stock suffisant
    const productMap = new Map(products.map(p => [p.id, p]));

    for (const item of items) {
      const p = productMap.get(item.id);
      if (!p)          return json({ error: `Produit inconnu : ${item.id}` }, 400);
      if (!p.active)   return json({ error: `Produit indisponible : ${p.name}` }, 400);
      if (p.stock !== null && p.stock < item.qty) {
        return json({ error: `Stock insuffisant pour : ${p.name}` }, 400);
      }
    }

    // 4. Construction des line_items Stripe avec les VRAIS prix BDD
    const lineItems = items.map(item => {
      const p = productMap.get(item.id)!;
      return {
        price_data: {
          currency:     'eur',
          product_data: { name: p.name },
          unit_amount:  Math.round(p.price * 100), // centimes, arrondi sûr
        },
        quantity: item.qty,
      };
    });

    // 5. Calcul du total BDD (pour mettre à jour la commande)
    const verifiedTotal = items.reduce((sum, item) => {
      const p = productMap.get(item.id)!;
      return sum + p.price * item.qty;
    }, 0);

    // 6. Mise à jour de la commande avec les prix vérifiés
    const orderItemUpdates = items.map(item => ({
      order_id:      orderId,
      product_id:    item.id,
      product_name:  productMap.get(item.id)!.name,
      product_price: productMap.get(item.id)!.price,  // prix BDD
      quantity:      item.qty,
    }));

    // Mise à jour order_items avec les vrais prix
    await supabase
      .from('order_items')
      .upsert(orderItemUpdates, { onConflict: 'order_id,product_id' });

    // Mise à jour du total de la commande
    await supabase
      .from('orders')
      .update({ total: parseFloat(verifiedTotal.toFixed(2)) })
      .eq('id', orderId);

    // 7. Création de la session Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode:                 'payment',
      customer_email:       customer.email,
      line_items:           lineItems,
      metadata:             { order_id: orderId },
      success_url: `${Deno.env.get('STRIPE_SUCCESS_URL')}?order_id=${orderId}`,
      cancel_url:   Deno.env.get('STRIPE_CANCEL_URL')!,
    });

    return json({ url: session.url });

  } catch (err) {
    console.error('create-checkout error:', err);
    return json({ error: 'Erreur serveur.' }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
