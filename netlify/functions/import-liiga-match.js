/**
 * netlify/functions/import-liiga-match.js
 *
 * Tuo yhden Liiga-ottelun SportDB:stä Supabaseen.
 *
 * Esimerkki:
 * /.netlify/functions/import-liiga-match
 *   ?eventId=jNJPE0yJ
 *   &season=2025-2026
 */

const SPORTDB_BASE_URL = "https://api.sportdb.dev";

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
function findValueByKeys(
  source,
  possibleKeys
) {
  if (
    source === null ||
    source === undefined
  ) {
    return undefined;
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const found = findValueByKeys(
        item,
        possibleKeys
      );

      if (
        found !== undefined &&
        found !== null &&
        found !== ""
      ) {
        return found;
      }
    }

    return undefined;
  }

  if (typeof source !== "object") {
    return undefined;
  }

  for (const key of possibleKeys) {
    if (
      Object.prototype.hasOwnProperty.call(
        source,
        key
      )
    ) {
      const value = source[key];

      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }
  }

  for (const value of Object.values(source)) {
    const found = findValueByKeys(
      value,
      possibleKeys
    );

    if (
      found !== undefined &&
      found !== null &&
      found !== ""
    ) {
      return found;
    }
  }

  return undefined;
}

function findLineupContainer(source) {
  if (!source) return null;

  if (Array.isArray(source)) {
    for (const item of source) {
      const found =
        findLineupContainer(item);

      if (found) return found;
    }

    return null;
  }

  if (typeof source !== "object") {
    return null;
  }

  const home =
    source.home ||
    source.homePlayers ||
    source.homeLineup ||
    source.local;

  const away =
    source.away ||
    source.awayPlayers ||
    source.awayLineup ||
    source.visitor;

  if (
    Array.isArray(home) ||
    Array.isArray(away)
  ) {
    return {
      home: Array.isArray(home)
        ? home
        : [],
      away: Array.isArray(away)
        ? away
        : []
    };
  }

  for (const value of Object.values(source)) {
    const found =
      findLineupContainer(value);

    if (found) return found;
  }

  return null;
}
function toNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const text = String(value)
    .replace(",", ".")
    .replace("%", "")
    .trim();

  /*
   * Esimerkiksi:
   * "93.55% (29/31)" -> 93.55
   * "6.45% (2/31)"   -> 6.45
   */
  const match = text.match(/-?\d+(?:\.\d+)?/);

  if (!match) return null;

  const number = Number(match[0]);

  return Number.isFinite(number)
    ? number
    : null;
}

function toInteger(value) {
  const number = toNumber(value);

  return number === null
    ? null
    : Math.trunc(number);
}

function normalizeDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeTimestamp(value) {
  if (!value) return null;

  /*
   * SportDB voi palauttaa Unix-ajan sekunteina
   * merkkijonona tai ISO-aikana.
   */
  if (/^\d{10,13}$/.test(String(value))) {
    let timestamp = Number(value);

    if (String(value).length === 10) {
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

function parsePeriodScores(details) {
  const result = {
    period_1_home: null,
    period_1_away: null,
    period_2_home: null,
    period_2_away: null,
    period_3_home: null,
    period_3_away: null,
    overtime_home: null,
    overtime_away: null,
    shootout_home: null,
    shootout_away: null
  };

  const periods = firstDefined(
    details?.periods,
    details?.periodScores,
    details?.scores,
    details?.eventPeriods,
    []
  );

  if (!Array.isArray(periods)) {
    return result;
  }

  for (const period of periods) {
    const name = String(
      firstDefined(
        period?.period,
        period?.name,
        period?.periodName,
        period?.label,
        ""
      )
    ).toLowerCase();

    const home = toInteger(
      firstDefined(
        period?.home,
        period?.homeScore,
        period?.scoreHome,
        period?.homeValue
      )
    );

    const away = toInteger(
      firstDefined(
        period?.away,
        period?.awayScore,
        period?.scoreAway,
        period?.awayValue
      )
    );

    if (
      name.includes("1st") ||
      name.includes("1.") ||
      name.includes("first")
    ) {
      result.period_1_home = home;
      result.period_1_away = away;
    } else if (
      name.includes("2nd") ||
      name.includes("2.") ||
      name.includes("second")
    ) {
      result.period_2_home = home;
      result.period_2_away = away;
    } else if (
      name.includes("3rd") ||
      name.includes("3.") ||
      name.includes("third")
    ) {
      result.period_3_home = home;
      result.period_3_away = away;
    } else if (
      name.includes("overtime") ||
      name === "ot" ||
      name.includes("jatkoaika")
    ) {
      result.overtime_home = home;
      result.overtime_away = away;
    } else if (
      name.includes("shootout") ||
      name.includes("penalt") ||
      name.includes("voittolaukaus")
    ) {
      result.shootout_home = home;
      result.shootout_away = away;
    }
  }

  return result;
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
      `SportDB ${path} epäonnistui: ` +
      `${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function supabaseUpsert({
  supabaseUrl,
  serviceRoleKey,
  table,
  rows,
  conflictColumns
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const conflictQuery = conflictColumns
    ? `?on_conflict=${encodeURIComponent(
        conflictColumns
      )}`
    : "";

  const allKeys = [
    ...new Set(
      rows.flatMap(row =>
        Object.keys(row)
      )
    )
  ];

  const normalizedRows =
    rows.map(row =>
      Object.fromEntries(
        allKeys.map(key => [
          key,
          row[key] === undefined
            ? null
            : row[key]
        ])
      )
    );

  const response = await fetch(
    `${supabaseUrl}/rest/v1/${table}${conflictQuery}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization:
          `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer:
          "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(normalizedRows)
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
      `Supabase-taulu ${table} epäonnistui: ` +
      `${response.status} ${JSON.stringify(data)}`
    );
  }

  return Array.isArray(data) ? data : [];
}

function unwrapDetails(rawDetails) {
  if (Array.isArray(rawDetails)) {
    return rawDetails[0] || {};
  }

  return rawDetails || {};
}

function unwrapLineups(rawLineups) {
  const container =
    findLineupContainer(rawLineups);

  if (container) {
    return container;
  }

  /*
   * Varavaihtoehto, jos pelaajat tulevat
   * yhtenä listana ja joukkuepuoli on
   * merkitty pelaajan tietoihin.
   */
  const allPlayers = [];

  function collectPlayers(source) {
    if (!source) return;

    if (Array.isArray(source)) {
      for (const item of source) {
        collectPlayers(item);
      }

      return;
    }

    if (typeof source !== "object") {
      return;
    }

    const playerId = firstDefined(
      source.participantId,
      source.playerId
    );

    const playerName = firstDefined(
      source.participantName,
      source.playerName
    );

    if (playerId && playerName) {
      allPlayers.push(source);
      return;
    }

    for (const value of Object.values(source)) {
      collectPlayers(value);
    }
  }

  collectPlayers(rawLineups);

  return {
    home: allPlayers.filter(player => {
      const side = String(
        firstDefined(
          player.side,
          player.teamSide,
          player.participantSide,
          ""
        )
      ).toLowerCase();

      return (
        side === "home" ||
        side === "local"
      );
    }),

    away: allPlayers.filter(player => {
      const side = String(
        firstDefined(
          player.side,
          player.teamSide,
          player.participantSide,
          ""
        )
      ).toLowerCase();

      return (
        side === "away" ||
        side === "visitor"
      );
    })
  };
}

function getMatchStats(rawStats) {
  if (!Array.isArray(rawStats)) {
    return [];
  }

  const matchSection = rawStats.find(item => {
    const period = String(
      item?.period || ""
    ).toLowerCase();

    return (
      period === "match" ||
      period === "game" ||
      period === "ottelu"
    );
  });

  return Array.isArray(matchSection?.stats)
    ? matchSection.stats
    : [];
}

function findStat(stats, names) {
  const wantedNames = names.map(name =>
    name.toLowerCase()
  );

  return stats.find(stat => {
    const statName = String(
      stat?.statName || stat?.name || ""
    ).toLowerCase();

    return wantedNames.some(
      wanted =>
        statName === wanted ||
        statName.includes(wanted)
    );
  });
}

function parseFractionDenominator(value) {
  if (!value) return null;

  const match = String(value).match(
    /\((\d+)\/(\d+)\)/
  );

  if (!match) return null;

  return Number(match[2]);
}

function parseTeamStatRows({
  eventId,
  homeTeamId,
  homeTeamName,
  awayTeamId,
  awayTeamName,
  homeScore,
  awayScore,
  rawStats
}) {
  const stats = getMatchStats(rawStats);

  function values(names) {
    const stat = findStat(stats, names);

    return {
      home: stat
        ? toNumber(stat.homeValue)
        : null,
      away: stat
        ? toNumber(stat.awayValue)
        : null,
      homeRaw: stat?.homeValue ?? null,
      awayRaw: stat?.awayValue ?? null
    };
  }

  const xg = values([
    "expected goals",
    "expected goals (xg)"
  ]);

  const shotsOnGoal = values([
    "shots on goal"
  ]);

  const shotsOffTarget = values([
    "shots off target"
  ]);

  const blockedShots = values([
    "blocked shots"
  ]);

  const shootingPct = values([
    "shooting pct"
  ]);

  const goalkeeperSaves = values([
    "goalkeeper saves"
  ]);

  const savePct = values([
    "saves pct",
    "save pct"
  ]);

  const penalties = values([
    "penalties"
  ]);

  const pim = values([
    "pim"
  ]);

  const powerPlayGoals = values([
    "power-play goals",
    "power play goals"
  ]);

  const powerPlayPct = values([
    "power-play pct",
    "power play pct"
  ]);

  const penaltyKillingPct = values([
    "pen. killing pct",
    "penalty killing pct"
  ]);

  const faceoffsWon = values([
    "faceoffs won"
  ]);

  const faceoffPct = values([
    "faceoffs %"
  ]);

  const emptyNetGoals = values([
    "empty net goals"
  ]);

  /*
   * Esimerkiksi "50% (1/2)".
   * Mahdollisuuksien määrä on jakolaskun nimittäjä.
   */
  const homePowerPlayOpportunities =
    parseFractionDenominator(
      powerPlayPct.homeRaw
    );

  const awayPowerPlayOpportunities =
    parseFractionDenominator(
      powerPlayPct.awayRaw
    );

  const commonRawStats = {
    source: "sportdb",
    stats: rawStats
  };

  const homeRow = {
    event_id: eventId,

    team_id: homeTeamId,
    team_name: homeTeamName,

    opponent_id: awayTeamId,
    opponent_name: awayTeamName,

    is_home: true,

    goals: homeScore,
    goals_against: awayScore,

    xg: xg.home,
    xg_against: xg.away,

    shots_on_goal: shotsOnGoal.home,
    shots_on_goal_against:
      shotsOnGoal.away,

    shots_off_target:
      shotsOffTarget.home,
    shots_off_target_against:
      shotsOffTarget.away,

    blocked_shots:
      blockedShots.home,
    blocked_shots_against:
      blockedShots.away,

    shooting_pct:
      shootingPct.home,
    save_pct:
      savePct.home,

    goalkeeper_saves:
      goalkeeperSaves.home,

    penalties:
      penalties.home,
    pim:
      pim.home,

    power_play_goals:
      powerPlayGoals.home,
    power_play_opportunities:
      homePowerPlayOpportunities,
    power_play_pct:
      powerPlayPct.home,

    penalty_kill_pct:
      penaltyKillingPct.home,

    faceoffs_won:
      faceoffsWon.home,
    faceoff_pct:
      faceoffPct.home,

    empty_net_goals:
      emptyNetGoals.home,

    raw_stats: commonRawStats,

    updated_at:
      new Date().toISOString()
  };

  const awayRow = {
    event_id: eventId,

    team_id: awayTeamId,
    team_name: awayTeamName,

    opponent_id: homeTeamId,
    opponent_name: homeTeamName,

    is_home: false,

    goals: awayScore,
    goals_against: homeScore,

    xg: xg.away,
    xg_against: xg.home,

    shots_on_goal:
      shotsOnGoal.away,
    shots_on_goal_against:
      shotsOnGoal.home,

    shots_off_target:
      shotsOffTarget.away,
    shots_off_target_against:
      shotsOffTarget.home,

    blocked_shots:
      blockedShots.away,
    blocked_shots_against:
      blockedShots.home,

    shooting_pct:
      shootingPct.away,
    save_pct:
      savePct.away,

    goalkeeper_saves:
      goalkeeperSaves.away,

    penalties:
      penalties.away,
    pim:
      pim.away,

    power_play_goals:
      powerPlayGoals.away,
    power_play_opportunities:
      awayPowerPlayOpportunities,
    power_play_pct:
      powerPlayPct.away,

    penalty_kill_pct:
      penaltyKillingPct.away,

    faceoffs_won:
      faceoffsWon.away,
    faceoff_pct:
      faceoffPct.away,

    empty_net_goals:
      emptyNetGoals.away,

    raw_stats: commonRawStats,

    updated_at:
      new Date().toISOString()
  };

  return [homeRow, awayRow];
}

function parseLineupRows({
  eventId,
  lineups,
  homeTeamId,
  homeTeamName,
  awayTeamId,
  awayTeamName
}) {
  const rows = [];

  function addPlayers(
    players,
    teamId,
    teamName,
    side
  ) {
    if (!Array.isArray(players)) return;

    for (const player of players) {
      const playerId = String(
        firstDefined(
          player?.participantId,
          player?.playerId,
          player?.id,
          ""
        )
      );

      if (!playerId) continue;

      const playerName = String(
        firstDefined(
          player?.participantName,
          player?.playerName,
          player?.name,
          ""
        )
      );

      if (!playerName) continue;

      const specialPosition =
        firstDefined(
          player?.participantSpecialPosition,
          player?.specialPosition,
          ""
        );

      const position =
        firstDefined(
          player?.participantSpecialPositionName,
          player?.positionName,
          player?.position,
          specialPosition,
          ""
        );

      const positionKey = String(
  specialPosition || position || ""
)
  .replace(/[()]/g, "")
  .trim()
  .toUpperCase();

      const isGoalkeeper =
        positionKey === "G" ||
        String(position)
          .toLowerCase()
          .includes("goalkeeper") ||
        String(position)
          .toLowerCase()
          .includes("maalivahti");

      const lineNumber =
        toInteger(
          firstDefined(
            player?.lineupLine,
            player?.lineNumber,
            player?.formationLine
          )
        );

      const positionKeyNumber =
        toInteger(
          firstDefined(
            player?.positionKey,
            player?.positionId
          )
        );

      /*
       * Ensimmäisen ketjun/maalivahtiryhmän
       * ensimmäinen maalivahti tulkitaan
       * aloittavaksi. Tätä voidaan myöhemmin
       * tarkentaa SportDB:n kenttien mukaan.
       */
      const isStartingGoalkeeper =
        isGoalkeeper &&
        (
          positionKeyNumber === 1 ||
          lineNumber === 1 ||
          String(
            player?.starting ?? ""
          ).toLowerCase() === "true"
        );

      rows.push({
        event_id: eventId,

        team_id: teamId,
        team_name: teamName,

        player_id: playerId,
        player_name: playerName,

        shirt_number:
          firstDefined(
            player?.participantNumber,
            player?.shirtNumber,
            player?.number,
            null
          ),

        position:
          position || null,

        position_key:
          positionKey || null,

        line_number:
          lineNumber,

        formation:
          firstDefined(
            player?.formation,
            null
          ),

        is_goalkeeper:
          isGoalkeeper,

        is_starting_goalkeeper:
          isStartingGoalkeeper,

        player_rating:
          toNumber(
            firstDefined(
              player?.participantRating,
              player?.rating
            )
          ),

        raw_player: {
          side,
          player
        }
      });
    }
  }

  addPlayers(
    lineups?.home,
    homeTeamId,
    homeTeamName,
    "home"
  );

  addPlayers(
    lineups?.away,
    awayTeamId,
    awayTeamName,
    "away"
  );

  return rows;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {
      ok: true
    });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, {
      error: "Vain GET on sallittu"
    });
  }

  const eventId =
    event.queryStringParameters?.eventId;

  const season =
    event.queryStringParameters?.season ||
    "2025-2026";

  if (!eventId) {
    return jsonResponse(400, {
      error:
        "eventId puuttuu. Esimerkiksi " +
        "?eventId=jNJPE0yJ&season=2025-2026"
    });
  }

  const sportDbApiKey =
    process.env.SPORTDB_API_KEY;

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sportDbApiKey) {
    return jsonResponse(500, {
      error:
        "SPORTDB_API_KEY puuttuu Netlifyn ympäristömuuttujista"
    });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error:
        "SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu"
    });
  }

  try {
    const encodedEventId =
      encodeURIComponent(eventId);

    const [
      rawDetails,
      rawStats,
      rawLineups
    ] = await Promise.all([
      sportDbFetch(
        `/api/flashscore/match/${encodedEventId}/details`,
        sportDbApiKey
      ),
      sportDbFetch(
        `/api/flashscore/match/${encodedEventId}/stats`,
        sportDbApiKey
      ),
      sportDbFetch(
        `/api/flashscore/match/${encodedEventId}/lineups`,
        sportDbApiKey
      )
    ]);

    const details =
      unwrapDetails(rawDetails);

    const lineups =
      unwrapLineups(rawLineups);

    const homeTeamId = String(
  firstDefined(
    findValueByKeys(details, [
      "eventHomeParticipantId",
      "homeParticipantId",
      "homeTeamId",
      "homeId"
    ]),
    ""
  )
);

const awayTeamId = String(
  firstDefined(
    findValueByKeys(details, [
      "eventAwayParticipantId",
      "awayParticipantId",
      "awayTeamId",
      "awayId"
    ]),
    ""
  )
);

const homeTeamName = String(
  firstDefined(
    findValueByKeys(details, [
      "eventHomeParticipantName",
      "homeParticipantName",
      "homeTeamName",
      "homeName"
    ]),
    ""
  )
);

const awayTeamName = String(
  firstDefined(
    findValueByKeys(details, [
      "eventAwayParticipantName",
      "awayParticipantName",
      "awayTeamName",
      "awayName"
    ]),
    ""
  )
);

 

    if (
      !homeTeamId ||
      !awayTeamId ||
      !homeTeamName ||
      !awayTeamName
    ) {
      return jsonResponse(422, {
        error:
          "Joukkueiden tietoja ei löytynyt details-vastauksesta",
        eventId,
        detected: {
          homeTeamId,
          homeTeamName,
          awayTeamId,
          awayTeamName
        },
        details
      });
    }

    const homeScore = toInteger(
  findValueByKeys(details, [
    "eventHomeScore",
    "homeScore",
    "homeFullTimeResult",
    "scoreHome",
    "homeResult"
  ])
);

const awayScore = toInteger(
  findValueByKeys(details, [
    "eventAwayScore",
    "awayScore",
    "awayFullTimeResult",
    "scoreAway",
    "awayResult"
  ])
);

const rawStartTime =
  findValueByKeys(details, [
    "startDateTimeUtc",
    "startDateTime",
    "eventStartTime",
    "startTime",
    "startUTCTime",
    "timestamp"
  ]);

const startTime =
  normalizeTimestamp(rawStartTime);

    const periodScores =
      parsePeriodScores(details);

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

    const matchRow = {
      event_id: String(eventId),
      season,

      match_date:
        normalizeDate(startTime),

      start_time:
        startTime,

      status:
        firstDefined(
          details?.eventStage,
          details?.status,
          details?.state,
          null
        ),

      stage:
        firstDefined(
          details?.tournamentStage?.name,
          details?.stageName,
          details?.stage,
          null
        ),

      home_team_id:
        homeTeamId,

      home_team_name:
        homeTeamName,

      away_team_id:
        awayTeamId,

      away_team_name:
        awayTeamName,

      home_score:
        homeScore,

      away_score:
        awayScore,

      ...periodScores,

      winner_team_id:
        winnerTeamId,

      details_json: {
        source: "sportdb",
        details
      },

      updated_at:
        new Date().toISOString()
    };

    /*
     * Ottelu tallennetaan ensin, koska stats-
     * ja lineup-tauluissa on viiteavain siihen.
     */
    const savedMatch =
      await supabaseUpsert({
        supabaseUrl,
        serviceRoleKey,
        table: "liiga_matches",
        rows: [matchRow],
        conflictColumns: "event_id"
      });

    const statsRows =
      parseTeamStatRows({
        eventId: String(eventId),

        homeTeamId,
        homeTeamName,

        awayTeamId,
        awayTeamName,

        homeScore,
        awayScore,

        rawStats
      });

    const savedStats =
      await supabaseUpsert({
        supabaseUrl,
        serviceRoleKey,
        table:
          "liiga_team_match_stats",
        rows:
          statsRows,
        conflictColumns:
          "event_id,team_id"
      });

    const lineupRows =
      parseLineupRows({
        eventId: String(eventId),
        lineups,

        homeTeamId,
        homeTeamName,

        awayTeamId,
        awayTeamName
      });

    const savedLineups =
      await supabaseUpsert({
        supabaseUrl,
        serviceRoleKey,
        table: "liiga_lineups",
        rows: lineupRows,
        conflictColumns:
          "event_id,team_id,player_id"
      });

        return jsonResponse(200, {
      ok: true,

      eventId,
      season,

      match: {
        home:
          homeTeamName,
        away:
          awayTeamName,
        score:
          `${homeScore ?? "-"}-${awayScore ?? "-"}`,
        startTime
      },

      saved: {
        matches:
          savedMatch.length,
        teamStats:
          savedStats.length,
        lineups:
          savedLineups.length
      },

      diagnostics: {
        rawStartTime:
          rawStartTime ?? null,

        lineupStructure: {
          homePlayers:
            Array.isArray(lineups?.home)
              ? lineups.home.length
              : 0,

          awayPlayers:
            Array.isArray(lineups?.away)
              ? lineups.away.length
              : 0
        }
      },

      detectedStats:
        statsRows.map(row => ({
          team:
            row.team_name,
          goals:
            row.goals,
          xg:
            row.xg,
          shotsOnGoal:
            row.shots_on_goal,
          savePct:
            row.save_pct,
          powerPlayPct:
            row.power_play_pct,
          faceoffPct:
            row.faceoff_pct
        }))
    });
  } catch (error) {
    console.error(
      "Liiga-ottelun tuonti epäonnistui",
      error
    );

    return jsonResponse(500, {
      ok: false,
      eventId,
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
};