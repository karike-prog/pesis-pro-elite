/**
 * Netlify Function: weather.js
 *
 * Hakee FMI Open Datasta:
 * - lämpötilan
 * - tuulen nopeuden
 * - tuulen suunnan
 * - tunnin sademäärän
 *
 * Käyttö:
 * /.netlify/functions/weather?lat=62.5999&lon=29.7767&time=2026-07-20T18:00:00
 */

/**
 * Muuntaa Suomen paikallisajan UTC-aikaan.
 *
 * Pesäpallokaudella Suomessa on kesäaika UTC+3.
 * Jos aika sisältää jo Z-merkinnän tai aikavyöhykkeen,
 * sitä ei muuteta uudelleen.
 */
function finlandTimeToUtcIso(time) {
  if (!time) {
    return new Date().toISOString();
  }

  const value = String(time).trim();

  // Aika sisältää jo aikavyöhykkeen.
  if (
    value.endsWith("Z") ||
    /[+-]\d{2}:\d{2}$/.test(value)
  ) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Virheellinen aika: ${value}`);
    }

    return date.toISOString();
  }

  /*
   * Luetaan esimerkiksi:
   * 2026-07-20T18:00:00
   *
   * Älä käytä tässä suoraan new Date(value), koska Netlifyn
   * palvelin voi tulkita aikavyöhykkeettömän ajan UTC-ajaksi.
   */
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (!match) {
    throw new Error(`Virheellinen Suomen paikallisaika: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);

  // Suomen kesäaika UTC+3.
  const utcMilliseconds = Date.UTC(
    year,
    month,
    day,
    hour - 3,
    minute,
    second
  );

  return new Date(utcMilliseconds).toISOString();
}

/**
 * Poistaa XML-entiteettejä tarvittaessa.
 */
function decodeXml(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

/**
 * Etsii FMI:n XML-vastauksesta yhden sääparametrin aikasarjan.
 *
 * Toimii myös silloin, kun XML-elementeissä on attribuutteja
 * tai nimiavaruuden etuliite hieman muuttuu.
 */
function extractSeries(xml, parameterName) {
  const results = [];
  const wantedParameter = parameterName.toLowerCase();

  const memberRegex =
    /<(?:\w+:)?member\b[^>]*>([\s\S]*?)<\/(?:\w+:)?member>/gi;

  let memberMatch;

  while ((memberMatch = memberRegex.exec(xml)) !== null) {
    const member = memberMatch[1];
    const lowerMember = member.toLowerCase();

    if (!lowerMember.includes(wantedParameter)) {
      continue;
    }

    const tvpRegex =
      /<(?:\w+:)?MeasurementTVP\b[^>]*>[\s\S]*?<(?:\w+:)?time\b[^>]*>(.*?)<\/(?:\w+:)?time>[\s\S]*?<(?:\w+:)?value\b[^>]*>(.*?)<\/(?:\w+:)?value>[\s\S]*?<\/(?:\w+:)?MeasurementTVP>/gi;

    let tvpMatch;

    while ((tvpMatch = tvpRegex.exec(member)) !== null) {
      const time = decodeXml(tvpMatch[1]).trim();
      const rawValue = decodeXml(tvpMatch[2]).trim();

      const value = Number(rawValue);
      const timestamp = new Date(time).getTime();

      if (
        Number.isFinite(value) &&
        Number.isFinite(timestamp)
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

/**
 * Valitsee aikasarjasta pyydettyä aikaa lähimmän arvon.
 *
 * Arvo hyväksytään vain, jos se on enintään kolmen tunnin
 * päässä pyydetystä ajasta.
 */
function pickNearest(series, targetTime) {
  if (!Array.isArray(series) || series.length === 0) {
    return null;
  }

  const target = new Date(targetTime).getTime();

  if (!Number.isFinite(target)) {
    return null;
  }

  let best = null;
  let bestDifference = Infinity;

  for (const item of series) {
    const itemTime = new Date(item.time).getTime();

    if (!Number.isFinite(itemTime)) {
      continue;
    }

    const difference = Math.abs(itemTime - target);

    if (difference < bestDifference) {
      best = item;
      bestDifference = difference;
    }
  }

  // Älä palauta väärän vuorokauden sääarvoa.
  const maximumDifference = 3 * 60 * 60 * 1000;

  if (!best || bestDifference > maximumDifference) {
    return null;
  }

  return best.value;
}

/**
 * Muodostaa FMI-kyselyn.
 */
function buildFmiUrl(lat, lon, targetUtc) {
  const targetDate = new Date(targetUtc);

  // Haetaan muutama tunti tavoiteajan ympäriltä.
  const startDate = new Date(
    targetDate.getTime() - 3 * 60 * 60 * 1000
  );

  const endDate = new Date(
    targetDate.getTime() + 3 * 60 * 60 * 1000
  );

  const url = new URL("https://opendata.fmi.fi/wfs");

  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "getFeature");

  url.searchParams.set(
    "storedquery_id",
    "fmi::forecast::harmonie::surface::point::timevaluepair"
  );

  url.searchParams.set("latlon", `${lat},${lon}`);

  url.searchParams.set(
    "parameters",
    [
      "Temperature",
      "WindSpeedMS",
      "WindDirection",
      "Precipitation1h"
    ].join(",")
  );

  url.searchParams.set("starttime", startDate.toISOString());
  url.searchParams.set("endtime", endDate.toISOString());
  url.searchParams.set("timestep", "60");

  return url.toString();
}

exports.handler = async function handler(event) {
  const query = event.queryStringParameters || {};

  const lat = query.lat;
  const lon = query.lon;
  const originalTime =
    query.time || new Date().toISOString();

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

  const latitude = Number(lat);
  const longitude = Number(lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        error: "lat/lon ei ole kelvollinen numero"
      })
    };
  }

  try {
    const targetUtc = finlandTimeToUtcIso(originalTime);
    const url = buildFmiUrl(latitude, longitude, targetUtc);

    const response = await fetch(url, {
      headers: {
        Accept: "application/xml,text/xml"
      }
    });

    const xml = await response.text();

    if (!response.ok) {
      throw new Error(
        `FMI-haku epäonnistui: ${response.status} ${response.statusText}`
      );
    }

    // FMI voi palauttaa virheen XML-muodossa HTTP 200 -vastauksella.
    if (
      /ExceptionReport/i.test(xml) ||
      /ExceptionText/i.test(xml)
    ) {
      const exceptionMatch = xml.match(
        /<(?:\w+:)?ExceptionText\b[^>]*>([\s\S]*?)<\/(?:\w+:)?ExceptionText>/i
      );

      const message = exceptionMatch
        ? decodeXml(exceptionMatch[1]).trim()
        : "FMI palautti virheilmoituksen";

      throw new Error(message);
    }

    const temperatureSeries =
      extractSeries(xml, "Temperature");

    const windSpeedSeries =
      extractSeries(xml, "WindSpeedMS");

    const windDirectionSeries =
      extractSeries(xml, "WindDirection");

    const precipitationSeries =
      extractSeries(xml, "Precipitation1h");

    const result = {
      source: "FMI Open Data",
      originalTime,
      targetUtc,
      requestedTime: targetUtc,

      temperature: pickNearest(
        temperatureSeries,
        targetUtc
      ),

      windSpeed: pickNearest(
        windSpeedSeries,
        targetUtc
      ),

      precipitation: pickNearest(
        precipitationSeries,
        targetUtc
      ),

      windDirection: pickNearest(
        windDirectionSeries,
        targetUtc
      )
    };

    /*
     * Tämä näkyy Netlifyn Function-lokissa.
     * Ei tulosteta koko valtavaa XML-vastausta.
     */
    console.log("FMI weather result", {
      lat: latitude,
      lon: longitude,
      originalTime,
      targetUtc,
      seriesLengths: {
        temperature: temperatureSeries.length,
        windSpeed: windSpeedSeries.length,
        windDirection: windDirectionSeries.length,
        precipitation: precipitationSeries.length
      },
      result
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error("FMI weather error", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
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
