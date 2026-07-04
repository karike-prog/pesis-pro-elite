exports.handler = async function (event) {
  try {
    const apiKey = process.env.PESIS_API_KEY;

    const series = event.queryStringParameters?.series || "Miehet";

    const seasonSeries =
      series === "Naiset"
        ? "NAISTEN_SARJA_ID_TÄHÄN"
        : "2945";

    const url =
      "https://api.pesistulokset.fi/api/v1/stats-tool/players" +
      `?seasonSeries=${seasonSeries}` +
      "&season=110" +
      "&phase=1" +
      "&level=1" +
      "&series=1" +
      "&sum=true" +
      "&statFilter=layout" +
      `&apiKey=${apiKey}`;

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
