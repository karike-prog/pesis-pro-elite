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

/* -------------------------------------------------------
   Ajan käsittely
------------------------------------------------------- */

function finlandTimeToUtcIso(time) {
  if (!time) {
    return new Date().toISOString();
  }

  const value = String(time).trim();

  // Jos aika sisältää jo Z:n tai aikavyöhykkeen, käytä sellaisenaan.
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
   * Esimerkiksi:
   * 2026-07-20T18:00:00
   *
   * Pesäpallokausi on Suomen kesäaikaa UTC+3.
   */
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

/* -------------------------------------------------------
   XML-apufunktiot
------------------------------------------------------- */

function decodeXml(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

/**
 * Pilkkoo FMI:n vastauksen wfs:member-osioihin.
 */
function splitMembers(xml) {
  const members = [];

  const regex =
    /<wfs:member\b[^>]*>([\s\S]*?)<\/wfs:member>/gi;

  let match;

  while ((match = regex.exec(xml)) !== null) {
    members.push(match[1]);
  }

  /*
   * Varavaihtoehto, jos FMI joskus vaihtaa nimiavaruuden
   * etuliitettä mutta säilyttää member-elementin.
   */
  if (members.length === 0) {
    const fallbackRegex =
      /<(?:[a-zA-Z0-9_-]+:)?member\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?member>/gi;

    while ((match = fallbackRegex.exec(xml)) !== null) {
      members.push(match[1]);
    }
  }

  return members;
}

/**
 * Tarkistaa, kuuluuko jäsen pyydetylle parametrille.
 */
function memberContainsParameter(member, parameterName) {
  const lower = member.toLowerCase();
  const wanted = String(parameterName).toLowerCase();

  if (lower.includes(wanted)) {
    return true;
  }

  /*
   * Mahdollisia FMI:n tapoja esittää parametrinimi:
   * Temperature
   * temperature
   * .../Temperature
   * ...#Temperature
   */
  const normalizedMember = lower.replace(
    /[^a-z0-9]/g,
    ""
  );

  const normalizedWanted = wanted.replace(
    /[^a-z0-9]/g,
    ""
  );

  return normalizedMember.includes(
    normalizedWanted
  );
}

/**
 * Poimii yhden jäsenen MeasurementTVP-aika-arvoparit.
 */
function extractTimeValuePairs(member) {
  const results = [];

  /*
   * Tavallinen FMI-rakenne:
   *
   * <wml2:MeasurementTVP>
   *   <wml2:time>...</wml2:time>
   *   <wml2:value>...</wml2:value>
   * </wml2:MeasurementTVP>
   */
  const tvpRegex =
    /<(?:[a-zA-Z0-9_-]+:)?MeasurementTVP\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?MeasurementTVP>/gi;

  let tvpMatch;

  while ((tvpMatch = tvpRegex.exec(member)) !== null) {
    const block = tvpMatch[1];

    const timeMatch = block.match(
      /<(?:[a-zA-Z0-9_-]+:)?time\b[^>]*>\s*([^<]+?)\s*<\/(?:[a-zA-Z0-9_-]+:)?time>/i
    );

    const valueMatch = block.match(
      /<(?:[a-zA-Z0-9_-]+:)?value\b[^>]*>\s*([^<]*?)\s*<\/(?:[a-zA-Z0-9_-]+:)?value>/i
    );

    if (!timeMatch || !valueMatch) {
      continue;
    }

    const time = decodeXml(
      timeMatch[1]
    ).trim();

    const rawValue = decodeXml(
      valueMatch[1]
    ).trim();

    /*
     * Tyhjä arvo tai NaN jätetään pois.
     */
    if (
      rawValue === "" ||
      rawValue.toLowerCase() === "nan"
    ) {
      continue;
    }

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

  return results;
}

/**
 * Etsii FMI:n XML-vastauksesta parametrin koko aikasarjan.
 */
function extractSeries(xml, parameterName) {
  const members = splitMembers(xml);

  for (const member of members) {
    if (
      !memberContainsParameter(
        member,
        parameterName
      )
    ) {
      continue;
    }

    const series =
      extractTimeValuePairs(member);

    if (series.length > 0) {
      return series;
    }
  }

  /*
   * Varahaku:
   * etsitään parametrin sijainti koko XML:stä ja poimitaan
   * sitä ympäröivä member-osio.
   */
  const lowerXml = xml.toLowerCase();
  const wanted =
    String(parameterName).toLowerCase();

  const parameterIndex =
    lowerXml.indexOf(wanted);

  if (parameterIndex !== -1) {
    const memberStart =
      lowerXml.lastIndexOf(
        "<wfs:member",
        parameterIndex
      );

    const memberEnd =
      lowerXml.indexOf(
        "</wfs:member>",
        parameterIndex
      );

    if (
      memberStart !== -1 &&
      memberEnd !== -1
    ) {
      const member = xml.slice(
        memberStart,
        memberEnd + "</wfs:member>".length
      );

      const series =
        extractTimeValuePairs(member);

      if (series.length > 0) {
        return series;
      }
    }
  }

  return [];
}

/* -------------------------------------------------------
   Lähimmän ennusteen valinta
------------------------------------------------------- */

function pickNearestItem(
  series,
  targetTime
) {
  if (
    !Array.isArray(series) ||
    series.length === 0
  ) {
    return null;
  }

  const target =
    new Date(targetTime).getTime();

  if (!Number.isFinite(target)) {
    return null;
  }

  let best = null;
  let bestDifference = Infinity;

  for (const item of series) {
    const itemTime =
      new Date(item.time).getTime();

    if (!Number.isFinite(itemTime)) {
      continue;
    }

    const difference =
      Math.abs(itemTime - target);

    if (difference < bestDifference) {
      best = item;
      bestDifference = difference;
    }
  }

  /*
   * ECMWF:n ennuste voi olla esimerkiksi kolmen tunnin välein.
   * Hyväksytään enintään neljän tunnin ero.
   */
  const maximumDifference =
    4 * 60 * 60 * 1000;

  if (
    !best ||
    bestDifference > maximumDifference
  ) {
    return null;
  }

  return best;
}

function pickNearest(
  series,
  targetTime
) {
  const item = pickNearestItem(
    series,
    targetTime
  );

  return item ? item.value : null;
}

/* -------------------------------------------------------
   Tuulen laskenta
------------------------------------------------------- */

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

  return Math.sqrt(
    u * u + v * v
  );
}

/* -------------------------------------------------------
   FMI-kysely
------------------------------------------------------- */

function buildFmiUrl(lat, lon) {
  const parameters = [
    "Temperature",
    "WindUMS",
    "WindVMS",
    "Precipitation1h"
  ].join(",");

  return (
    "https://opendata.fmi.fi/wfs" +
    "?service=WFS" +
    "&version=2.0.0" +
    "&request=getFeature" +
    "&storedquery_id=ecmwf::forecast::surface::point::timevaluepair" +
    "&latlon=" + lat + "," + lon +
    "&parameters=" + parameters
  );
}

function jsonResponse(
  statusCode,
  body
) {
  return {
    statusCode,
    headers: {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store",

      "Access-Control-Allow-Origin":
        "*"
    },

    body: JSON.stringify(body)
  };
}

/* -------------------------------------------------------
   Netlify Function
------------------------------------------------------- */

exports.handler =
  async function handler(event) {
    const query =
      event.queryStringParameters || {};

    const lat = query.lat;
    const lon = query.lon;

    const originalTime =
      query.time ||
      new Date().toISOString();

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
        finlandTimeToUtcIso(
          originalTime
        );

      const url = buildFmiUrl(
        latitude,
        longitude
      );

      const response =
        await fetch(url, {
          headers: {
            Accept:
              "application/xml,text/xml;q=0.9,*/*;q=0.8"
          }
        });

      const xml =
        await response.text();

      if (!response.ok) {
        console.error(
          "FMI HTTP error",
          {
            status: response.status,
            statusText:
              response.statusText,
            url,
            response:
              xml.slice(0, 3000)
          }
        );

        return jsonResponse(502, {
          error:
            `FMI-haku epäonnistui: ` +
            `${response.status} ` +
            `${response.statusText}`
        });
      }

      if (
        /ExceptionReport/i.test(xml) ||
        /ExceptionText/i.test(xml)
      ) {
        const exceptionMatch =
          xml.match(
            /<(?:\w+:)?ExceptionText\b[^>]*>([\s\S]*?)<\/(?:\w+:)?ExceptionText>/i
          );

        const message =
          exceptionMatch
            ? decodeXml(
                exceptionMatch[1]
              ).trim()
            : "FMI palautti XML-virheen";

        console.error(
          "FMI XML error",
          {
            message,
            url
          }
        );

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

      const windSpeed =
        Number.isFinite(windSpeedRaw)
          ? Math.round(
              windSpeedRaw * 10
            ) / 10
          : null;

      const result = {
        source: "FMI Open Data",
        originalTime,
        targetUtc,
        requestedTime:
          originalTime,

        temperature:
          Number.isFinite(temperature)
            ? temperature
            : null,

        windSpeed,

        precipitation:
          Number.isFinite(precipitation)
            ? precipitation
            : null
      };

      /*
       * Netlifyn lokiin jää vain tiivis tarkistus.
       * Debug-tietoja ei lähetetä käyttäjälle.
       */
      console.log(
        "FMI weather result",
        {
          latitude,
          longitude,
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
        }
      );

      return jsonResponse(
        200,
        result
      );
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
