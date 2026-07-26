const VEIKKAUS_URL =
  "https://content.ob.veikkaus.fi/content-service/api/v1/q/time-band-event-list?maxMarkets=10&excludeEventsWithNoMarkets=false&allowedEventSorts=MTCH&includeChildMarkets=true&prioritisePrimaryMarkets=true&includeCommentary=true&includeMedia=true&drilldownTagIds=34&useMarketGroupCodeCombis=true&maxTotalItems=60&maxEventsPerCompetition=7&maxCompetitionsPerSportPerBand=3&maxEventsForNextToGo=5&startTimeOff%2C2026-07-26T21%3A00%3A00Z%2C2026-07-27T21%3A00%3A00Z&lang=fi-FI&channel=M";

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return response(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return response(405, {
      error: "Vain GET on sallittu"
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

    const text = await veikkausResponse.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return response(502, {
        error: "Veikkauksen vastaus ei ollut JSON-muodossa",
        status: veikkausResponse.status,
        preview: text.slice(0, 500)
      });
    }

    if (!veikkausResponse.ok) {
      return response(502, {
        error: "Veikkaus-datan haku epäonnistui",
        status: veikkausResponse.status,
        details: data
      });
    }

    const events = Array.isArray(data?.data?.events)
    const timeBands = Array.isArray(data?.data?.timeBandEvents)
  ? data.data.timeBandEvents
  : [];

const allEvents = timeBands.flatMap((band) =>
  Array.isArray(band?.events) ? band.events : []
);

const pesisEvents = allEvents
  .filter((eventItem) => {
    const categoryCode =
      String(eventItem?.category?.code || "").toUpperCase();

    const categoryName =
      String(eventItem?.category?.name || "").toLowerCase();

    return (
      categoryCode === "PESAPALLO" ||
      categoryName.includes("pesäpallo")
    );
  })
  .map((eventItem) => {
    const winnerMarket = (eventItem.markets || []).find(
      (market) =>
        String(market?.name || "")
          .toLowerCase()
          .includes("voittaja (1x2)")
    );

    const outcomes = winnerMarket?.outcomes || [];

    function getOdds(subType) {
      const outcome = outcomes.find(
        (item) => item?.subType === subType
      );

      const price = (outcome?.prices || []).find(
        (item) => item?.priceType === "LP"
      );

      return price?.decimal ?? null;
    }

    const homeTeam =
      eventItem.teams?.find(
        (team) => team.side === "HOME"
      )?.name ?? null;

    const awayTeam =
      eventItem.teams?.find(
        (team) => team.side === "AWAY"
      )?.name ?? null;

    return {
      veikkaus_event_id: String(eventItem.id),
      start_time: eventItem.startTime,
      competition: eventItem.type?.name ?? null,
      home_team: homeTeam,
      away_team: awayTeam,
      home_odds: getOdds("H"),
      draw_odds: getOdds("D"),
      away_odds: getOdds("A")
    };
  });

return response(200, {
  ok: true,
  count: pesisEvents.length,
  events: pesisEvents
});
  } catch (error) {
    console.error("Veikkaus-haku epäonnistui", error);

    return response(500, {
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
};