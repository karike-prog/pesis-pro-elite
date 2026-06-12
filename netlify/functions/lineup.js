exports.handler = async function(event) {
  const q = event.queryStringParameters || {};
  const id = q.id;

  if (!id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "id puuttuu" })
    };
  }

  const url =
    `https://www.pesistulokset.fi/taso/rest/match?id=${id}&apikey=wRX0tTke3DZ8RLKAMntjZ81LwgNQuSN9`;

  try {
    const r = await fetch(url);
    const text = await r.text();

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
      body: JSON.stringify({ error: e.message })
    };
  }
};
