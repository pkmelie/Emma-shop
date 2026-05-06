/**
 * api/relay-points.js — Proxy Vercel pour les points relais
 *
 * 1. Géocode le code postal via Nominatim (gratuit, sans clé)
 * 2. Cherche les points relais via Overpass API (données OSM)
 * 3. Retourne du JSON propre au front
 *
 * GET /api/relay-points?zip=44160
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS  = 'https://overpass-api.de/api/interpreter';
const UA        = 'emma-shop/1.0 (contact@emma-shop.fr)';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { zip } = req.query;
  if (!zip || !/^\d{4,5}$/.test(zip)) {
    return res.status(400).json({ error: 'Code postal invalide' });
  }

  try {
    // 1. Géocoder le code postal
    const geoRes = await fetch(
      `${NOMINATIM}?postalcode=${zip}&country=France&format=json&limit=1`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' } }
    );
    const geoData = await geoRes.json();
    if (!geoData.length) {
      return res.status(404).json({ error: 'Code postal introuvable', points: [] });
    }

    const lat = parseFloat(geoData[0].lat);
    const lon = parseFloat(geoData[0].lon);

    // 2. Overpass — tags OSM couvrant Mondial Relay et points relais colis
    const query = `[out:json][timeout:20];
(
  node["brand"~"Mondial Relay",i](around:8000,${lat},${lon});
  node["operator"~"Mondial Relay",i](around:8000,${lat},${lon});
  node["name"~"Mondial Relay",i](around:8000,${lat},${lon});
  node["amenity"="parcel_locker"](around:8000,${lat},${lon});
  node["parcel_pickup"="yes"](around:8000,${lat},${lon});
  node["delivery:parcel_pickup"="yes"](around:8000,${lat},${lon});
);
out body 15;`;

    const ovRes = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: 'data=' + encodeURIComponent(query),
    });

    if (!ovRes.ok) throw new Error(`Overpass HTTP ${ovRes.status}`);

    const ovData = await ovRes.json();
    const elements = ovData.elements || [];

    // 3. Formater + dédupliquer
    const seen = new Set();
    const points = elements
      .filter(e => e.lat && e.lon)
      .map(e => {
        const t    = e.tags || {};
        const name = t.name || t.brand || t.operator || 'Point Relais';
        const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
        const city = t['addr:city'] || '';
        const pzip = t['addr:postcode'] || zip;
        const key  = `${name}|${addr}|${city}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return { id: `osm-${e.id}`, name, addr, city, zip: pzip, lat: e.lat, lon: e.lon };
      })
      .filter(Boolean)
      .slice(0, 8);

    if (!points.length) {
      return res.status(200).json({
        points: [],
        center: { lat, lon },
        warning: 'Aucun point relais trouvé dans cette zone. Essayez un code postal voisin.',
      });
    }

    return res.status(200).json({ points, center: { lat, lon } });

  } catch (err) {
    console.error('relay-points error:', err);
    return res.status(500).json({ error: 'Erreur serveur : ' + err.message });
  }
}
