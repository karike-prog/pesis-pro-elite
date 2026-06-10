const $ = (id) => document.getElementById(id);

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString("fi-FI", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getRuns(result, side) {
  if (!result) return 0;
  const p = side === "home" ? "home" : "away";
  const d = result.details || result;
  return Number(d[`runs_${p}_first_period`] || 0) +
         Number(d[`runs_${p}_second_period`] || 0);
}

function addTeam(stats, team) {
  if (!stats[team.id]) {
    stats[team.id] = {
      id: team.id,
      name: team.shorthand || team.name,
      played: 0,
      for: 0,
      against: 0,
      homePlayed: 0,
      homeFor: 0,
      homeAgainst: 0,
      awayPlayed: 0,
      awayFor: 0,
      awayAgainst: 0,
      recent: []
    };
  }
  return stats[team.id];
}

function buildStats(matches) {
  const stats = {};

  matches
    .filter(m => m.result && m.liveResult && m.liveResult.finished)
    .forEach(m => {
      const home = addTeam(stats, m.home);
      const away = addTeam(stats, m.away);

      const homeRuns = getRuns(m.result, "home");
      const awayRuns = getRuns(m.result, "away");

      home.played++;
      home.for += homeRuns;
      home.against += awayRuns;
      home.homePlayed++;
      home.homeFor += homeRuns;
      home.homeAgainst += awayRuns;
      home.recent.push({ date: m.date, for: homeRuns, against: awayRuns });

      away.played++;
      away.for += awayRuns;
      away.against += homeRuns;
      away.awayPlayed++;
      away.awayFor += awayRuns;
      away.awayAgainst += homeRuns;
      away.recent.push({ date: m.date, for: awayRuns, against: homeRuns });
    });

  Object.values(stats).forEach(t => {
    t.recent.sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  return stats;
}

function recentAvg(team, field) {
  const games = team.recent.slice(0, 5);
  if (!games.length) return null;
  return games.reduce((sum, g) => sum + g[field], 0) / games.length;
}

function average(a, b, fallback) {
  const values = [a, b].filter(v => Number.isFinite(v) && v > 0);
  if (!values.length) return fallback;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function weatherAdjustment(weather) {
  return 0;
}
  if (!weather || weather.error) return 0;

  let adj = 0;
  const temp = Number(weather.temperature);
  const wind = Number(weather.windSpeed);
  const rain = Number(weather.precipitation);

  if (Number.isFinite(temp)) {
    if (temp >= 20) adj += 0.35;
    else if (temp <= 10) adj -= 0.35;
  }

  if (Number.isFinite(wind) && wind >= 7) adj -= 0.25;
  if (Number.isFinite(rain) && rain >= 0.5) adj -= 0.35;

  return adj;
}

function predict(homeTeam, awayTeam, stats, weather) {
  const home = stats[homeTeam.id];
  const away = stats[awayTeam.id];

  if (!home || !away) {
    return {
      homeRuns: 0,
      awayRuns: 0,
      homePct: 50,
      awayPct: 50,
      note: "Dataa liian vähän."
    };
  }

  const leagueAvg =
    Object.values(stats).reduce((sum, t) => sum + t.for, 0) /
    Math.max(1, Object.values(stats).reduce((sum, t) => sum + t.played, 0));

  const homeAttack = home.homePlayed ? home.homeFor / home.homePlayed : home.for / home.played;
  const homeDefense = home.homePlayed ? home.homeAgainst / home.homePlayed : home.against / home.played;
  const awayAttack = away.awayPlayed ? away.awayFor / away.awayPlayed : away.for / away.played;
  const awayDefense = away.awayPlayed ? away.awayAgainst / away.awayPlayed : away.against / away.played;

  let homeRuns = average(homeAttack, awayDefense, leagueAvg);
  let awayRuns = average(awayAttack, homeDefense, leagueAvg);

  const hRecentFor = recentAvg(home, "for");
  const hRecentAgainst = recentAvg(home, "against");
  const aRecentFor = recentAvg(away, "for");
  const aRecentAgainst = recentAvg(away, "against");

  if (hRecentFor !== null && aRecentAgainst !== null) {
    homeRuns = homeRuns * 0.75 + ((hRecentFor + aRecentAgainst) / 2) * 0.25;
  }

  if (aRecentFor !== null && hRecentAgainst !== null) {
    awayRuns = awayRuns * 0.75 + ((aRecentFor + hRecentAgainst) / 2) * 0.25;
  }

  homeRuns += 0.25;

  const wAdj = weatherAdjustment(weather);
  homeRuns += wAdj / 2;
  awayRuns += wAdj / 2;

  const diff = homeRuns - awayRuns;
  const homePct = Math.max(25, Math.min(75, 50 + diff * 6));

  return {
    homeRuns,
    awayRuns,
    homePct,
    awayPct: 100 - homePct,
    note: "Koti/vieras, viimeiset 5, kotietu ja sää."
  };
}

function weatherHtml(weather) {
  if (!weather || weather.error) {
    return `<div class="weather">🌦️ Sää: ei saatavilla</div>`;
  }

  const adj = weatherAdjustment(weather);
  const sign = adj > 0 ? "+" : "";

  return `
    <div class="weather">
      🌦️ FMI-sää: ${weather.temperature ?? "–"} °C,
      tuuli ${weather.windSpeed ?? "–"} m/s,
      sade ${weather.precipitation ?? "–"} mm/h<br>
      <strong>Sääkorjaus:</strong> ${sign}${adj.toFixed(2)} juoksua
    </div>
  `;
}
const FALLBACK_STADIUMS = {
  "Kyrön Sähkö Center, Pöytyä": {
    lat: 60.764,
    lng: 22.697
  }
};

async function fetchWeather(match) {
  let geometry = match.stadium?.details?.place?.geometry;

if ((!geometry?.lat || !geometry?.lng) &&
    FALLBACK_STADIUMS[match.stadium?.name]) {
  geometry = FALLBACK_STADIUMS[match.stadium.name];
}

  if (!geometry?.lat || !geometry?.lng) {
    return { error: "Ei stadionin koordinaatteja" };
  }

  const url =
    `/.netlify/functions/weather?lat=${geometry.lat}&lon=${geometry.lng}&time=${encodeURIComponent(match.date)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { error: "Säähaku epäonnistui" };
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

function renderPowerTable(stats) {
  const rows = Object.values(stats)
    .filter(t => t.played > 0)
    .sort((a, b) => {
      const an = a.for / a.played - a.against / a.played;
      const bn = b.for / b.played - b.against / b.played;
      return bn - an;
    })
    .map(t => {
      const f = t.for / t.played;
      const a = t.against / t.played;
      const rf = recentAvg(t, "for");
      const ra = recentAvg(t, "against");

      return `
        <tr>
          <td><strong>${t.name}</strong></td>
          <td>${t.played}</td>
          <td>${f.toFixed(2)}</td>
          <td>${a.toFixed(2)}</td>
          <td>${(f - a).toFixed(2)}</td>
          <td>${rf === null ? "–" : rf.toFixed(2)}</td>
          <td>${ra === null ? "–" : ra.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  $("power").innerHTML = rows;
}

async function renderMatches(matches, stats) {
  if (!matches.length) {
    $("matches").innerHTML = "<p>Otteluita ei löytynyt valitulle päivälle.</p>";
    return;
  }

  $("matches").innerHTML = "<p>Haetaan säätietoja...</p>";

  const cards = [];

  for (const match of matches) {
    const weather = await fetchWeather(match);
    const prediction = predict(match.home, match.away, stats, weather);

    const homeFav = prediction.homePct >= prediction.awayPct;
    const total = prediction.homeRuns + prediction.awayRuns;
    const confidence = Math.abs(prediction.homePct - 50);

    let tag = "Tasainen";
    let tagClass = "orange";

    if (confidence >= 15) {
      tag = "Vahva suosikki";
      tagClass = "green";
    } else if (confidence >= 8) {
      tag = "Pieni suosikki";
      tagClass = "blue";
    }

    cards.push(`
      <div class="match">
        <div class="top">
          <div>${fmtDate(match.date)}</div>
          <div>${match.stadium?.name || ""}</div>
        </div>

        <div class="teams">
          <div class="team">
            <div class="name">${match.home.shorthand || match.home.name}</div>
            <div class="pct ${homeFav ? "fav" : ""}">${prediction.homePct.toFixed(0)} %</div>
          </div>

          <div class="vs">vs</div>

          <div class="team">
            <div class="name">${match.away.shorthand || match.away.name}</div>
            <div class="pct ${!homeFav ? "fav" : ""}">${prediction.awayPct.toFixed(0)} %</div>
          </div>
        </div>

        <div class="runs">
          Juoksuarvio: ${prediction.homeRuns.toFixed(1)} – ${prediction.awayRuns.toFixed(1)}
        </div>

        <span class="pill ${tagClass}">${tag}</span>
        <span class="pill blue">Total ${total.toFixed(1)}</span>
        <span class="pill orange">ID ${match.id}</span>

        ${weatherHtml(weather)}

        <div class="reason">${prediction.note}</div>
      </div>
    `);
  }

  $("matches").innerHTML = cards.join("");
}

async function load() {
  const [level, series] = $("series").value.split("|");
  const selectedDate = $("date").value || today();

  $("status").textContent = `Ladataan ${level} ${series}...`;

  try {
    const res = await fetch(
      `/.netlify/functions/matches?level=${encodeURIComponent(level)}&series=${encodeURIComponent(series)}`
    );

    const json = await res.json();
    const matches = Array.isArray(json.data) ? json.data : [];

    const stats = buildStats(matches);

    let dayMatches = matches.filter(m => (m.date || "").slice(0, 10) === selectedDate);

    if (!dayMatches.length) {
      const now = new Date();
      dayMatches = matches
        .filter(m => new Date(m.date) >= now && !m.result)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 8);
    }

    $("mc").textContent = matches.length;
    $("tc").textContent = Object.keys(stats).length;
    $("dc").textContent = dayMatches.length;

    renderPowerTable(stats);
    await renderMatches(dayMatches, stats);

    $("status").textContent = `Päivitetty ${new Date().toLocaleTimeString("fi-FI")}`;
  } catch (e) {
    console.error(e);
    $("status").textContent = "Datan haku epäonnistui. Tarkista Netlify Functions.";
  }
}

$("date").value = today();
$("btn").onclick = load;
$("series").onchange = load;
$("date").onchange = load;

load();
