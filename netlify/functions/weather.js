function finlandTimeToUtcIso(time) {
  if (!time) return new Date().toISOString();

  const s = String(time);

  // Jos ajassa on jo Z tai aikavyöhyke, käytetään sellaisenaan
  if (s.endsWith("Z") || /[+-]\d\d:\d\d$/.test(s)) {
    return new Date(s).toISOString();
  }

  // Pesiskausi = kesäaika Suomessa, UTC+3
  const d = new Date(s);
  d.setUTCHours(d.getUTCHours() - 3);
  return d.toISOString();
}

function pick(series, time) {
  if (!series.length) return null;

  const target = new Date(time).getTime();

  let best = series[0];
  let bd = Math.abs(new Date(series[0].time).getTime() - target);

  for (const x of series) {
    const d = Math.abs(new Date(x.time).getTime() - target);
    if (d < bd) {
      best = x;
      bd = d;
    }
  }

  return best.value;
}

function extract(xml, param) {
  const members = xml.split(/<wfs:member>/).slice(1);

  const member = members.find(x =>
    x.includes(`param=${param}`) ||
    x.includes(`param%3D${param}`) ||
    x.includes(`-${param}`)
  );

  if (!member) return [];

  const out = [];

  const timeRe = /<gml:timePosition>(.*?)<\/gml:timePosition>/g;
  const valueRe = /<wml2:value>(.*?)<\/wml2:value>/g;

  const times = [];
  const values = [];

  let mt;
  while ((mt = timeRe.exec(member)) !== null) {
    times.push(mt[1]);
  }

  let mv;
  while ((mv = valueRe.exec(member)) !== null) {
    const v = Number(mv[1]);
    if (Number.isFinite(v)) values.push(v);
  }

  const n = Math.min(times.length, values.length);

  for (let i = 0; i < n; i++) {
    out.push({
      time: times[i],
      value: values[i]
    });
  }

  return out;
}

exports.handler = async function(event) {
  const q = event.queryStringParameters || {};
  const lat = q.lat;
  const lon = q.lon;
  const time = q.time || new Date().toISOString();

  if (!lat || !lon) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "lat/lon puuttuu" })
    };
  }

const targetUtc = time;

  const params = "Temperature,WindSpeedMS,Precipitation1h";

  const url =
    "https://opendata.fmi.fi/wfs" +
    "?service=WFS" +
    "&version=2.0.0" +
    "&request=getFeature" +
    "&storedquery_id=fmi::forecast::harmonie::surface::point::timevaluepair" +
    "&latlon=" + encodeURIComponent(lat + "," + lon) +
    "&parameters=" + encodeURIComponent(params);

  try {
    const r = await fetch(url);
    const xml = await r.text();
    console.log(xml.substring(0, 5000));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        source: "FMI Open Data",
        originalTime: time,
        targetUtc: targetUtc,
temperature: pick(extract(xml, "Temperature"), targetUtc),
windSpeed: pick(extract(xml, "WindSpeedMS"), targetUtc),
precipitation: pick(extract(xml, "Precipitation1h"), targetUtc),
windDirection: pick(extract(xml, "WindDirection"), targetUtc)
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
