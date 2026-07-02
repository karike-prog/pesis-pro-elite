exports.handler = async function () {
  try {
    const apiKey = process.env.PESIS_API_KEY;

    const url =
      `https://api.pesistulokset.fi/api/v1/stats-tool/players` +
      `?seasonSeries=2945` +
      `&season=110` +
      `&phase=1` +
      `&level=1` +
      `&series=1` +
      `&sum=true` +
      `&statfilter=lyodyt` +
      `&apikey=${apiKey}`;

    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({
          error: "Player stats fetch failed",
          status: res.status,
          response: text
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
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
