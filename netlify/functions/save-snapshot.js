/**
 * netlify/functions/save-snapshot.js
 *
 * Tallentaa tai päivittää Eliten otteluennusteen ennen ottelun alkua.
 *
 * Tämä funktio käsittelee vain:
 * - ottelun perustiedot
 * - Elite-ennusteen
 * - painekorjauksen
 * - säätiedot
 * - kokoonpanotiedot
 *
 * Veikkauksen kertoimia käsittelee:
 * update-veikkaus-odds.js
 *
 * Lopputuloksia käsittelee:
 * update-result.js
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
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  return Number.isFinite(Number(value));
}

function nullableNumber(value) {
  return isFiniteNumber(value)
    ? Number(value)
    : null;
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  return text === ""
    ? null
    : text;
}

function nullableDate(value, fallbackToNow = false) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallbackToNow
      ? new Date().toISOString()
      : null;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return fallbackToNow
      ? new Date().toISOString()
      : null;
  }

  return new Date(timestamp).toISOString();
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {
      ok: true
    });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Vain POST on sallittu"
    });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL;

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

  const matchId =
    cleanText(input.match_id);

  const homeTeam =
    cleanText(input.home_team);

  const awayTeam =
    cleanText(input.away_team);

  const league =
    cleanText(input.league);

  const startTime =
    cleanText(input.start_time);

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

  const startTimestamp =
    new Date(startTime).getTime();

  if (!Number.isFinite(startTimestamp)) {
    return jsonResponse(400, {
      error:
        "start_time ei ole kelvollinen aika"
    });
  }

  /*
   * Ennuste lukitaan viisi minuuttia ennen ottelun alkua.
   *
   * Näin ottelun alettua tai juuri ennen alkua saatu data
   * ei enää muuta alkuperäistä ennustetta.
   */
  const lockTime =
    startTimestamp - 5 * 60 * 1000;

  if (Date.now() >= lockTime) {
    return jsonResponse(409, {
      error:
        "Ottelun ennuste on jo lukittu",
      match_id: matchId,
      start_time: startTime
    });
  }

  const normalizedStartTime =
    new Date(startTimestamp).toISOString();

  const matchDate =
    cleanText(input.match_date) ||
    normalizedStartTime.slice(0, 10);

  /*
   * Tämä objekti ei sisällä:
   *
   * - yhtään veikkaus_* -kenttää
   * - yhtään lopputuloskenttää
   *
   * Siksi tämä funktio ei voi enää pyyhkiä
   * kertoimia tai lopputuloksia tietokannasta.
   */
  const row = {
    match_id: matchId,
    match_date: matchDate,
    league,
    start_time: normalizedStartTime,
    venue: cleanText(input.venue),
    home_team: homeTeam,
    away_team: awayTeam,

    elite_snapshot_at:
      new Date().toISOString(),

    elite_home_win:
      nullableNumber(input.elite_home_win),

    elite_away_win:
      nullableNumber(input.elite_away_win),

    elite_home_runs:
      nullableNumber(input.elite_home_runs),

    elite_away_runs:
      nullableNumber(input.elite_away_runs),

    elite_total:
      nullableNumber(input.elite_total),

    elite_run_difference:
      nullableNumber(
        input.elite_run_difference
      ),

    elite_shootout:
      nullableNumber(input.elite_shootout),

    elite_classification:
      cleanText(
        input.elite_classification
      ),

    elite_note:
      cleanText(input.elite_note),

    home_pressure:
      nullableNumber(input.home_pressure),

    away_pressure:
      nullableNumber(input.away_pressure),

    pressure_adjustment:
      nullableNumber(
        input.pressure_adjustment
      ),

    weather_snapshot_at:
      nullableDate(
        input.weather_snapshot_at,
        true
      ),

    weather_temp:
      nullableNumber(input.weather_temp),

    weather_wind:
      nullableNumber(input.weather_wind),

    weather_rain:
      nullableNumber(input.weather_rain),

    weather_adjustment:
      nullableNumber(
        input.weather_adjustment
      ),

    lineup_snapshot_at:
      nullableDate(
        input.lineup_snapshot_at,
        true
      ),

    lineups_available:
      typeof input.lineups_available ===
      "boolean"
        ? input.lineups_available
        : false,

    lineup_home_missing:
      nullableNumber(
        input.lineup_home_missing
      ),

    lineup_away_missing:
      nullableNumber(
        input.lineup_away_missing
      ),

    home_lineup_adjustment:
      nullableNumber(
        input.home_lineup_adjustment
      ),

    away_lineup_adjustment:
      nullableNumber(
        input.away_lineup_adjustment
      ),

    home_pitcher_missing:
      typeof input.home_pitcher_missing ===
      "boolean"
        ? input.home_pitcher_missing
        : false,

    away_pitcher_missing:
      typeof input.away_pitcher_missing ===
      "boolean"
        ? input.away_pitcher_missing
        : false,

    lineup_notes:
      cleanText(input.lineup_notes),

    lineup_data:
      input.lineup_data &&
      typeof input.lineup_data === "object"
        ? input.lineup_data
        : null
  };

  /*
   * Upsert etsii ottelun match_id:n perusteella.
   *
   * Koska Veikkaus- ja lopputuloskenttiä ei ole row-objektissa,
   * Supabase jättää niiden nykyiset arvot koskemattomiksi.
   */
  const endpoint =
    `${supabaseUrl}/rest/v1/match_history` +
    `?on_conflict=match_id`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization:
          `Bearer ${serviceRoleKey}`,
        "Content-Type":
          "application/json",
        Prefer:
          "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(row)
    });

    const text =
      await response.text();

    let data;

    try {
      data = text
        ? JSON.parse(text)
        : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      console.error(
        "Supabase snapshot upsert failed",
        {
          status: response.status,
          data
        }
      );

      return jsonResponse(502, {
        error:
          "Ennusteen tallennus Supabaseen epäonnistui",
        status: response.status,
        details: data
      });
    }

    return jsonResponse(200, {
      ok: true,
      action: "upsert",
      match_id: matchId,
      saved:
        Array.isArray(data)
          ? data[0] || null
          : data
    });
  } catch (error) {
    console.error(
      "save-snapshot error",
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