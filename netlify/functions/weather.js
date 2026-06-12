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
  const members = xml.split("</wfs:member>").slice(1);

  const member = members.find(x =>
  x.toLowerCase().includes(param.toLowerCase())
);

  if (!member) return [];

  const out = [];

  const re =
    /<wml2:MeasurementTVP>[\s\S]*?<wml2:time>(.*?)<\/wml2:time>[\s\S]*?<wml2:value>(.*?)<\/wml2:value>[\s\S]*?<\/wml2:MeasurementTVP>/g;

  let m;
  while ((m = re.exec(member)) !== null) {
    const v = Number(m[2]);
    if (Number.isFinite(v)) {
      out.push({
        time: m[1],
        value: v
      });
    }
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
console.log(xml);

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
        requestedTime: time,
temperature:
  pick(extract(xml, "Temperature"), targetUtc) ??
  pick(extract(xml, "temperature"), targetUtc) ??
  pick(extract(xml, "t2m"), targetUtc),
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
