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

  let groups = ["Runkosarja"];

  if (level === "Ykköspesis" && series === "Naiset") {
    groups = [
      "Etelälohko",
      "Pohjoislohko",
      "Lohkojen väliset ristikkäisottelut"
    ];
  }

  try {
    const all = [];

    for (const group of groups) {
      const url =
        base +
        "&group=" + encodeURIComponent(group) +
        "&apikey=" + key;

      const r = await fetch(url);
      const text = await r.text();

      if (!r.ok) continue;

      try {
        const json = JSON.parse(text);

        if (Array.isArray(json)) {
          for (const item of json) {
            all.push(item);
          }
        }
      } catch (e) {}
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      },
      body: JSON.stringify(all)
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: e.message })
    };
  }
};
