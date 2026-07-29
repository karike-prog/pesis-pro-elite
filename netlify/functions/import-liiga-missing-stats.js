/**
 * netlify/functions/import-liiga-missing-stats.js
 *
 * Tuo vain ne kauden ottelut, joilta puuttuu kaksi xG-tilastoriviä.
 * Käyttää olemassa olevaa import-liiga-match-funktiota.
 *
 * Käynnistys:
 * /.netlify/functions/import-liiga-missing-stats
 *   ?season=2025-2026
 *   &limit=3
 *   &auto=1
 */

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 5;
const PAGE_SIZE = 1000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

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

function htmlResponse(statusCode, html) {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    },
    body: html
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function sleep(milliseconds) {
  return new Promise(resolve =>
    setTimeout(resolve, milliseconds)
  );
}

function getFunctionOrigin(event) {
  const forwardedProto =
    event.headers?.["x-forwarded-proto"];

  const proto =
    forwardedProto ||
    (event.headers?.host?.includes("localhost")
      ? "http"
      : "https");

  const host =
    event.headers?.["x-forwarded-host"] ||
    event.headers?.host;

  if (!host) {
    throw new Error(
      "Netlify-funktion osoitetta ei voitu päätellä"
    );
  }

  return `${proto}://${host}`;
}

async function supabaseFetch({
  supabaseUrl,
  serviceRoleKey,
  path
}) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${path}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json"
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
      `Supabase-haku epäonnistui: ` +
      `${response.status} ${JSON.stringify(data)}`
    );
  }

  return Array.isArray(data) ? data : [];
}

async function supabaseFetchAll({
  supabaseUrl,
  serviceRoleKey,
  table,
  parameters
}) {
  const allRows = [];
  let offset = 0;

  while (true) {
    const query = new URLSearchParams({
      ...parameters,
      offset: String(offset),
      limit: String(PAGE_SIZE)
    });

    const rows = await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: `${table}?${query.toString()}`
    });

    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) {
      return allRows;
    }

    offset += rows.length;
  }
}

async function importMatch({
  functionOrigin,
  eventId,
  season
}) {
  const query = new URLSearchParams({
    eventId,
    season
  });

  const response = await fetch(
    `${functionOrigin}/.netlify/functions/` +
      `import-liiga-match?${query.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Liiga-Elite-Missing-Stats/1.0"
      }
    }
  );

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { rawResponse: text };
  }

  if (!response.ok || data?.ok !== true) {
    throw new Error(
      data?.error ||
      `import-liiga-match palautti tilan ${response.status}`
    );
  }

  return data;
}

async function importWithRetry(options) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= RETRY_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const imported = await importMatch(options);

      return {
        imported,
        attempts: attempt
      };
    } catch (error) {
      lastError = error;

      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError;
}

function findMissingMatches(matches, statsRows) {
  const statusByEventId = new Map();

  for (const row of statsRows) {
    const eventId = String(row.event_id);
    const status =
      statusByEventId.get(eventId) || {
        rowCount: 0,
        xgCount: 0
      };

    status.rowCount += 1;

    if (
      row.xg !== null &&
      row.xg !== undefined &&
      row.xg !== ""
    ) {
      status.xgCount += 1;
    }

    statusByEventId.set(eventId, status);
  }

  return matches.filter(match => {
    const status =
      statusByEventId.get(String(match.event_id));

    return (
      !status ||
      status.rowCount < 2 ||
      status.xgCount < 2
    );
  });
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

  const season =
    event.queryStringParameters?.season ||
    "2025-2026";

  const requestedLimit = positiveInteger(
    event.queryStringParameters?.limit,
    DEFAULT_LIMIT
  );

  const limit = Math.min(
    requestedLimit,
    MAX_LIMIT
  );

  const auto =
    event.queryStringParameters?.auto === "1";

  try {
    const functionOrigin = getFunctionOrigin(event);

    const [matches, statsRows] = await Promise.all([
      supabaseFetchAll({
        supabaseUrl,
        serviceRoleKey,
        table: "liiga_matches",
        parameters: {
          select: "event_id,match_date",
          season: `eq.${season}`,
          order: "match_date.asc,event_id.asc"
        }
      }),
      supabaseFetchAll({
        supabaseUrl,
        serviceRoleKey,
        table: "liiga_team_match_stats",
        parameters: {
          select: "event_id,xg",
          order: "event_id.asc"
        }
      })
    ]);

    const missingBefore =
      findMissingMatches(matches, statsRows);

    if (missingBefore.length === 0) {
      const body = {
        ok: true,
        done: true,
        season,
        totalMatches: matches.length,
        missingBefore: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        message:
          "Valmis: kaikilla kauden otteluilla on kaksi xG-riviä."
      };

      return auto
        ? htmlResponse(
            200,
            `<!doctype html>
<html lang="fi">
<meta charset="utf-8">
<title>Liiga Elite – puuttuvat xG-tilastot</title>
<style>
body{font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px}
</style>
<h1>Liiga Elite – puuttuvat xG-tilastot</h1>
<h2>Valmis</h2>
<p>Kaikilla ${escapeHtml(matches.length)} ottelulla on kaksi xG-riviä.</p>
</html>`
          )
        : jsonResponse(200, body);
    }

    const batch = missingBefore.slice(0, limit);
    const results = [];

    /*
     * Ottelut käsitellään tarkoituksella yksi kerrallaan.
     * Tämä vähentää SportDB:n hetkellisiä nopeusrajoitusvirheitä.
     */
    for (const match of batch) {
      const eventId = String(match.event_id);

      try {
        const {
          imported,
          attempts
        } = await importWithRetry({
          functionOrigin,
          eventId,
          season
        });

        results.push({
          ok: true,
          eventId,
          attempts,
          saved: imported.saved || null
        });
      } catch (error) {
        results.push({
          ok: false,
          eventId,
          attempts: RETRY_ATTEMPTS,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        });
      }

      await sleep(750);
    }

    const succeeded =
      results.filter(result => result.ok);
    const failed =
      results.filter(result => !result.ok);
    const estimatedRemaining = Math.max(
      0,
      missingBefore.length - succeeded.length
    );

    const nextQuery = new URLSearchParams({
      season,
      limit: String(limit),
      ...(auto ? { auto: "1" } : {})
    });

    const nextUrl =
      `${functionOrigin}/.netlify/functions/` +
      `import-liiga-missing-stats?${nextQuery.toString()}`;

    const body = {
      ok: failed.length === 0,
      done: false,
      season,
      totalMatches: matches.length,
      missingBefore: missingBefore.length,
      processed: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      estimatedRemaining,
      nextUrl,
      results
    };

    if (!auto) {
      return jsonResponse(200, body);
    }

    const resultRows = results.map(result =>
      `<li><code>${escapeHtml(result.eventId)}</code>: ` +
      (
        result.ok
          ? `onnistui (${escapeHtml(result.attempts)} yritystä)`
          : `epäonnistui: ${escapeHtml(result.error)}`
      ) +
      `</li>`
    ).join("");

    const continuation = failed.length > 0
      ? `<h2>Ajo pysäytettiin</h2>
<p>${escapeHtml(failed.length)} ottelua epäonnistui kolmen yrityksen jälkeen. Virheen tarkka syy näkyy yllä.</p>
<p><a href="${escapeHtml(nextUrl)}">Yritä puuttuvia otteluita uudelleen</a></p>`
      : `<p>Seuraava puuttuvien otteluiden erä käynnistyy automaattisesti kolmen sekunnin kuluttua.</p>
<script>
setTimeout(() => location.replace(${JSON.stringify(nextUrl)}), 3000);
</script>`;

    return htmlResponse(
      200,
      `<!doctype html>
<html lang="fi">
<meta charset="utf-8">
<title>Liiga Elite – puuttuvat xG-tilastot</title>
<style>
body{font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px}
code{background:#f3f4f6;padding:2px 6px;border-radius:4px}
li{margin:.5rem 0}
</style>
<h1>Liiga Elite – puuttuvat xG-tilastot</h1>
<p>Kausi: <code>${escapeHtml(season)}</code></p>
<p>Puuttui ennen tätä erää: <strong>${escapeHtml(missingBefore.length)}</strong> ottelua.</p>
<p>Tässä erässä onnistui: <strong>${escapeHtml(succeeded.length)}/${escapeHtml(results.length)}</strong>.</p>
<p>Arviolta jäljellä: <strong>${escapeHtml(estimatedRemaining)}</strong> ottelua.</p>
<ul>${resultRows}</ul>
${continuation}
</html>`
    );
  } catch (error) {
    console.error(
      "Puuttuvien Liiga-tilastojen tuonti epäonnistui",
      error
    );

    return jsonResponse(500, {
      ok: false,
      season,
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
};
