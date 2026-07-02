
exports.handler = async function () {
  try {
    const url =
      "https://www.pesistulokset.fi/api/players?seasonSeriesId=2945";

    const res = await fetch(url);

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: "Player stats fetch failed" })
      };
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
