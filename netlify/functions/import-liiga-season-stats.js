/**
 * netlify/functions/import-liiga-season-stats.js
 *
 * Täydentää liiga_matches-taulussa jo olevien otteluiden tarkat tilastot
 * kutsumalla olemassa olevaa import-liiga-match-funktiota pienissä erissä.
 *
 * Esimerkki:
 * /.netlify/functions/import-liiga-season-stats
 *   ?season=2025-2026
 *   &offset=0
 *   &limit=5
 *
 * Aja vastauksessa annettu nextUrl niin kauan, että done on true.
 */

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const CONCURRENCY = 2;

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

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : fallback;
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
        Authorization:
          `Bearer ${serviceRoleKey}`,
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
        "User-Agent": "Liiga-Elite-Batch/1.0"
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

  if (!response.ok || !data?.ok) {
    throw new Error(
      data?.error ||
      `import-liiga-match palautti tilan ${response.status}`
    );
  }

  return data;
}

async function mapWithConcurrency(
  items,
  concurrency,
  mapper
) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      results[index] =
        await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(
    concurrency,
    items.length
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker()
    )
  );

  return results;
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

  const supabaseUrl =
    process.env.SUPABASE_URL;

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

  const offset = positiveInteger(
    event.queryStringParameters?.offset,
    0
  );

  const requestedLimit = positiveInteger(
    event.queryStringParameters?.limit,
    DEFAULT_LIMIT
  );

  const limit = Math.max(
    1,
    Math.min(requestedLimit, MAX_LIMIT)
  );

  const auto =
    event.queryStringParameters?.auto === "1";

  try {
    const functionOrigin =
      getFunctionOrigin(event);

    const matchQuery =
      "liiga_matches?" +
      new URLSearchParams({
        select: "event_id,match_date",
        season: `eq.${season}`,
        order: "match_date.asc,event_id.asc",
        offset: String(offset),
        limit: String(limit)
      }).toString();

    const matches = await supabaseFetch({
      supabaseUrl,
      serviceRoleKey,
      path: matchQuery
    });

    if (matches.length === 0) {
      return jsonResponse(200, {
        ok: true,
        season,
        offset,
        processed: 0,
        succeeded: 0,
        failed: 0,
        done: true,
        message:
          "Kaikki tämän kauden otteluerät on käsitelty."
      });
    }

    const results = await mapWithConcurrency(
      matches,
      CONCURRENCY,
      async match => {
        const eventId =
          String(match.event_id);

        try {
          const imported =
            await importMatch({
              functionOrigin,
              eventId,
              season
            });

          return {
            ok: true,
            eventId,
            match:
              imported.match || null,
            saved:
              imported.saved || null
          };
        } catch (error) {
          return {
            ok: false,
            eventId,
            error:
              error instanceof Error
                ? error.message
                : String(error)
          };
        }
      }
    );

    const succeeded =
      results.filter(result => result.ok);

    const failed =
      results.filter(result => !result.ok);

    const nextOffset =
      offset + matches.length;

    const done =
      matches.length < limit;

    const nextQuery = new URLSearchParams({
      season,
      offset: String(nextOffset),
      limit: String(limit),
      ...(auto ? { auto: "1" } : {})
    });

    const nextUrl = done
      ? null
      : `${functionOrigin}/.netlify/functions/` +
        `import-liiga-season-stats?${nextQuery.toString()}`;

    const responseBody = {
      ok: failed.length === 0,
      season,
      offset,
      limit,
      processed: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      nextOffset,
      done,
      nextUrl,
      results
    };

    if (auto) {
      const failureList = failed.length
        ? `<p>Virheitä tässä erässä: ` +
          `${escapeHtml(failed.length)}. ` +
          `Tunnukset: ${escapeHtml(
            failed.map(item => item.eventId).join(", ")
          )}</p>`
        : "<p>Tämä erä onnistui kokonaan.</p>";

      const retryQuery = new URLSearchParams({
        season,
        offset: String(offset),
        limit: String(limit),
        auto: "1"
      });

      const retryUrl =
        `${functionOrigin}/.netlify/functions/` +
        `import-liiga-season-stats?${retryQuery.toString()}`;

      const continuation = failed.length
        ? `<h2>Ajo pysäytettiin virheen vuoksi</h2>` +
          `<p>Korjaa tai odota hetki ja ` +
          `<a href="${escapeHtml(retryUrl)}">yritä sama erä uudelleen</a>. ` +
          `Jo onnistuneiden otteluiden uudelleenajo on turvallista.</p>`
        : nextUrl
        ? `<p>Seuraava erä käynnistyy automaattisesti ` +
          `kahden sekunnin kuluttua.</p>` +
          `<script>` +
          `setTimeout(() => location.replace(` +
          `${JSON.stringify(nextUrl)}), 2000);` +
          `</script>`
        : "<h2>Valmis – kaikki otteluerät on käsitelty.</h2>";

      return htmlResponse(
        200,
        `<!doctype html>
<html lang="fi">
<meta charset="utf-8">
<title>Liiga Elite – tilastotuonti</title>
<style>
body{font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px}
code{background:#f3f4f6;padding:2px 6px;border-radius:4px}
</style>
<h1>Liiga Elite – tilastotuonti</h1>
<p>Kausi: <code>${escapeHtml(season)}</code></p>
<p>Käsitelty tämän ajon alkuun asti: <strong>${escapeHtml(
          nextOffset
        )}</strong> ottelua.</p>
<p>Tässä erässä onnistui ${escapeHtml(
          succeeded.length
        )}/${escapeHtml(results.length)}.</p>
${failureList}
${continuation}
</html>`
      );
    }

    return jsonResponse(200, responseBody);
  } catch (error) {
    console.error(
      "Liiga-kauden tilastotuonti epäonnistui",
      error
    );

    return jsonResponse(500, {
      ok: false,
      season,
      offset,
      limit,
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
};
