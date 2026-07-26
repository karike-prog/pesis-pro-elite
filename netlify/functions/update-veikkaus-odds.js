const VEIKKAUS_URL =
  "https://content.ob.veikkaus.fi/content-service/api/v1/q/time-band-event-list?maxMarkets=10&excludeEventsWithNoMarkets=false&allowedEventSorts=MTCH&includeChildMarkets=true&prioritisePrimaryMarkets=true&includeCommentary=true&includeMedia=true&drilldownTagIds=34&useMarketGroupCodeCombis=true&maxTotalItems=60&maxEventsPerCompetition=7&maxCompetitionsPerSportPerBand=3&maxEventsForNextToGo=5&startTimeOffsetForNextToGo=600&lang=fi-FI&channel=M";

const TEAM_NAMES = {
  "Fera Rauma N": "Fera",
  "Laitilan Jyske N": "Jyske",
  "Lapuan Virkiä N": "Virkiä",
  "Jussittaret Seinäjoki N": "Jussittaret",
  "Hyvinkään Tahko": "Tahko",
  "Imatran Pallo-Veikot": "IPV",
  "Manse PP Tampere": "Manse",
  "Sotkamon Jymy": "SoJy",
  "Pattijoen Urheilijat": "PattU",
  "Kempeleen Kiri": "KeKi",
  "Pesäkarhut Pori N": "Pesäkarhut",
  "Jyväskylän Kirittäret N": "Kirittäret",
  "Roihuttaret Helsinki N": "Roihuttaret",
  "Manse PP Tampere N": "Manse",
    "Alajärven Ankkurit": "AA",
  "Vimpelin Veto": "ViVe",
  "Joensuun Maila": "JoMa",
  "Koskenkorvan Urheilijat": "KoU",
  "Oulun Lippo N": "Lippo Naiset",
  "Pöytyän Urheilijat N": "PöU Pesis",
  "Kiteen Pallo": "KiPa",
"Kouvolan Pallonlyöjät": "KPL",
"Mailattaret Vaasa N": "Mailattaret",
"Joensuun Maila N": "JoMa",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

function getMappedTeamName(name) {
  return TEAM_NAMES[name] || name;
}

function getWinnerOdds(eventItem) {
  const winnerMarket = (eventItem.markets || []).find((market) =>
    String(market?.name || "")
      .toLowerCase()
      .includes("voittaja (1x2)")
  );

  const outcomes = winnerMarket?.outcomes || [];

  function oddsFor(subType) {
    const outcome = outcomes.find(
      (item) => item?.subType === subType
    );

    const price = (outcome?.prices || []).find(
      (item) => item?.priceType === "LP"
    );

    return price?.decimal ?? null;
  }

  return {
    home: oddsFor("H"),
    draw: oddsFor("D"),
    away: oddsFor("A")
  };
}
function getFinalWinnerOdds(eventItem) {
  const finalWinnerMarket = (eventItem.markets || []).find(
    (market) => {
      const name = String(
        market?.name || ""
      ).toLowerCase();

      const outcomes = market?.outcomes || [];

      const hasHome = outcomes.some(
        outcome => outcome?.subType === "H"
      );

      const hasAway = outcomes.some(
        outcome => outcome?.subType === "A"
      );

      const hasDraw = outcomes.some(
        outcome => outcome?.subType === "D"
      );

      return (
        hasHome &&
        hasAway &&
        !hasDraw &&
        (
          name.includes("lopullinen voittaja") ||
          name.includes("ottelun voittaja") ||
          name === "voittaja"
        )
      );
    }
  );

  const outcomes =
    finalWinnerMarket?.outcomes || [];

  function oddsFor(subType) {
    const outcome = outcomes.find(
      item => item?.subType === subType
    );

    const price = (outcome?.prices || []).find(
      item => item?.priceType === "LP"
    );

    return price?.decimal ?? null;
  }

  return {
    home: oddsFor("H"),
    away: oddsFor("A")
  };
}
function getTotalOdds(eventItem) {
  const totalMarket = (eventItem.markets || []).find((market) => {
    const name = String(market?.name || "").toLowerCase();

    return (
      name.includes("juoksut yli/alle") ||
      name.includes("yli/alle")
    );
  });

  if (!totalMarket) {
    return {
      line: null,
      over: null,
      under: null
    };
  }

  const outcomes = totalMarket.outcomes || [];

  const overOutcome = outcomes.find((outcome) => {
    const name = String(outcome?.name || "").toLowerCase();
    return name.includes("yli");
  });

  const underOutcome = outcomes.find((outcome) => {
    const name = String(outcome?.name || "").toLowerCase();
    return name.includes("alle");
  });

  function getPrice(outcome) {
    const price = (outcome?.prices || []).find(
      (item) => item?.priceType === "LP"
    );

    return price?.decimal ?? null;
  }

  const possibleLineValues = [
    totalMarket.handicapValue,
    overOutcome?.prices?.[0]?.handicapLow,
    overOutcome?.prices?.[0]?.handicapHigh,
    underOutcome?.prices?.[0]?.handicapLow,
    underOutcome?.prices?.[0]?.handicapHigh
  ];

  const lineValue = possibleLineValues.find(
    (value) => value !== null && value !== undefined
  );

  return {
    line:
      lineValue !== undefined
        ? Number(lineValue)
        : null,
    over: getPrice(overOutcome),
    under: getPrice(underOutcome)
  };
}
exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, {
      error: "Vain GET on sallittu"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error:
        "SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu"
    });
  }

  try {
    const veikkausResponse = await fetch(VEIKKAUS_URL, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "fi-FI",
        "User-Agent": "Pesis-Pro-Elite/1.0"
      }
    });

    const data = await veikkausResponse.json();

    if (!veikkausResponse.ok) {
      return jsonResponse(502, {
        error: "Veikkaus-datan haku epäonnistui",
        status: veikkausResponse.status,
        details: data
      });
    }

    const timeBands = Array.isArray(
      data?.data?.timeBandEvents
    )
      ? data.data.timeBandEvents
      : [];

    const allEvents = timeBands.flatMap((band) =>
      Array.isArray(band?.events) ? band.events : []
    );

    const pesisEvents = allEvents.filter((eventItem) => {
      const categoryCode = String(
        eventItem?.category?.code || ""
      ).toUpperCase();

      const categoryName = String(
        eventItem?.category?.name || ""
      ).toLowerCase();

      return (
        categoryCode === "PESAPALLO" ||
        categoryName.includes("pesäpallo")
      );
    });

    const results = [];

    for (const eventItem of pesisEvents) {
      const homeOriginal =
        eventItem.teams?.find(
          (team) => team.side === "HOME"
        )?.name ?? null;

      const awayOriginal =
        eventItem.teams?.find(
          (team) => team.side === "AWAY"
        )?.name ?? null;

      if (!homeOriginal || !awayOriginal) {
        continue;
      }

      const homeTeam =
        getMappedTeamName(homeOriginal);

      const awayTeam =
        getMappedTeamName(awayOriginal);

      const startTime = new Date(eventItem.startTime);
      const lockTime = new Date(
  startTime.getTime() - 5 * 60 * 1000
);

if (Date.now() >= lockTime.getTime()) {
  console.log(
    `Ohitetaan ${homeTeam} - ${awayTeam}, markkina lukittu`
  );
  continue;
}


      const matchDate = startTime
        .toISOString()
        .slice(0, 10);

      const odds = getWinnerOdds(eventItem

      const endpoint =
        `${supabaseUrl}/rest/v1/match_history` +
        `?match_date=eq.${encodeURIComponent(matchDate)}` +
        `&home_team=eq.${encodeURIComponent(homeTeam)}` +
        `&away_team=eq.${encodeURIComponent(awayTeam)}`;

      const updateRow = {
        veikkaus_event_id: String(eventItem.id),
        veikkaus_snapshot_at:
          new Date().toISOString(),
        veikkaus_home_odds: odds.home,
        veikkaus_draw_odds: odds.draw,
        veikkaus_away_odds: odds.away,
        veikkaus_final_home: finalOdds.home,
        veikkaus_final_away: finalOdds.away,
        veikkaus_total_line: totals.line,
        veikkaus_over_odds: totals.over,
        veikkaus_under_odds: totals.under
      };

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

      const responseText = await response.text();

      let responseData;

      try {
        responseData = responseText
          ? JSON.parse(responseText)
          : null;
      } catch {
        responseData = responseText;
      }

      results.push({
        home_team: homeTeam,
        away_team: awayTeam,
        match_date: matchDate,
        odds,
        totals,
        status: response.status,
        updated:
          Array.isArray(responseData) &&
          responseData.length > 0,
        response: responseData
      });
    }

    return jsonResponse(200, {
      ok: true,
      eventCount: pesisEvents.length,
      results
    });
  } catch (error) {
    console.error(
      "Veikkaus-kertoimien tallennus epäonnistui",
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