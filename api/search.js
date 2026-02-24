export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { perfume, sites } = req.body;

  if (!perfume || !sites) {
    return res.status(400).json({ error: 'Faltan parámetros: perfume y sites son requeridos' });
  }

  const siteList = sites
    .filter(s => s.active)
    .map(s => `- ${s.name} (${s.url})`)
    .join('\n');

  const prompt = `You are a perfume price assistant for Argentina.
The user is searching for: "${perfume}"

Return ONLY a raw JSON object. No markdown, no backticks, no explanation. Just the JSON.

Use this exact structure:
{"perfumeName":"official name","brand":"brand name","results":[{"store":"store name","url":"https://site.com","size_ml":100,"price_ars":183150,"available":true}],"notes":"optional note"}

Sites to check:
${siteList}

Rules:
- price_ars must be a plain number with no dots, commas or currency symbols (e.g. 183150 not $183.150)
- size_ml must be a plain integer (e.g. 100)
- available must be true or false
- If price is unknown, set price_ars to null and available to false
- Use approximate prices based on Argentine market knowledge 2025/2026
- Include one entry per store per size
- The response must start with { and end with } and be valid JSON`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err?.error?.message || 'API error' });
    }

    const data = await response.json();
    const text = data.content?.map(b => b.text || '').join('') || '';

    // Robust JSON extraction
    let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (_) {
      const fixed = clean
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/:\s*'([^']*)'/g, ':"$1"');
      parsed = JSON.parse(fixed);
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}
