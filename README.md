# La Carte Royale — Guide de mise en place

## Structure du projet

```
carte-royale/
├── frontend/
│   └── index.html          ← Site complet (boutique + panier + contact + tarifs)
└── supabase/
    └── schema.sql           ← Base de données à importer dans Supabase
```

---

## 1. Configurer Supabase

### a) Créer un projet
1. Va sur **https://supabase.com** → New project
2. Choisis un nom (ex: `carte-royale`), un mot de passe fort, la région **West EU (Paris)**
3. Attends ~2 minutes que le projet soit prêt

### b) Créer les tables
1. Dans le dashboard Supabase → **SQL Editor** → New query
2. Colle le contenu de `supabase/schema.sql`
3. Clique **Run** — toutes les tables, données de démo et politiques RLS sont créées

### c) Récupérer les clés API
1. Supabase → **Settings** → **API**
2. Copie :
   - `Project URL` → ex: `https://abcdef.supabase.co`
   - `anon public` key → longue chaîne commençant par `eyJ...`

---

## 2. Configurer le site

Ouvre `frontend/index.html` et remplace les deux lignes en haut du `<script>` :

```js
const SUPABASE_URL  = 'https://VOTRE_PROJECT_REF.supabase.co';
const SUPABASE_ANON = 'VOTRE_ANON_PUBLIC_KEY';
```

Par tes vraies valeurs :

```js
const SUPABASE_URL  = 'https://abcdefghij.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## 3. Héberger le site

### Option A — Netlify (gratuit, recommandé)
1. Va sur **https://netlify.com** → "Add new site" → "Deploy manually"
2. Glisse-dépose le dossier `frontend/` dans la zone de dépôt
3. Ton site est en ligne en 30 secondes avec une URL `xxx.netlify.app`

### Option B — Vercel
```bash
npx vercel --cwd frontend
```

### Option C — GitHub Pages
1. Crée un repo GitHub
2. Pousse le dossier `frontend/`
3. Settings → Pages → Branch: main → Folder: /frontend

---

## 4. Ajouter tes vrais produits

### Via le dashboard Supabase (Table Editor)
1. Supabase → Table Editor → `products`
2. Clique **Insert row**
3. Remplis : `name`, `description`, `price`, `badge`, `category`, `suit_icon`
4. Pour ajouter une photo : upload l'image dans **Storage** → copie l'URL publique dans `image_url`

### Via Supabase Storage (photos)
1. Supabase → **Storage** → New bucket : `product-images` (public)
2. Upload tes images
3. Copie l'URL publique : `https://xxx.supabase.co/storage/v1/object/public/product-images/nom-image.jpg`
4. Colle dans le champ `image_url` du produit correspondant

---

## 5. Voir les commandes (Admin)

Dans **Supabase → Table Editor** tu peux voir :
- `orders` — toutes les commandes avec statut, total, adresse
- `order_items` — détail de chaque commande
- `custom_requests` — les demandes de personnalisation
- Vue `orders_full` — commandes + articles regroupés

Pour changer le statut d'une commande :
```sql
UPDATE orders SET status = 'shipped' WHERE id = 'uuid-ici';
```

Statuts disponibles : `pending` → `confirmed` → `shipped` → `delivered` → `cancelled`

---

## 6. Résumé des tables Supabase

| Table            | Description                        |
|------------------|------------------------------------|
| `products`       | Catalogue des produits             |
| `orders`         | Commandes clients                  |
| `order_items`    | Lignes de chaque commande          |
| `custom_requests`| Demandes de cartes personnalisées  |

---

## Notes importantes

- Le panier est sauvegardé dans le `localStorage` du navigateur
- Les paiements en ligne (Stripe) ne sont pas inclus — tu peux les ajouter via Supabase Edge Functions
- Pour recevoir un email à chaque commande, active les **Webhooks** Supabase vers un service comme Resend ou SendGrid
