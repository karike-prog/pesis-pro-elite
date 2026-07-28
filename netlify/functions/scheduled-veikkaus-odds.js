/**
 * netlify/functions/scheduled-veikkaus-odds.js
 *
 * Ajastettu markkinakertoimien päivitys.
 */

exports.handler = async function handler() {
  const siteUrl =
    process.env.URL ||
    "https://pesisproelite.netlify.app";

  const endpoint =
    `${siteUrl}/.netlify/functions/update-veikkaus-odds`;

  try {
    console.log(
      "Käynnistetään automaattinen markkinadatan päivitys:",
      endpoint
    );

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Pesis-Pro-Elite-Scheduler/1.0"
      }
    });

    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      console.error(
        "Automaattinen päivitys epäonnistui:",
        response.status,
        data
      );

      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          status: response.status,
          details: data
        })
      };
    }

    const updatedCount =
      Array.isArray(data?.results)
        ? data.results.filter(
            item => item.updated === true
          ).length
        : 0;

    console.log(
      "Automaattinen markkinadatan päivitys onnistui:",
      {
        eventCount: data?.eventCount ?? 0,
        updatedCount
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        eventCount: data?.eventCount ?? 0,
        updatedCount
      })
    };
  } catch (error) {
    console.error(
      "Ajastettu markkinadatan päivitys kaatui:",
      error
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      })
    };
  }
};