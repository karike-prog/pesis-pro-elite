exports.handler = async function(event) {
  const key = "wRX0tTke3DZ8RLKAMntjZ81LwgNQuSN9";
  const q = event.queryStringParameters || {};

  const level = q.level || "Superpesis";
  const series = q.series || "Miehet";

  const base =
    "https://api.pesistulokset.fi/api/v1/public/matches" +
    "?season=2026" +
    "&level=" + encodeURIComponent(level) +
    "&region=" +
    "&series=" + encodeURIComponent(series) +
    "&phase=Runkosarja";

  const urls = [
    base + "&group=Runkosarja&apikey=" + key,
    base + "&apikey=" + key
  ];

  try {
    let lastText = "[]";
    let lastStatus = 200;

    for (const url of urls) {
      const r = await fetch(url);
      const text = await r.text();

      lastText = text;
      lastStatus = r.status;

      try {
        const json = JSON.parse(text);
        if (Array.isArray(json) && json.length > 0) {
          return {
            statusCode: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=60"
            },
            body: text
          };
        }
      } catch (e) {}
    }

    return {
      statusCode: lastStatus,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      },
      body: lastText
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message })
    };
  }
};
