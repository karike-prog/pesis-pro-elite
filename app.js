const $ = (id) => document.getElementById(id);

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TEAM_LOGOS = {
  "AA": "images/logos/aa.png",
  "HP": "images/logos/hp.png",
  "Tahko": "images/logos/tahko.png",
  "IPV": "images/logos/ipv.png",
  "JoMa": "images/logos/joma.png",
  "KeKi": "images/logos/keki.png",
  "KPL": "images/logos/kpl.png",
  "KoU": "images/logos/kou.png",
  "Manse": "images/logos/manse.png",
  "PattU": "images/logos/pattu.png",
  "SoJy": "images/logos/sojy.png",
  "KiPa": "images/logos/kipa.png",
  "ViVe": "images/logos/veto.png",

  "Jussittaret": "images/logos/jussittaret.png",
  "JoMa N": "images/logos/joma_n.png",
  "Manse N": "images/logos/manse_n.png",
  "Pesäkarhut": "images/logos/pesakarhut.png",
  "Virkiä": "images/logos/virkia.png",
  "Kirittäret": "images/logos/kirittaret.png",
  "Lippo Naiset": "images/logos/lippo.png",
  "PöU Pesis": "images/logos/poytya.png",
  "Roihuttaret": "images/logos/roihu.png",
  "Fera": "images/logos/fera.png",
  "Jyske": "images/logos/jyske.png",
  "Mailattaret": "images/logos/mailattaret.png",

  "KaMa": "images/logos/kama.png",
  "Jkl Kiri": "images/logos/kiri.png",
  "NJ": "images/logos/nj.png",
  "PuMu": "images/logos/pumu.png",
  "PuPe": "images/logos/pupe.png",
  "SiKi": "images/logos/siki.png",
  "SMJ": "images/logos/smj.png",
  "UPV": "images/logos/upv.png",
  "Ura": "images/logos/ura.png",
  "SiiPe": "images/logos/siipe.png"
};

const FIRST_CATCHERS = {
  "AA": "Seeti Surakka",
  "Tahko": "Petteri Alanen",
  "JoMa": "Ukko Schroderus",
  "KeKi": "Topi Still",
  "KiPa": "Joona Lehtinen",
  "KoU": "Aku Kettunen",
  "KPL": "Elias Pitkänen",
  "Manse": "Juha Puhtimäki",
  "PattU": "Topi Kosonen",
  "SoJy": "Aapo Komulainen",
  "ViVe": "Ville Soini",

  "Jussittaret": "",
  "JoMa N": "",
  "Manse N": "",
  "Pesäkarhut": "",
  "Virkiä": "",
  "Kirittäret": "",
  "Lippo Naiset": "",
  "Roihuttaret": "",
  "Fera": "",
  "Mailattaret": "",
  "PöU Pesis": "",
  "Jyske": ""
};

const FALLBACK_STADIUMS = {
  "Kyrön Sähkö Center, Pöytyä": { lat: 60.764, lng: 22.697 },
  "K Power Stadion, Lapua": { lat: 62.970, lng: 23.009 },
  "Hehku Areena, Nurmo (Seinäjoki)": { lat: 62.870, lng: 22.883 },
  "Pihkalan pesäpallostadion, Hyvinkää": { lat: 60.635, lng: 24.859 },
  "Hietalahden Pesäpallostadion, Vaasa": { lat: 63.094, lng: 21.604 },
  "Osuma Arena, Kuopio": { lat: 62.893, lng: 27.677 },
  "Unico Arena, Seinäjoki": { lat: 62.792, lng: 22.841 },
  "Saltex Arena, Alajärvi": { lat: 63.001, lng: 23.816 },
  "KSS Energia Areena, Kouvola": { lat: 60.868, lng: 26.704 },
  "Rantakenttä, Kitee": { lat: 62.101, lng: 30.138 },
  "Huikoo Areena, Pori": { lat: 61.485, lng: 21.797 },
  "Saarikenttä, Vimpeli": { lat: 63.1605, lng: 23.8220 },
  "Mantun kenttä, Siilinjärvi": { lat: 63.076, lng: 27.661 }
};

const PLAYER_STATS_CACHE = {};

function fmtDate(iso) {
  return new Date(iso).toLocaleString("fi-FI", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderOfficialStandings(rows, targetId) {
  const target = $(targetId);
  if (!target) return;

  target.innerHTML = rows.map((row, i) => {
    const logo = TEAM_LOGOS[row.team] || "images/logos/default.png";

    return `
      <tr>
        <td>${i + 1}.</td>
        <td class="teamCell">
          <img src="${logo}" class="standings-logo" alt="${row.team}">
          <strong>${row.team}</strong>
        </td>
        <td>${row.o}</td>
        <td>${row.v}</td>
        <td>${row.h}</td>
        <td><strong>${row.p}</strong></td>
        <td>${row.jaksoFor}-${row.jaksoAgainst}</td>
        <td>${row.runsFor}-${row.runsAgainst}</td>
      </tr>
    `;
  }).join("");
}

let currentMenMatches = [];
let currentWomenMatches = [];
let currentStandingsMode = "all";

function showStandings(mode) {
  currentStandingsMode = mode;

  const men = buildStandings(currentMenMatches, mode);
  const women = buildStandings(currentWomenMatches, mode);

  renderOfficialStandings(men, "standings-men");
  renderOfficialStandings(men, "standings-men-mobile");

  renderOfficialStandings(women, "standings-women");
  renderOfficialStandings(women, "standings-women-mobile");
}


function getRuns(result, side) {
  if (!result) return 0;

  const d = result.details || result;

  const first = Number(d[`runs_${side}_first_period`] || 0);
  const second = Number(d[`runs_${side}_second_period`] || 0);
  const contest = Number(d[`runs_${side}_scoring_contest`] || 0);
  const superInning = Number(d[`runs_${side}_super_inning`] || 0);

  return first + second + contest + superInning;
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

      const d = m.result.details || {};
      const hp = Number(d.periods_home || 0);
      const ap = Number(d.periods_away || 0);

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

      if (hp > ap) {
        home.homeWins = (home.homeWins || 0) + 1;
      }

      if (ap > hp) {
        away.awayWins = (away.awayWins || 0) + 1;
      }
    });

  Object.values(stats).forEach(t => {
    t.recent.sort((a, b) => new Date(b.date) - new Date(a.date));

    t.homeAttack =
      t.homePlayed ? t.homeFor / t.homePlayed : t.for / Math.max(1, t.played);

    t.homeDefense =
      t.homePlayed ? t.homeAgainst / t.homePlayed : t.against / Math.max(1, t.played);

    t.awayAttack =
      t.awayPlayed ? t.awayFor / t.awayPlayed : t.for / Math.max(1, t.played);

    t.awayDefense =
      t.awayPlayed ? t.awayAgainst / t.awayPlayed : t.against / Math.max(1, t.played);

    t.homeWinPct =
      t.homePlayed ? (t.homeWins || 0) / t.homePlayed : 0.5;

    t.awayWinPct =
      t.awayPlayed ? (t.awayWins || 0) / t.awayPlayed : 0.5;
  });

  return stats;
}

function buildStandings(matches, mode = "all") {
  const table = {};

  function ensure(team) {
    const name = team.shorthand || team.name;

    if (!table[team.id]) {
      table[team.id] = {
        team: name,
        o: 0,
        v: 0,
        h: 0,
        p: 0,
        jaksoFor: 0,
        jaksoAgainst: 0,
        runsFor: 0,
        runsAgainst: 0
      };
    }

    return table[team.id];
  }

matches
  .filter(m => m.result)
  .forEach(m => {
const d = m.result.details || m.result;

const hp = Number(d.periods_home || 0);
const ap = Number(d.periods_away || 0);

const hr = getRuns(m.result, "home");
const ar = getRuns(m.result, "away");

      if (!Number.isFinite(hr) || !Number.isFinite(ar)) return;

      const includeHome = mode === "all" || mode === "home";
      const includeAway = mode === "all" || mode === "away";

      if (includeHome) {
        const home = ensure(m.home);

        home.o++;
        home.jaksoFor += hp;
        home.jaksoAgainst += ap;
        home.runsFor += hr;
        home.runsAgainst += ar;

        if (hp > ap) {
          home.v++;
          home.p += hp === 2 && ap === 0 ? 3 : 2;
        } else if (ap > hp) {
          home.h++;
          home.p += hp === 1 ? 1 : 0;
        }
      }

      if (includeAway) {
        const away = ensure(m.away);

        away.o++;
        away.jaksoFor += ap;
        away.jaksoAgainst += hp;
        away.runsFor += ar;
        away.runsAgainst += hr;

        if (ap > hp) {
          away.v++;
          away.p += ap === 2 && hp === 0 ? 3 : 2;
        } else if (hp > ap) {
          away.h++;
          away.p += ap === 1 ? 1 : 0;
        }
      }
    });

  return Object.values(table).sort((a, b) => {
    if (b.p !== a.p) return b.p - a.p;
    if (b.v !== a.v) return b.v - a.v;
    if ((b.runsFor - b.runsAgainst) !== (a.runsFor - a.runsAgainst)) {
      return (b.runsFor - b.runsAgainst) - (a.runsFor - a.runsAgainst);
    }
    return a.team.localeCompare(b.team);
  });
}
function recentAvg(team, field) {
  const games = [...team.recent]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (!games.length) return null;

  return games.reduce((sum, g) => sum + g[field], 0) / games.length;
}

function average(a, b, fallback) {
  const values = [a, b].filter(v => Number.isFinite(v) && v > 0);
  if (!values.length) return fallback;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function predict(homeTeam, awayTeam, stats) {
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

 const HOME_AWAY_WEIGHT = 0.20;
const BASE_WEIGHT = 0.80;

const homeAttackBase = home.for / home.played;
const homeDefenseBase = home.against / home.played;
const awayAttackBase = away.for / away.played;
const awayDefenseBase = away.against / away.played;

const homeAttackField = home.homePlayed
  ? home.homeFor / home.homePlayed
  : homeAttackBase;

const homeDefenseField = home.homePlayed
  ? home.homeAgainst / home.homePlayed
  : homeDefenseBase;

const awayAttackField = away.awayPlayed
  ? away.awayFor / away.awayPlayed
  : awayAttackBase;

const awayDefenseField = away.awayPlayed
  ? away.awayAgainst / away.awayPlayed
  : awayDefenseBase;

const homeAttack =
  homeAttackBase * BASE_WEIGHT + homeAttackField * HOME_AWAY_WEIGHT;

const homeDefense =
  homeDefenseBase * BASE_WEIGHT + homeDefenseField * HOME_AWAY_WEIGHT;

const awayAttack =
  awayAttackBase * BASE_WEIGHT + awayAttackField * HOME_AWAY_WEIGHT;

const awayDefense =
  awayDefenseBase * BASE_WEIGHT + awayDefenseField * HOME_AWAY_WEIGHT;

let homeRuns = average(homeAttack, awayDefense, leagueAvg);
let awayRuns = average(awayAttack, homeDefense, leagueAvg);

const fieldWinDiff = (home.homeWinPct || 0.5) - (away.awayWinPct || 0.5);
const fieldWinAdj = Math.max(-0.3, Math.min(0.3, fieldWinDiff * 0.6));

homeRuns += fieldWinAdj;
awayRuns -= fieldWinAdj;

  const hRecentFor = recentAvg(home, "for");
  const hRecentAgainst = recentAvg(home, "against");
  const aRecentFor = recentAvg(away, "for");
  const aRecentAgainst = recentAvg(away, "against");

  if (hRecentFor !== null && aRecentAgainst !== null) {
    homeRuns = homeRuns * 0.60 + ((hRecentFor + aRecentAgainst) / 2) * 0.40;
  }

  if (aRecentFor !== null && hRecentAgainst !== null) {
    awayRuns = awayRuns * 0.60 + ((aRecentFor + hRecentAgainst) / 2) * 0.40;
  }

  homeRuns += 0.25;

  const diff = homeRuns - awayRuns;
  const homePct = Math.max(25, Math.min(75, 50 + diff * 6));

  return {
    homeRuns,
    awayRuns,
    homePct,
    awayPct: 100 - homePct,
    note: ""
  };
}

function shootoutProbability(prediction) {
  const diff = Math.abs(prediction.homePct - prediction.awayPct);
  const total = prediction.homeRuns + prediction.awayRuns;

  let p = 18;

  if (diff <= 4) p += 12;
  else if (diff <= 8) p += 9;
  else if (diff <= 14) p += 6;
  else if (diff <= 22) p += 3;
  else p -= 3;

  if (total < 9) p += 6;
  else if (total < 11) p += 4;
  else if (total < 13) p += 2;
  else p -= 2;

  return Math.round(Math.max(8, Math.min(42, p)));
}

function getWeatherAdjustment(weather) {
  console.log("getWeatherAdjustment", weather);
  if (!weather) return 0;

const temp = Number(String(weather.gameTemp ?? weather.temperature ?? 0).replace(",", "."));
const wind = Number(String(weather.gameWind ?? weather.wind ?? 0).replace(",", "."));
const rain = Number(String(weather.gameRain ?? weather.rain ?? 0).replace(",", "."));

  let adj = 0;

  // lämpötila
 // lämpötila

if (temp >= 24) adj += 0.2;
else if (temp < 6) adj -= 1.5;
else if (temp < 9) adj -= 1.0;
else if (temp < 12) adj -= 0.7;
else if (temp < 15) adj -= 0.4;
else if (temp < 17) adj -= 0.2;

  // sade
  if (rain >= 1.0) adj -= 0.5;
  else if (rain >= 0.3) adj -= 0.2;

  // tuuli
  if (wind >= 8) adj -= 0.4;
  else if (wind >= 6) adj -= 0.2;

  return Math.round(adj * 10) / 10;
}

function weatherHtml(weather) {
  if (!weather || weather.error) {
    return `<div class="weather">🌦️ Sää: ei saatavilla</div>`;
  }

  const now = weather.now || weather;
  const start = weather.start || weather;

  return `
    <div class="weather">
      <strong>🌦️ Sää nyt:</strong>
      ${now.temperature ?? "-"} °C,
      tuuli ${now.windSpeed ?? "-"} m/s,
      sade ${now.precipitation ?? "-"} mm/h
      <br>
      <strong>⏱️ Sää pelin alkaessa:</strong>
      ${start.temperature ?? "-"} °C,
      tuuli ${start.windSpeed ?? "-"} m/s,
      sade ${start.precipitation ?? "-"} mm/h
    </div>
  `;
}

async function fetchWeather(match) {
  let geometry = match.stadium?.details?.place?.geometry;
  const stadiumName = match.stadium?.name?.trim();

  if ((!geometry?.lat || !geometry?.lng) && FALLBACK_STADIUMS[stadiumName]) {
    geometry = FALLBACK_STADIUMS[stadiumName];
  }

  if (!geometry?.lat || !geometry?.lng) {
    return { error: "Ei stadionin koordinaatteja" };
  }

  const startUrl =
    `/.netlify/functions/weather?lat=${geometry.lat}&lon=${geometry.lng}&time=${encodeURIComponent(match.date)}`;

  const nowUrl =
    `/.netlify/functions/weather?lat=${geometry.lat}&lon=${geometry.lng}&time=${encodeURIComponent(new Date().toISOString())}`;

  try {
    const startRes = await fetch(startUrl);
    const nowRes = await fetch(nowUrl);

    if (!startRes.ok || !nowRes.ok) {
      return { error: "Säähaku epäonnistui" };
    }

    return {
      start: await startRes.json(),
      now: await nowRes.json()
    };
  } catch (e) {
    return { error: e.message };
  }
}

function buildPlayerRatings(players) {
  return players.map(p => {
    const lyodyt = Number(p.scorings || 0);
    const kotiutukset = Number(p.batadv_succeeded || 0);
    const karkilyonnit = Number(p.batpe_succeeded_3 || 0);
    const onnistumisPct = Number(p.batadv_percent || 0);
    const ottelut = Number(p.matches || 1);

    const eliteRating =
      lyodyt * 1.4 +
      kotiutukset * 0.35 +
      karkilyonnit * 0.25 +
      onnistumisPct * 20 +
      Math.min(ottelut, 20) * 0.5;

    return { ...p, eliteRating };
  });
}

function buildTeamPlayerRatings(players) {
  const teams = {};

  players.forEach(p => {
    const ids = p.team_ids || [];
    ids.forEach(teamId => {
      if (!teams[teamId]) teams[teamId] = [];
      teams[teamId].push(p);
    });
  });

  const result = {};

  Object.keys(teams).forEach(teamId => {
    const top5 = teams[teamId]
      .sort((a, b) => b.eliteRating - a.eliteRating)
      .slice(0, 5);

    const totalRating = top5.reduce(
      (sum, p) => sum + (Number(p.eliteRating) || 0),
      0
    );

    result[teamId] = { top5, totalRating };
  });

  return result;
}

async function fetchPlayerStats(series) {
  const cacheKey = series || "all";
  if (PLAYER_STATS_CACHE[cacheKey]) return PLAYER_STATS_CACHE[cacheKey];

  try {
    const res = await fetch(`/.netlify/functions/player-stats?series=${encodeURIComponent(series || "")}`);

    if (!res.ok) {
      console.log("PLAYER STATS EI OK:", res.status);
      PLAYER_STATS_CACHE[cacheKey] = { players: [], teams: {} };
      return PLAYER_STATS_CACHE[cacheKey];
    }

    const json = await res.json();
    const players = Array.isArray(json.data) ? json.data : [];

    const ratedPlayers = buildPlayerRatings(players);
    const teamPlayerRatings = buildTeamPlayerRatings(ratedPlayers);

    PLAYER_STATS_CACHE[cacheKey] = {
      players: ratedPlayers,
      teams: teamPlayerRatings
    };

    return PLAYER_STATS_CACHE[cacheKey];
  } catch (e) {
    console.log("PLAYER STATS VIRHE:", e);
    PLAYER_STATS_CACHE[cacheKey] = { players: [], teams: {} };
    return PLAYER_STATS_CACHE[cacheKey];
  }
}

async function fetchLineup(match) {
  try {
    const url = `/.netlify/functions/lineup?id=${match.id}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    return await res.json();
  } catch (e) {
    console.log("LINEUP VIRHE:", e);
    return null;
  }
}

function lineupHtml(lineup) {
  const data = lineup?.data || lineup?.match || lineup;

  const homePlayers = data?.home?.players || [];
  const awayPlayers = data?.away?.players || [];

  if (!homePlayers.length || !awayPlayers.length) {
    return `<div class="lineup">📋 Kokoonpanot eivät vielä saatavilla</div>`;
  }

  const playerRows = (players) =>
    players.map(p => `<div>${p.number}. ${p.name}</div>`).join("");

  return `
    <div class="lineup">
      <strong>📋 Kokoonpanot</strong>
      <div class="lineup-grid">
        <div>
          <b>${data.home.shorthand}</b>
          ${playerRows(homePlayers)}
        </div>
        <div>
          <b>${data.away.shorthand}</b>
          ${playerRows(awayPlayers)}
        </div>
      </div>
    </div>
  `;
}

const KEY_PITCHERS_MEN = {
  "AA": ["Seeti Surakka"],
  "Tahko": ["Petteri Alanen"],
  "JoMa": ["Ukko Schroderus"],
  "KiPa": ["Rasmus Surakka"],
  "KPL": ["Elias Pitkänen"],
  "Manse": ["Aapo Komulainen"],
  "PattU": ["Topi Still"],
  "SoJy": ["Elmeri Iivonen"],
  "ViVe": ["Ville Soini"]
};

const KEY_PITCHERS_WOMEN = {
  
  "Kirittäret": ["Ronja Salmela"],
  "Virkiä": ["Anni Heikkilä"],
  "Pesäkarhut": ["Minttu Vettenranta"],
  "PöU Pesis": ["Lydia Eskola"],
  "Roihuttaret": ["Erica Rosendahl"],
  "Mailattaret": ["Marianne Sivonen"],
  "Lippo Naiset": ["Venla Ronkainen"],
  "Jyske": ["Emilia Hannuksela"],
};

function keyPitcherAbsenceAdjustment(match, lineup, selectedSeries) {
  const data = lineup?.data || lineup?.match || lineup;
  const homePlayers = data?.home?.players || [];
  const awayPlayers = data?.away?.players || [];

  if (!homePlayers.length || !awayPlayers.length) {
    return { homeRuns: 0, awayRuns: 0, note: "" };
  }

  const homeName = match.home.shorthand || match.home.name;
  const awayName = match.away.shorthand || match.away.name;

  const homeNames = homePlayers.map(p => p.name);
  const awayNames = awayPlayers.map(p => p.name);

  let homeRuns = 0;
  let awayRuns = 0;
  const notes = [];

  const pitchers = selectedSeries === "Miehet"
  ? KEY_PITCHERS_MEN
  : KEY_PITCHERS_WOMEN;
  
  if (pitchers[homeName]?.some(name => !homeNames.includes(name))) {
    awayRuns += 0.7;
    notes.push(`${homeName}: ykköslukkari puuttuu`);
  }

  if (pitchers[awayName]?.some(name => !awayNames.includes(name))) {
    homeRuns += 0.7;
    notes.push(`${awayName}: ykköslukkari puuttuu`);
  }

  return {
    homeRuns,
    awayRuns,
    note: notes.join("<br>")
  };
}

const TOP20_LYOJAT = [
  { name: "Juho Toivola", team: "JoMa", series: "Miehet" },
  { name: "Jukka-Pekka Vainionpää", team: "Manse", series: "Miehet" },
  { name: "Perttu Ruuska", team: "Manse", series: "Miehet" },
  { name: "Henri Puputti", team: "ViVe", series: "Miehet" },
  { name: "Patrik Wahlsten", team: "KPL", series: "Miehet" },
  { name: "Roope Korhonen", team: "SoJy", series: "Miehet" },
  { name: "Martti Viitasalo", team: "PattU", series: "Miehet" },
  { name: "Matias Rinta-aho", team: "ViVe", series: "Miehet" },
  { name: "Rasmus Teppo", team: "KoU", series: "Miehet" },
  { name: "Ville-Veikko Olli", team: "IPV", series: "Miehet" },

  { name: "Aino-Kaisa Mantere", team: "Jussittaret", series: "Naiset" },
  { name: "Janette Lepistö", team: "Virkiä", series: "Naiset" },
  { name: "Siri Eskola", team: "Manse", series: "Naiset" },
  { name: "Nelli Huotari", team: "JoMa", series: "Naiset" },
  { name: "Maija Vastamäki", team: "Manse", series: "Naiset" },
  { name: "Taru Toikka", team: "Pesäkarhut", series: "Naiset" },
  { name: "Maria Kaakinen", team: "JoMa", series: "Naiset" },
  { name: "Lotta Nummikari", team: "Pesäkarhut", series: "Naiset" },
  { name: "Hanna Toivanen", team: "JoMa", series: "Naiset" },
  { name: "Anna Ala-Kauhaluoma", team: "Manse", series: "Naiset" },
];

function getLineupAdjustment(match, lineup) {
  if (!lineup) {
    return { homeRuns: 0, awayRuns: 0, applied: false };
  }

  const data = lineup?.data || lineup?.match || lineup;
  const homePlayers = data?.home?.players || [];
  const awayPlayers = data?.away?.players || [];

  if (!homePlayers.length || !awayPlayers.length) {
    return { homeRuns: 0, awayRuns: 0, applied: false };
  }

  return {
    homeRuns: 0,
    awayRuns: 0,
    applied: false
  };
}

function lineupWarningsHtml(match, lineup, selectedSeries) {
  const data = lineup?.data || lineup?.match || lineup;
  const homePlayers = data?.home?.players || [];
  const awayPlayers = data?.away?.players || [];

  if (!homePlayers.length || !awayPlayers.length) return "";

  const homeName = match.home.shorthand || match.home.name;
  const awayName = match.away.shorthand || match.away.name;

  const homeLineupNames = homePlayers.map(p => p.name);
  const awayLineupNames = awayPlayers.map(p => p.name);

  const warnings = [];

  TOP20_LYOJAT.forEach(player => {
    if (player.series !== selectedSeries) return;

    if (player.team === homeName && !homeLineupNames.includes(player.name)) {
      warnings.push(`👤 ${player.name} (${player.team}) poissa kokoonpanosta`);
    }

    if (player.team === awayName && !awayLineupNames.includes(player.name)) {
      warnings.push(`👤 ${player.name} (${player.team}) poissa kokoonpanosta`);
    }
  });

  const pitchers = selectedSeries === "Miehet"
    ? KEY_PITCHERS_MEN
    : KEY_PITCHERS_WOMEN;

  if (pitchers[homeName]?.some(name => !homeLineupNames.includes(name))) {
    warnings.push(`🥎 ${homeName}: ykköslukkari puuttuu`);
  }

  if (pitchers[awayName]?.some(name => !awayLineupNames.includes(name))) {
    warnings.push(`🥎 ${awayName}: ykköslukkari puuttuu`);
  }

  if (!warnings.length) return "";

  return `
    <div class="lineupWarnings">
      <div class="warningTitle">⚠️ Kokoonpanohuomiot</div>
      ${warnings.map(w => `<div class="warningItem">${w}</div>`).join("")}
    </div>
  `;
}

function sumRuns(arr) {
  return (arr || []).reduce((s, v) => s + (Number(v) || 0), 0);
}

function teamShortName(team) {
  return team?.shorthand || team?.name || "";
}

function liveScoreboardHtml(match, lr) {
  const p1 = lr.runs?.[0] || { home: [], away: [] };
  const p2 = lr.runs?.[1] || { home: [], away: [] };
  const kotiutuskisa = lr.runs?.[2] || null;

  const fill = (arr) =>
    Array.from({ length: 4 }, (_, i) => arr?.[i] ?? "–");

  const p1Home = fill(p1.home);
  const p1Away = fill(p1.away);
  const p2Home = fill(p2.home);
  const p2Away = fill(p2.away);

  const homeP1 = sumRuns(p1.home);
  const awayP1 = sumRuns(p1.away);
  const homeP2 = sumRuns(p2.home);
  const awayP2 = sumRuns(p2.away);

  const kotiHome = kotiutuskisa
    ? sumRuns(kotiutuskisa.home)
    : null;

  const kotiAway = kotiutuskisa
    ? sumRuns(kotiutuskisa.away)
    : null;

  const home = teamShortName(match.home);
  const away = teamShortName(match.away);

  return `
    <div class="inningsCompact">
      <div class="periodTitle period1">1. jakso</div>
      <div class="periodTitle period2">2. jakso</div>

      <div class="teamCell"></div>
      <div class="headCell">1</div>
      <div class="headCell">2</div>
      <div class="headCell">3</div>
      <div class="headCell">4</div>
      <div class="headCell total">Y</div>

      <div class="headCell">1</div>
      <div class="headCell">2</div>
      <div class="headCell">3</div>
      <div class="headCell">4</div>
      <div class="headCell total">Y</div>

      <div class="teamCell">${home}</div>
      ${p1Home.map(v => `<div>${v}</div>`).join("")}
      <div class="total">${homeP1}</div>
      ${p2Home.map(v => `<div>${v}</div>`).join("")}
      <div class="total">${homeP2}</div>

      <div class="teamCell">${away}</div>
      ${p1Away.map(v => `<div>${v}</div>`).join("")}
      <div class="total">${awayP1}</div>
      ${p2Away.map(v => `<div>${v}</div>`).join("")}
      <div class="total">${awayP2}</div>
    </div>

    ${
      kotiutuskisa
        ? `
          <div class="shootoutLive">
            <strong>Kotiutuskisa:</strong>
            ${home} ${kotiHome}–${kotiAway} ${away}
          </div>
        `
        : ""
    }
  `;
}

function resultHtml(match, prediction) {
  if (!match.result && match.liveResult && !match.liveResult.finished) {
    return `
      <div class="resultBox live">
        ${liveScoreboardHtml(match, match.liveResult)}
      </div>
    `;
  }

  if (!match.result) return "";

  const r = match.result;
  const d = r.details || r;

  const homeWon = Number(d.periods_home) > Number(d.periods_away);
  const awayWon = Number(d.periods_away) > Number(d.periods_home);
  const elitePickedHome = prediction.homePct > prediction.awayPct;

  const eliteHit =
    (elitePickedHome && homeWon) ||
    (!elitePickedHome && awayWon);

  return `
    <div class="resultBox ${eliteHit ? "hit" : "miss"}">
      <div><strong>🏁 Lopputulos</strong></div>
      <div><strong>${match.home.shorthand} – ${match.away.shorthand} ${r.result_string}</strong></div>

      <div style="margin-top:6px;">
        ${eliteHit ? "✅ Elite osui" : "❌ Elite yllättyi"}
      </div>

      <div style="margin-top:6px;">
        1. jakso: ${d.runs_home_first_period}–${d.runs_away_first_period}
      </div>

      <div>
        2. jakso: ${d.runs_home_second_period}–${d.runs_away_second_period}
      </div>

      ${
        !d.super_inning_is_not_played
          ? `<div>Kotiutuskisa: ${d.runs_home_super_inning}–${d.runs_away_super_inning}</div>`
          : ""
      }
    </div>
  `;
}

function renderPowerTable(stats, targetId) {
  const target = $(targetId);
  if (!target) return;

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

      return `
        <tr>
          <td>${t.name}</td>
          <td>${t.played}</td>
          <td>${f.toFixed(2)}</td>
          <td>${a.toFixed(2)}</td>
          <td>${(f - a).toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  target.innerHTML = rows;
}

function normalizeTeamKey(name) {
  return (name || "")
    .toLowerCase()
    .replace("jyväskylän ", "")
    .replace("joensuun maila", "joma")
    .replace("fera, rauma", "fera")
    .replace("laitilan jyske", "jyske")
    .replace("oulun lippo", "lippo naiset")
    .replace("pöytyän urheilijat", "pöu pesis")
    .replace("seinäjoen maila-jussit", "jussittaret")
    .replace("lapuan virkiä", "virkiä")
    .trim();
}

function getTeamPlayerPower(team, playerStats) {
  if (!playerStats) return 0;

  const idsToTry = [
    team.id,
    team.sport_club_id,
    team.sport_club?.id
  ]
    .filter(Boolean)
    .map(String);

  for (const id of idsToTry) {
    if (playerStats.teams?.[id]?.totalRating) {
      return playerStats.teams[id].totalRating;
    }
  }

  return 0;
}
const lockedPredictions = {};
let liveRefreshTimer = null;

async function renderMatches(matches, allMatches, selectedSeries, targetId, cardClass, playerStats) {
  if (!matches.length) {
    $(targetId).innerHTML = "<p>Otteluita ei löytynyt valitulle päivälle.</p>";
    return;
  }

  $(targetId).innerHTML = "<p>Haetaan säätietoja...</p>";

  const cards = [];

  for (const match of matches) {
    // Ennusteessa käytetään vain ennen tämän ottelun alkua
    // päättyneitä otteluita. Näin prosentit eivät muutu jälkikäteen.
    const matchStart = new Date(match.date).getTime();

    const matchesBeforeThisGame = allMatches.filter(m => {
      const previousMatchTime = new Date(m.date).getTime();

    return (
  m.id !== match.id &&
  Number.isFinite(previousMatchTime) &&
  previousMatchTime < matchStart &&
  Boolean(m.result)
);
    });

    const stats = buildStats(matchesBeforeThisGame);
    const weather = await fetchWeather(match);
    const lineup = await fetchLineup(match);
    const lineupAdjustment = getLineupAdjustment(match, lineup);
    const pitcherAdj = keyPitcherAbsenceAdjustment(match, lineup, selectedSeries);
    const prediction = predict(match.home, match.away, stats);

    prediction.homeRuns += lineupAdjustment.homeRuns;
    prediction.awayRuns += lineupAdjustment.awayRuns;
    prediction.homeRuns += pitcherAdj.homeRuns;
    prediction.awayRuns += pitcherAdj.awayRuns;
    prediction.lineupAdjusted = lineupAdjustment.applied;

    const weatherAdj = getWeatherAdjustment(weather.start || weather);
    prediction.homeRuns += weatherAdj / 2;
    prediction.awayRuns += weatherAdj / 2;

    prediction.homeRuns = Math.max(0, prediction.homeRuns);
    prediction.awayRuns = Math.max(0, prediction.awayRuns);
    lockedPredictions[match.id] = {
  ...prediction
};

    const homePlayerPower = getTeamPlayerPower(match.home, playerStats);
    const awayPlayerPower = getTeamPlayerPower(match.away, playerStats);
    const playerPowerDiff = homePlayerPower - awayPlayerPower;

    const total = prediction.homeRuns + prediction.awayRuns;
    const shootoutPct = shootoutProbability(prediction);

    const homeFav = prediction.homePct >= prediction.awayPct;
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

    const homeName = match.home.shorthand || match.home.name;
    const awayName = match.away.shorthand || match.away.name;

    const homeLogo = TEAM_LOGOS[homeName] || "images/logos/default.png";
    const awayLogo = TEAM_LOGOS[awayName] || "images/logos/default.png";

    const playerPowerHtml = "";

    cards.push(`
      <div class="match ${cardClass}">
        <div class="top">
          <div>${fmtDate(match.date)}</div>
          <div>${match.stadium?.name || ""}</div>
        </div>

        <div class="teams">
          <div class="team">
            <div class="name">
              <img src="${homeLogo}" class="team-logo" alt="${homeName}">
              <span>${homeName}</span>
            </div>
            <div class="pct ${homeFav ? "fav" : ""}">${prediction.homePct.toFixed(0)} %</div>
          </div>

          <div class="vs">vs</div>

          <div class="team">
            <div class="name">
              <img src="${awayLogo}" class="team-logo" alt="${awayName}">
              <span>${awayName}</span>
            </div>
            <div class="pct ${!homeFav ? "fav" : ""}">${prediction.awayPct.toFixed(0)} %</div>
          </div>
        </div>

        <div class="runs">
          Juoksuarvio: ${prediction.homeRuns.toFixed(1)} – ${prediction.awayRuns.toFixed(1)}
        </div>

        <span class="pill ${tagClass}">${tag}</span>
        <span class="pill blue">Total ${total.toFixed(1)}</span>
        ${prediction.lineupAdjusted ? `<span class="pill orange">Kokoonpanomuutos huomioitu</span>` : ""}
        ${Math.abs(weatherAdj) >= 0.1
  ? `<span class="pill orange">Sääkorjaus ${weatherAdj.toFixed(1)}</span>`
  : ""}
        <span class="pill orange">Kotiutuskisa ${shootoutPct} %</span>

        ${playerPowerHtml}
   <div id="result-${match.id}" class="live-result-box">
  ${resultHtml(match, prediction)}
</div>
        ${(match.result || match.liveResult?.finished) ? "" : weatherHtml(weather)}
        ${lineupWarningsHtml(match, lineup, selectedSeries)}
        ${lineupHtml(lineup)}
        ${prediction.note ? `<div class="reason">${prediction.note}</div>` : ""}
      </div>
    `);
  }

  $(targetId).innerHTML = cards.join("");
}


async function refreshLiveResults() {
  const selectedDate = $("date").value || today();

  // Automaattisesti päivitetään vain tämän päivän otteluita.
  if (selectedDate !== today()) {
    if (liveRefreshTimer) {
      clearInterval(liveRefreshTimer);
      liveRefreshTimer = null;
    }
    return;
  }

  let gamesFound = false;
  let hasUnfinishedGames = false;

  async function refreshSeries(series) {
    const level = "Superpesis";

    const res = await fetch(
      `/.netlify/functions/matches?level=${encodeURIComponent(level)}&series=${encodeURIComponent(series)}`
    );

    if (!res.ok) {
      throw new Error(`Tulospäivitys epäonnistui: ${res.status}`);
    }

    const json = await res.json();
    const matches = Array.isArray(json.data) ? json.data : [];

    const dayMatches = matches.filter(
      match => (match.date || "").slice(0, 10) === selectedDate
    );

    if (dayMatches.length > 0) {
      gamesFound = true;
    }

    for (const match of dayMatches) {
      const resultBox = document.getElementById(`result-${match.id}`);
      const prediction = lockedPredictions[match.id];
     const finished =
  match.liveResult?.finished === true ||
  Boolean(match.result);

      // Vain tämän ottelun tulosruutu vaihtuu.
      if (resultBox && prediction) {
        resultBox.innerHTML = resultHtml(match, prediction);
      }

      // Alkamaton tai käynnissä oleva ottelu pitää päivityksen toiminnassa.
      if (!finished) {
        hasUnfinishedGames = true;
      }
    }
  }

  try {
    await Promise.all([
      refreshSeries("Miehet"),
      refreshSeries("Naiset")
    ]);

    // Päivitys loppuu vasta päivän viimeisen ottelun päätyttyä.
    if ((!gamesFound || !hasUnfinishedGames) && liveRefreshTimer) {
      clearInterval(liveRefreshTimer);
      liveRefreshTimer = null;
    }
  } catch (error) {
    console.error("Live-tulosten päivitys epäonnistui:", error);
  }
}
async function load() {
  const selectedDate = $("date").value || today();

  $("status").textContent = "Ladataan Miesten ja Naisten Superpesis...";

  async function loadSeries(series, matchesTarget, powerTarget, cardClass, standingsTarget) {
    const level = "Superpesis";

    try {
      const res = await fetch(
        `/.netlify/functions/matches?level=${encodeURIComponent(level)}&series=${encodeURIComponent(series)}`
      );

      if (!res.ok) throw new Error(`Otteluhaku epäonnistui: ${res.status}`);

      const json = await res.json();
      const matches = Array.isArray(json.data) ? json.data : [];
      const stats = buildStats(matches);
      const playerStats = await fetchPlayerStats(series);

      if (series === "Miehet") currentMenMatches = matches;
      if (series === "Naiset") currentWomenMatches = matches;

      const standings = buildStandings(matches, currentStandingsMode);
      renderOfficialStandings(standings, standingsTarget);

      if (series === "Miehet") {
        renderOfficialStandings(standings, "standings-men-mobile");
      }

      if (series === "Naiset") {
        renderOfficialStandings(standings, "standings-women-mobile");
      }
    
      const dayMatches = matches.filter(
        m => (m.date || "").slice(0, 10) === selectedDate
      );

      renderPowerTable(stats, powerTarget);
      await renderMatches(dayMatches, matches, series, matchesTarget, cardClass, playerStats);

      return true;
    } catch (e) {
      console.error(`${series} haku epäonnistui`, e);
      $(matchesTarget).innerHTML = `<p>${series}: datan haku epäonnistui.</p>`;
      return false;
    }
  }

  const menOk = await loadSeries("Miehet", "matches-men", "power-men", "men", "standings-men");
  const womenOk = await loadSeries("Naiset", "matches-women", "power-women", "women", "standings-women");

  $("status").textContent =
    menOk || womenOk
      ? `Päivitetty ${new Date().toLocaleTimeString("fi-FI")}`
      : "Datan haku epäonnistui. Tarkista Netlify Functions.";
}

$("date").value = today();
$("btn").onclick = async () => {
  await load();
  startLiveRefresh();
};

$("date").onchange = async () => {
  if (liveRefreshTimer) {
    clearInterval(liveRefreshTimer);
    liveRefreshTimer = null;
  }

  await load();
  startLiveRefresh();
};

function startLiveRefresh() {
  if (liveRefreshTimer) {
    clearInterval(liveRefreshTimer);
    liveRefreshTimer = null;
  }

  if (($("date").value || today()) !== today()) {
    return;
  }

  liveRefreshTimer = setInterval(refreshLiveResults, 60000);
  refreshLiveResults();
}

load().then(() => {
  startLiveRefresh();
});
