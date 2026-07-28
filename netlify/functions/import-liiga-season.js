const SPORTDB_BASE_URL = "https://api.sportdb.dev";

const LIIGA_RESULTS_PATH =
  "/api/flashscore/hockey/finland:76/" +
  "liiga:CnmCUGyG/2025-2026/results";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body, null, 2)
  };
}

function firstDefined(...values) {
  return values.find(
    value =>
      value !== undefined &&
      value !== null &&
      value !== ""
  );
}

function toInteger(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(
    String(value).replace(",", ".")
  );

  return Number.isFinite(number)
    ? Math.trunc(number)
    : null;
}

function normalizeTimestamp(value) {
  if (!value) return null;

  const text = String(value);

  if (/^\d{10,13}$/.test(text)) {
    let timestamp = Number(text);

    if (text.length === 10) {
      timestamp *= 1000;
    }

    const date = new Date(timestamp);

    return Number.isNaN(date.getTime())
      ? null
      : date.toISOString();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

async function sportDbFetch(path, apiKey) {
  const response = await fetch(
    `${SPORTDB_BASE_URL}${path}`,
    {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
        "User-Agent": "Liiga-Elite/1.0"
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `SportDB-haku epäonnistui: ` +
      `${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

function unwrapMatches(data) {
  if (Array.isArray(data)) {
    return data;
  }

  const candidates = [
    data?.results,
    data?.events,
    data?.matches,
    data?.data,
    data?.items
  ];

  return (
    candidates.find(Array.isArray) || []
  );
}

async function supabaseUpsertMatches({
  supabaseUrl,
  serviceRoleKey,
  rows
}) {
  if (rows.length === 0) return [];

  const response = await fetch(
    `${supabaseUrl}/rest/v1/liiga_matches` +
    "?on_conflict=event_id",
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization:
          `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer:
          "resolution=merge-duplicates," +
          "return=representation"
      },
      body: JSON.stringify(rows)
    }
  );

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `Supabase-tallennus epäonnistui: ` +
      `${response.status} ${JSON.stringify(data)}`
    );
  }

  return Array.isArray(data) ? data : [];
}

function mapMatch(item, season) {
  const eventId = String(
    firstDefined(
      item?.eventId,
      item?.id,
      item?.matchId,
      ""
    )
  );

  const homeTeamId = String(
    firstDefined(
      item?.homeEventParticipantId,
      item?.eventHomeParticipantId,
      item?.homeParticipantId,
      item?.homeId,
      item?.homeTeamId,
      ""
    )
  );

  const awayTeamId = String(
    firstDefined(
      item?.awayEventParticipantId,
      item?.eventAwayParticipantId,
      item?.awayParticipantId,
      item?.awayId,
      item?.awayTeamId,
      ""
    )
  );

  const homeTeamName = String(
    firstDefined(
      item?.homeName,
      item?.eventHomeParticipantName,
      item?.homeParticipantName,
      item?.homeTeamName,
      ""
    )
  );

  const awayTeamName = String(
    firstDefined(
      item?.awayName,
      item?.eventAwayParticipantName,
      item?.awayParticipantName,
      item?.awayTeamName,
      ""
    )
  );

  const startTime = normalizeTimestamp(
    firstDefined(
      item?.startDateTimeUtc,
      item?.startTime,
      item?.startUTCTime,
      item?.eventStartTime
    )
  );

  const homeScore = toInteger(
    firstDefined(
      item?.homeScore,
      item?.eventHomeScore,
      item?.homeFullTimeResult
    )
  );

  const awayScore = toInteger(
    firstDefined(
      item?.awayScore,
      item?.eventAwayScore,
      item?.awayFullTimeResult
    )
  );

  let winnerTeamId = null;

  if (
    homeScore !== null &&
    awayScore !== null
  ) {
    if (homeScore > awayScore) {
      winnerTeamId = homeTeamId;
    } else if (awayScore > homeScore) {
      winnerTeamId = awayTeamId;
    }
  }

  if (
    !eventId ||
    !homeTeamId ||
    !awayTeamId ||
    !homeTeamName ||
    !awayTeamName
  ) {
    return null;
  }

  return {
    event_id: eventId,
    season,

    match_date:
      startTime
        ? startTime.slice(0, 10)
        : null,

    start_time: startTime,

    status:
      firstDefined(
        item?.eventStage,
        item?.status,
        item?.eventType,
        "FINISHED"
      ),

    stage:
      firstDefined(
        item?.tournamentStage?.name,
        item?.stageName,
        item?.stage,
        null
      ),

    home_team_id: homeTeamId,
    home_team_name: homeTeamName,

    away_team_id: awayTeamId,
    away_team_name: awayTeamName,

    home_score: homeScore,
    away_score: awayScore,

    winner_team_id: winnerTeamId,

    details_json: {
      source: "sportdb-results",
      match: item
    },

    updated_at:
      new Date().toISOString()
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, {
      error: "Vain GET on sallittu"
    });
  }

  const sportDbApiKey =
    process.env.SPORTDB_API_KEY;

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !sportDbApiKey ||
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return jsonResponse(500, {
      error:
        "Tarvittava ympäristömuuttuja puuttuu"
    });
  }

  const season =
    event.queryStringParameters?.season ||
    "2025-2026";

  try {
    const allMatches = [];

    /*
     * Haetaan sivuja, kunnes vastaan tulee
     * tyhjä sivu. Turvarajana 30 sivua.
     */
    for (
      let page = 1;
      page <= 30;
      page += 1
    ) {
      const data = await sportDbFetch(
        `${LIIGA_RESULTS_PATH}?page=${page}`,
        sportDbApiKey
      );

      const matches = unwrapMatches(data);

      console.log(
        `Liiga results sivu ${page}:`,
        matches.length
      );

      if (matches.length === 0) {
        break;
      }

      allMatches.push(...matches);
    }

    const mappedRows = allMatches
      .map(item =>
        mapMatch(item, season)
      )
      .filter(Boolean);

    /*
     * Poistetaan mahdolliset kaksoiskappaleet.
     */
    const uniqueRows = [
      ...new Map(
        mappedRows.map(row => [
          row.event_id,
          row
        ])
      ).values()
    ];

    const savedRows =
      await supabaseUpsertMatches({
        supabaseUrl,
        serviceRoleKey,
        rows: uniqueRows
      });

    return jsonResponse(200, {
      ok: true,
      season,

      fetched:
        allMatches.length,

      valid:
        uniqueRows.length,

      saved:
        savedRows.length,

      sample:
        uniqueRows.slice(0, 3).map(row => ({
          eventId: row.event_id,
          match:
            `${row.home_team_name}–` +
            `${row.away_team_name}`,
          score:
            `${row.home_score ?? "-"}–` +
            `${row.away_score ?? "-"}`,
          startTime:
            row.start_time
        }))
    });
  } catch (error) {
    console.error(
      "Liiga-kauden tuonti epäonnistui",
      error
    );

    return jsonResponse(500, {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
};