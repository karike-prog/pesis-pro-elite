exports.handler = async function(event) {
  const q = event.queryStringParameters || {};
  const id = q.id;

  if (!id) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "id puuttuu" })
    };
  }

const url =
  `https://api.pesistulokset.fi/api/v1/public/match?id=${id}&apikey=wRX0tTke3DZ8RLKAMntjZ81LwgNQuSN9`;

  try {
    const r = await fetch(url, {
      headers: {
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `https://www.pesistulokset.fi/ottelut/${id}`,
        "User-Agent": "Mozilla/5.0"
      }
    });

    const text = await r.text();

    if (text.trim().startsWith("<")) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Pesistulokset palautti HTML:n",
          url: url,
          start: text.slice(0, 200)
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: text
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message })
    };
  }
};
