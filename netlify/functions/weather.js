function finlandTimeToUtcIso(time) {
  if (!time) return new Date().toISOString();

  const s = String(time).trim();

  // Jos aikavyöhyke on jo mukana, älä muuta sitä uudelleen.
  if (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);

    if (Number.isNaN(d.getTime())) {
      throw new Error("Virheellinen aika: " + s);
    }

    return d.toISOString();
  }

  // Esimerkiksi 2026-07-20T18:00:00 = Suomen kesäaikaa UTC+3.
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (!m) {
    throw new Error("Virheellinen Suomen paikallisaika: " + s);
  }

  const utc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]) - 3,
    Number(m[5]),
    Number(m[6] || 0)
  );

  return new Date(utc).toISOString();
}

function pick(series, time) {
  if (!Array.isArray(series) || series.length === 0) {
    return null;
  }

  const target = new Date(time).getTime();

  if (!Number.isFinite(target)) {
    return null;
  }

  let best = null;
  let bestDifference = Infinity;

  for (const item of series) {
    const itemTime = new Date(item.time).getTime();

    if (!Number.isFinite(itemTime)) continue;

    const difference = Math.abs(itemTime - target);

    if (difference < bestDifference) {
      best = item;
      bestDifference = difference;
    }
  }

  return best ? best.value : null;
}

function extract(xml, param) {
  const wanted = String(param).toLowerCase();
  const results = [];

  // Sallii esimerkiksi <wfs:member> ja mahdolliset attribuutit.
  const memberRegex =
    /<(?:\w+:)?member\b[^>]*>([\s\S]*?)<\/(?:\w+:)?member>/gi;

  let memberMatch;

  while ((memberMatch = memberRegex.exec(xml)) !== null) {
    const member = memberMatch[1];

    if (!member.toLowerCase().includes(wanted)) {
      continue;
    }

    const valueRegex =
      /<(?:\w+:)?MeasurementTVP\b[^>]*>[\s\S]*?<(?:\w+:)?time\b[^>]*>(.*?)<\/(?:\w+:)?time>[\s\S]*?<(?:\w+:)?value\b[^>]*>(.*?)<\/(?:\w+:)?value>[\s\S]*?<\/(?:\w+:)?MeasurementTVP>/gi;

    let valueMatch;

    while ((valueMatch = valueRegex.exec(member)) !== null) {
      const time = valueMatch[1].trim();
      const value = Number(valueMatch[2].trim());

      if (
        Number.isFinite(value) &&
        Number.isFinite(new Date(time).getTime())
      ) {
        results.push({
          time,
          value
        });
      }
    }
  }

  return results;
}

exports.handler = async function (event) {
  const q = event.queryStringParameters || {};

  const lat = q.lat;
  const lon = q.lon;
  const originalTime =
    q.time || new Date().toISOString();

  if (!lat || !lon) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        error: "lat/lon puuttuu"
      })
    };
  }

  try {
    const targetUtc =
      finlandTimeToUtcIso(originalTime);

    /*
     * Pidetään FMI-kysely yksinkertaisena.
     * Ei starttime-, endtime- eikä timestep-rajoja,
     * koska nykyinen 400-virhe tuli niiden lisäämisen jälkeen.
     */
    const params =
      "Temperature,WindSpeedMS,Precipitation1h";

    const url =
      "https://opendata.fmi.fi/wfs" +
      "?service=WFS" +
      "&version=2.0.0" +
      "&request=getFeature" +
      "&storedquery_id=" +
      "fmi::forecast::harmonie::surface::point::timevaluepair" +
      "&latlon=" +
      encodeURIComponent(lat + "," + lon) +
      "&parameters=" +
      encodeURIComponent(params);

    const response = await fetch(url);
    const xml = await response.text();

    if (!response.ok) {
      console.error("FMI HTTP error", {
        status: response.status,
        response: xml.slice(0, 1000),
        url
      });

      throw new Error(
        `FMI-haku epäonnistui: ${response.status} ${response.statusText}`
      );
    }

    if (
      /ExceptionReport/i.test(xml) ||
      /ExceptionText/i.test(xml)
    ) {
      console.error(
        "FMI XML error",
        xml.slice(0, 1500)
      );

      throw new Error(
        "FMI palautti XML-virheilmoituksen"
      );
    }

    const temperatureSeries =
      extract(xml, "Temperature");

    const windSpeedSeries =
      extract(xml, "WindSpeedMS");

    const precipitationSeries =
      extract(xml, "Precipitation1h");

    const result = {
      source: "FMI Open Data",
      originalTime,
      targetUtc,
      requestedTime: originalTime,

      temperature:
        pick(temperatureSeries, targetUtc),

      windSpeed:
        pick(windSpeedSeries, targetUtc),

      precipitation:
        pick(precipitationSeries, targetUtc),

      // Tuulensuuntaa ei vielä pyydetä, jotta FMI-kysely pysyy varmasti toimivana.
      windDirection: null
    };

    console.log("FMI weather result", {
      targetUtc,
      seriesLengths: {
        temperature: temperatureSeries.length,
        windSpeed: windSpeedSeries.length,
        precipitation: precipitationSeries.length
      },
      result
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error("Weather function error", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : String(error)
      })
    };
  }
};
