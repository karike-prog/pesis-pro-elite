/**
 * netlify/functions/save-snapshot.js
 *
 * Tallentaa tai päivittää yhden ottelun ennen ottelun alkua.
 * Käyttää Supabasen REST API:a service_role-avaimella.
 *
 * Netlify environment variables:
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
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

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function nullableNumber(value) {
  return isFiniteNumber(value) ? Number(value) : null;
}

function nullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
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
  const homeTeam = cleanText(input.home_team);
  const awayTeam = cleanText(input.away_team);
  const league = cleanText(input.league);
  const startTime = cleanText(input.start_time);

  if (
    !matchId ||
    !homeTeam ||
    !awayTeam ||
    !league ||
    !startTime
  ) {
    return jsonResponse(400, {
      error:
        "Pakolliset kentät: match_id, league, start_time, home_team, away_team"
    });
  }

  const startTimestamp = new Date(startTime).getTime();

  if (!Number.isFinite(startTimestamp)) {
    return jsonResponse(400, {
      error: "start_time ei ole kelvollinen aika"
    });
  }

  /*
   * Ennustetta ei enää muuteta ottelun alettua.
   * Viiden minuutin turvamarginaali estää myöhäisen ylikirjoituksen.
   */
  const lockTime = startTimestamp - 5 * 60 * 1000;

  if (Date.now() >= lockTime) {
    return jsonResponse(409, {
      error: "Ottelun ennuste on jo lukittu",
      match_id: matchId,
      start_time: startTime
    });
  }

  const row = {
    match_id: matchId,
    match_date:
      cleanText(input.match_date) ||
      new Date(startTime).toISOString().slice(0, 10),
    league,
    start_time: new Date(startTime).toISOString(),
    venue: cleanText(input.venue),
    home_team: homeTeam,
    away_team: awayTeam,

    elite_snapshot_at: new Date().toISOString(),
    elite_home_win: nullableNumber(input.elite_home_win),
    elite_away_win: nullableNumber(input.elite_away_win),
    elite_home_runs: nullableNumber(input.elite_home_runs),
    elite_away_runs: nullableNumber(input.elite_away_runs),
    elite_total: nullableNumber(input.elite_total),
    elite_run_difference:
      nullableNumber(input.elite_run_difference),
    elite_shootout: nullableNumber(input.elite_shootout),
    elite_classification:
      cleanText(input.elite_classification),
    elite_note: cleanText(input.elite_note),

    home_pressure: nullableNumber(input.home_pressure),
    away_pressure: nullableNumber(input.away_pressure),
    pressure_adjustment:
      nullableNumber(input.pressure_adjustment),

    weather_snapshot_at:
      input.weather_snapshot_at
        ? new Date(input.weather_snapshot_at).toISOString()
        : new Date().toISOString(),
    weather_temp: nullableNumber(input.weather_temp),
    weather_wind: nullableNumber(input.weather_wind),
    weather_rain: nullableNumber(input.weather_rain),
    weather_adjustment:
      nullableNumber(input.weather_adjustment),

    lineup_snapshot_at:
      input.lineup_snapshot_at
        ? new Date(input.lineup_snapshot_at).toISOString()
        : new Date().toISOString(),
    lineups_available:
      Boolean(input.lineups_available),
    lineup_home_missing:
      isFiniteNumber(input.lineup_home_missing)
        ? Number(input.lineup_home_missing)
        : null,
    lineup_away_missing:
      isFiniteNumber(input.lineup_away_missing)
        ? Number(input.lineup_away_missing)
        : null,
    home_lineup_adjustment:
      nullableNumber(input.home_lineup_adjustment),
    away_lineup_adjustment:
      nullableNumber(input.away_lineup_adjustment),
    home_pitcher_missing:
      Boolean(input.home_pitcher_missing),
    away_pitcher_missing:
      Boolean(input.away_pitcher_missing),
    lineup_notes: cleanText(input.lineup_notes),
    lineup_data:
      input.lineup_data &&
      typeof input.lineup_data === "object"
        ? input.lineup_data
        : null,

    veikkaus_event_id:
      cleanText(input.veikkaus_event_id),
    veikkaus_snapshot_at:
      input.veikkaus_event_id
        ? new Date().toISOString()
        : null,
    veikkaus_home_odds:
      nullableNumber(input.veikkaus_home_odds),
    veikkaus_draw_odds:
      nullableNumber(input.veikkaus_draw_odds),
    veikkaus_away_odds:
      nullableNumber(input.veikkaus_away_odds),
    veikkaus_final_home:
      nullableNumber(input.veikkaus_final_home),
    veikkaus_final_away:
      nullableNumber(input.veikkaus_final_away),
    veikkaus_total_line:
      nullableNumber(input.veikkaus_total_line),
    veikkaus_over_odds:
      nullableNumber(input.veikkaus_over_odds),
    veikkaus_under_odds:
      nullableNumber(input.veikkaus_under_odds),
    veikkaus_home_handicap:
      nullableNumber(input.veikkaus_home_handicap),
    veikkaus_handicap_home_odds:
      nullableNumber(input.veikkaus_handicap_home_odds),
    veikkaus_handicap_away_odds:
      nullableNumber(input.veikkaus_handicap_away_odds)
  };

  /*
   * Poistetaan undefined-kentät.
   * null-arvot saavat jäädä, koska ne ovat tietokannassa sallittuja.
   */
  const cleanRow = Object.fromEntries(
    Object.entries(row).filter(
      ([, value]) => value !== undefined
    )
  );

  const endpoint =
    `${supabaseUrl}/rest/v1/match_history` +
    `?on_conflict=match_id`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer:
          "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(cleanRow)
    });

    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      console.error("Supabase upsert failed", {
        status: response.status,
        data
      });

      return jsonResponse(502, {
        error: "Tallennus Supabaseen epäonnistui",
        status: response.status,
        details: data
      });
    }

    return jsonResponse(200, {
      ok: true,
      action: "upsert",
      match_id: matchId,
      saved: Array.isArray(data) ? data[0] : data
    });
  } catch (error) {
    console.error("save-snapshot error", error);

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
};
