/**
 * netlify/functions/weather.js
 *
 * Hakee FMI Open Datasta ottelupaikan ennusteen:
 * - lämpötila
 * - tuulen nopeus
 * - tunnin sademäärä
 *
 * Tuulen nopeus lasketaan WindUMS- ja WindVMS-komponenteista.
 */

/**
 * Muuntaa Suomen paikallisajan UTC-ajaksi.
 *
 * Aikavyöhykkeettömän pesäpallokauden ajan oletetaan olevan
 * Suomen kesäaikaa eli UTC+3.
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

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (!match) {
    throw new Error(
      `Virheellinen Suomen paikallisaika: ${value}`
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);

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
 * Purkaa tavallisimmat XML-entiteetit.
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
 * Etsii FMI:n XML-vastauksesta parametrin aikasarjan.
 */
function extractSeries(xml, parameterName) {
  const result = [];
  const wanted = String(parameterName).toLowerCase();

  const memberRegex =
    /<(?:\w+:)?member\b[^>]*>([\s\S]*?)<\/(?:\w+:)?member>/gi;

  let memberMatch;

  while ((memberMatch = memberRegex.exec(xml)) !== null) {
    const member = memberMatch[1];
    const memberLower = member.toLowerCase();

    /*
     * observedProperty-linkissä tai jäsenen muussa metadatassa
     * pitää esiintyä haettu parametrinimi.
     */
    if (!memberLower.includes(wanted)) {
      continue;
    }

    const tvpRegex =
      /<(?:\w+:)?MeasurementTVP\b[^>]*>[\s\S]*?<(?:\w+:)?time\b[^>]*>(.*?)<\/(?:\w+:)?time>[\s\S]*?<(?:\w+:)?value\b[^>]*>(.*?)<\/(?:\w+:)?value>[\s\S]*?<\/(?:\w+:)?MeasurementTVP>/gi;

    let tvpMatch;

    while ((tvpMatch = tvpRegex.exec(member)) !== null) {
      const time = decodeXml(tvpMatch[1]).trim();
      const rawValue = decodeXml(tvpMatch[2]).trim();
      const value = Number(rawValue);

      if (
        Number.isFinite(value) &&
        Number.isFinite(new Date(time).getTime())
      ) {
        result.push({
          time,
          value
        });
      }
    }

    /*
     * Yksi wfs:member vastaa yhtä parametria.
     * Kun oikea jäsen löytyi, muiden jäsenten läpikäyntiä
     * ei tarvitse jatkaa.
     */
    if (result.length > 0) {
      break;
    }
  }

  return result;
}

/**
 * Valitsee pyydettyä ajankohtaa lähimmän arvon.
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

  /*
   * Ei hyväksytä arvoa, joka on liian kaukana
   * pyydetystä otteluajasta.
   */
  const maximumDifference =
    3 * 60 * 60 * 1000;

  if (
    !best ||
    bestDifference > maximumDifference
  ) {
    return null;
  }

  return best.value;
}

/**
 * Hakee tietyn ajan arvon aikasarjasta.
 * Käytetään U- ja V-tuulikomponenttien yhdistämiseen.
 */
function pickNearestItem(series, targetTime) {
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

  const maximumDifference =
    3 * 60 * 60 * 1000;

  if (
    !best ||
    bestDifference > maximumDifference
  ) {
    return null;
  }

  return best;
}

/**
 * Laskee tuulen nopeuden U- ja V-komponenteista.
 */
function calculateWindSpeed(
  windUSeries,
  windVSeries,
  targetTime
) {
  const uItem = pickNearestItem(
    windUSeries,
    targetTime
  );

  const vItem = pickNearestItem(
    windVSeries,
    targetTime
  );

  if (!uItem || !vItem) {
    return null;
  }

  const u = Number(uItem.value);
  const v = Number(vItem.value);

  if (
    !Number.isFinite(u) ||
    !Number.isFinite(v)
  ) {
    return null;
  }

  return Math.sqrt(u * u + v * v);
}

/**
 * Rakentaa FMI-kyselyn ilman aikarajoja.
 *
 * Koko ennustesarjasta valitaan myöhemmin otteluaikaa
 * lähinnä oleva arvo.
 */
function buildFmiUrl(lat, lon) {
  const url = new URL(
    "https://opendata.fmi.fi/wfs"
  );

  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "getFeature");

  url.searchParams.set(
    "storedquery_id",
    "fmi::forecast::harmonie::surface::point::timevaluepair"
  );

  url.searchParams.set(
    "latlon",
    `${lat},${lon}`
  );

  /*
   * WindSpeedMS jätetään pois.
   * Harmonie-aineistosta haetaan U- ja V-komponentit.
   */
  url.searchParams.set(
    "parameters",
    [
      "Temperature",
      "WindUMS",
      "WindVMS",
      "Precipitation1h"
    ].join(",")
  );

  return url.toString();
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type":
        "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async function handler(event) {
  const query =
    event.queryStringParameters || {};

  const lat = query.lat;
  const lon = query.lon;

  const originalTime =
    query.time || new Date().toISOString();

  if (!lat || !lon) {
    return jsonResponse(400, {
      error: "lat/lon puuttuu"
    });
  }

  const latitude = Number(lat);
  const longitude = Number(lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return jsonResponse(400, {
      error:
        "lat/lon ei ole kelvollinen numero"
    });
  }

  try {
    const targetUtc =
      finlandTimeToUtcIso(originalTime);

    const url = buildFmiUrl(
      latitude,
      longitude
    );

    const response = await fetch(url, {
      headers: {
        Accept:
          "application/xml,text/xml;q=0.9,*/*;q=0.8"
      }
    });

    const xml = await response.text();

if (!response.ok) {
  console.error("FMI HTTP error", {
    status: response.status,
    statusText: response.statusText,
    url,
    response: xml.slice(0, 4000)
  });

  return jsonResponse(502, {
    error:
      `FMI-haku epäonnistui: ` +
      `${response.status} ${response.statusText}`,

    fmiResponse: xml.slice(0, 4000),
    requestedUrl: url
  });
}

    if (
      /ExceptionReport/i.test(xml) ||
      /ExceptionText/i.test(xml)
    ) {
      const exceptionMatch = xml.match(
        /<(?:\w+:)?ExceptionText\b[^>]*>([\s\S]*?)<\/(?:\w+:)?ExceptionText>/i
      );

      const message = exceptionMatch
        ? decodeXml(exceptionMatch[1]).trim()
        : "FMI palautti XML-virheen";

      console.error("FMI XML error", {
        message,
        url,
        response:
          xml.slice(0, 2000)
      });

      return jsonResponse(502, {
        error: message
      });
    }

    const temperatureSeries =
      extractSeries(
        xml,
        "Temperature"
      );

    const windUSeries =
      extractSeries(
        xml,
        "WindUMS"
      );

    const windVSeries =
      extractSeries(
        xml,
        "WindVMS"
      );

    const precipitationSeries =
      extractSeries(
        xml,
        "Precipitation1h"
      );

    const temperature =
      pickNearest(
        temperatureSeries,
        targetUtc
      );

    const windSpeedRaw =
      calculateWindSpeed(
        windUSeries,
        windVSeries,
        targetUtc
      );

    const precipitation =
      pickNearest(
        precipitationSeries,
        targetUtc
      );

    /*
     * Pyöristetään tuuli yhteen desimaaliin.
     * Muut arvot jätetään FMI:n antamaan tarkkuuteen.
     */
    const windSpeed =
      Number.isFinite(windSpeedRaw)
        ? Math.round(windSpeedRaw * 10) / 10
        : null;

    const result = {
      source: "FMI Open Data",
      originalTime,
      targetUtc,
      requestedTime: originalTime,
      temperature,
      windSpeed,
      precipitation
    };

    console.log("FMI weather result", {
      latitude,
      longitude,
      originalTime,
      targetUtc,

      seriesLengths: {
        temperature:
          temperatureSeries.length,
        windU:
          windUSeries.length,
        windV:
          windVSeries.length,
        precipitation:
          precipitationSeries.length
      },

      result
    });

    return jsonResponse(200, result);
  } catch (error) {
    console.error(
      "Weather function error",
      error
    );

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
};
