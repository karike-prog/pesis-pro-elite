/**
 * netlify/functions/update-result.js
 *
 * Päivittää päättyneen ottelun lopputuloksen
 * match_history-tauluun match_id:n perusteella.
 */

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function cleanText(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  return text === "" ? null : text;
}

function nullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Vain POST on sallittu"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error:
        "SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu Netlifystä"
    });
  }

  let input;

  try {
    input = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, {
      error: "Virheellinen JSON"
    });
  }

  const matchId = cleanText(input.match_id);

  if (!matchId) {
    return jsonResponse(400, {
      error: "match_id puuttuu"
    });
  }

  const updateRow = {
    result_updated_at: new Date().toISOString(),

    result_string: cleanText(input.result_string),

    periods_home: nullableNumber(input.periods_home),
    periods_away: nullableNumber(input.periods_away),

    final_home_runs:
      nullableNumber(input.final_home_runs),
    final_away_runs:
      nullableNumber(input.final_away_runs),

    actual_total:
      nullableNumber(input.actual_total),

    actual_winner:
      cleanText(input.actual_winner),

    actual_shootout_home:
      nullableNumber(input.actual_shootout_home),

    actual_shootout_away:
      nullableNumber(input.actual_shootout_away)
  };

  const endpoint =
    `${supabaseUrl}/rest/v1/match_history` +
    `?match_id=eq.${encodeURIComponent(matchId)}`;

  try {
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(updateRow)
    });

    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      return jsonResponse(502, {
        error: "Tuloksen päivitys Supabaseen epäonnistui",
        status: response.status,
        details: data
      });
    }

    if (!Array.isArray(data) || data.length === 0) {
      return jsonResponse(404, {
        error: "Ottelua ei löytynyt tietokannasta",
        match_id: matchId
      });
    }

    return jsonResponse(200, {
      ok: true,
      action: "update-result",
      match_id: matchId,
      saved: data[0]
    });
  } catch (error) {
    console.error("update-result error", error);

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
};
