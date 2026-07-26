/**
 * Palauttaa otteluiden markkinatiedot Eliten
 * taustalla tehtävää arvokohdelaskentaa varten.
 *
 * Kertoimia ei näytetä käyttäjälle.
 */

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type":
        "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

exports.handler =
  async function handler(event) {
    if (event.httpMethod !== "GET") {
      return jsonResponse(405, {
        error: "Vain GET on sallittu"
      });
    }

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, {
        error: "Supabase-asetukset puuttuvat"
      });
    }

    const date =
      event.queryStringParameters?.date;

    if (!date) {
      return jsonResponse(400, {
        error: "Päivämäärä puuttuu"
      });
    }

    const fields = [
      "match_id",
      "home_team",
      "away_team",
      "veikkaus_final_home",
      "veikkaus_final_away",
      "veikkaus_total_line",
      "veikkaus_over_odds",
      "veikkaus_under_odds"
    ].join(",");

    const endpoint =
      `${supabaseUrl}/rest/v1/match_history` +
      `?match_date=eq.${encodeURIComponent(date)}` +
      `&select=${encodeURIComponent(fields)}`;

    try {
      const response = await fetch(endpoint, {
        headers: {
          apikey: serviceRoleKey,
          Authorization:
            `Bearer ${serviceRoleKey}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        return jsonResponse(502, {
          error:
            "Markkinatietojen haku epäonnistui",
          details: data
        });
      }

      return jsonResponse(200, {
        ok: true,
        data
      });
    } catch (error) {
      return jsonResponse(500, {
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  };