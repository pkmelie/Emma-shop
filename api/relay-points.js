/**
 * api/relay-points.js — Proxy Vercel pour le WebService SOAP Mondial Relay
 *
 * La requête SOAP est faite côté serveur (pas de CORS).
 * GET /api/relay-points?zip=44160
 */

const MR_WS_URL = 'https://www.mondialrelay.fr/WebService/Web_Services.asmx';
const MR_ENSEIGNE = 'CC_DEMO '; // ← remplacer par votre enseigne Mondial Relay

export default async function handler(req, res) {
  // CORS — autoriser votre domaine Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { zip } = req.query;

  if (!zip || !/^\d{4,5}$/.test(zip)) {
    return res.status(400).json({ error: 'Code postal invalide' });
  }

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI_RecherchePointRelais xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${MR_ENSEIGNE}</Enseigne>
      <Pays>FR</Pays>
      <CP>${zip}</CP>
      <Nombre>7</Nombre>
      <DelaiEnvoi>0</DelaiEnvoi>
      <RayonRecherche>20</RayonRecherche>
      <TypeActivite>EXP</TypeActivite>
    </WSI_RecherchePointRelais>
  </soap:Body>
</soap:Envelope>`;

  try {
    const mrRes = await fetch(MR_WS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.mondialrelay.fr/webservice/WSI_RecherchePointRelais',
      },
      body: soapBody,
    });

    if (!mrRes.ok) {
      return res.status(502).json({ error: `Mondial Relay WS error: ${mrRes.status}` });
    }

    const xml = await mrRes.text();

    // Parser le XML côté serveur avec regex (pas de DOM côté Node)
    const points = [];
    const matches = xml.matchAll(/<PointRelais_Details>([\s\S]*?)<\/PointRelais_Details>/g);

    for (const match of matches) {
      const block = match[1];
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`));
        return m ? m[1].trim() : '';
      };

      const lat = parseFloat(get('Latitude').replace(',', '.'));
      const lon = parseFloat(get('Longitude').replace(',', '.'));

      if (!lat || !lon) continue;

      points.push({
        id:   get('Num'),
        name: get('LgAdr1') || get('LgAdr2') || 'Point Relais',
        addr: [get('LgAdr3'), get('LgAdr4')].filter(Boolean).join(', '),
        city: get('Ville'),
        zip:  get('CP'),
        lat,
        lon,
      });
    }

    res.status(200).json({ points });

  } catch (err) {
    console.error('relay-points error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}
