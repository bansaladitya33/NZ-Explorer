/*
  NZ Explorer, Ref 59: trip reminder emails.
  Runs every hour on GitHub. For each trip starting in the next 26 hours, it emails every
  current member who has not had a reminder yet, then records them on the trip so nobody
  gets two. Students who left the trip are no longer members, so they get nothing.

  Secrets (GitHub repo settings, Secrets and variables, Actions):
    FIREBASE_SERVICE_ACCOUNT  the whole JSON file from Firebase, Project settings, Service accounts
    GMAIL_USER                the team Gmail address
    GMAIL_APP_PASSWORD        the 16 character app password for that Gmail
  Optional:
    TEST_TO   send one sample email to this address and change nothing
    DRY_RUN   "1" prints what would be sent and changes nothing
*/
const SITE = "https://bansaladitya33.github.io/NZ-Explorer/";
const WINDOW_HOURS = 26;
const ACT = require("./activities.json");

function aucklandOffsetMinutes(utcMs) {
  const parts = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utcMs));
  const g = t => +parts.find(p => p.type === t).value;
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - Math.floor(utcMs / 60000) * 60000) / 60000;
}
function tripStartUtc(date, time) {
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = String(time || "09:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return guess - aucklandOffsetMinutes(guess) * 60000;
}
function nice(date, time) {
  const t = tripStartUtc(date, time);
  const day = new Date(t).toLocaleDateString("en-NZ", { timeZone: "Pacific/Auckland", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const clock = new Date(t).toLocaleTimeString("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit" });
  const early = new Date(t - 10 * 60000).toLocaleTimeString("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit" });
  return { day, clock, early };
}
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function wxText(c) { if (c === 0) return "Clear"; if (c <= 2) return "Partly cloudy"; if (c === 3) return "Cloudy"; if (c <= 48) return "Fog"; if (c <= 57) return "Drizzle"; if (c <= 67) return "Rain"; if (c <= 77) return "Snow"; if (c <= 82) return "Showers"; return "Thunderstorms"; }

async function forecast(a, date, fetchFn) {
  if (!a || a.lat == null) return null;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${a.lat}&longitude=${a.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=Pacific%2FAuckland&forecast_days=3`;
    const r = await fetchFn(u); if (!r.ok) return null;
    const d = (await r.json()).daily, i = d.time.indexOf(date); if (i < 0) return null;
    const p = d.precipitation_probability_max[i], w = d.wind_speed_10m_max[i], c = d.weather_code[i];
    const warn = [];
    if (p != null && p >= 60) warn.push(`rain chance ${p}%`);
    if (w != null && w >= 40) warn.push(`wind up to ${Math.round(w)} km/h`);
    if (c != null && c >= 95) warn.push("thunderstorms");
    return { line: `${wxText(c)}, ${Math.round(d.temperature_2m_min[i])} to ${Math.round(d.temperature_2m_max[i])}°C, rain chance ${p == null ? "n/a" : p + "%"}, wind up to ${w == null ? "n/a" : Math.round(w) + " km/h"}`, warn };
  } catch (e) { return null; }
}

function buildEmail(firstName, trip, a, wx) {
  const n = nice(trip.date, trip.time), name = a ? a.name : "your NZ Explorer trip";
  const map = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent((trip.meeting || "") + ", Auckland");
  const bring = (a && a.bring.length ? a.bring : ["Comfortable walking shoes", "Drinking water", "A light jacket or raincoat", "Sunscreen and a hat", "A charged phone"]);
  const wxLine = wx ? wx.line : "Forecast not available yet. Please check before you leave.";
  const wxWarn = wx && wx.warn.length && a && a.weatherDependent ? `Heads up: ${wx.warn.join(", ")}. If conditions look bad, the backup is ${a.backup}. Check your trip page for updates.` : "";
  const subject = `NZ Explorer: your ${name} is tomorrow`;
  const text = [
    `Hi ${firstName},`, "",
    `Your NZ Explorer adventure is almost here! This is a friendly reminder that you have joined ${name}, taking place tomorrow.`, "",
    "YOUR TRIP DETAILS",
    `Activity: ${name}`, `Date: ${n.day}`, `Start time: ${n.clock}`, `Meeting point: ${trip.meeting}`, `Map: ${map}`, `Group size: up to ${trip.max} students`, "",
    `Please arrive 10 minutes early (${n.early}) so everyone can meet before the trip begins.`, "",
    "WHAT TO BRING", ...bring.map(b => "- " + b), ...(a && a.tip ? ["", "Tip: " + a.tip] : []), "",
    "WEATHER FOR TOMORROW", wxLine, ...(wxWarn ? [wxWarn] : []), "Auckland weather changes quickly, so check again before you leave.", "",
    "CONNECT WITH YOUR GROUP", `Open NZ Explorer, then Chats, to talk to your group: ${SITE}`, "",
    "CAN'T MAKE IT?", `Please open NZ Explorer, then Trips, then Leave trip, so another student can take your place: ${SITE}`, "",
    "See you tomorrow!", "NZ Explorer Team", "Explore Auckland. Meet New People. Make Memories."
  ].join("\n");
  const row = (k, v) => `<tr><td style="padding:6px 12px 6px 0;color:#6B5A52;vertical-align:top">${k}</td><td style="padding:6px 0"><b>${v}</b></td></tr>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1F1410;line-height:1.5">
<div style="background:#93442F;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><div style="font-size:20px;font-weight:bold">NZ Explorer</div><div>Your trip is tomorrow</div></div>
<div style="border:1px solid #E3D3C8;border-top:0;padding:20px 22px;border-radius:0 0 12px 12px">
<p>Hi ${esc(firstName)},</p>
<p>Your NZ Explorer adventure is almost here! This is a friendly reminder that you have joined <b>${esc(name)}</b>, taking place tomorrow.</p>
<h3 style="margin:18px 0 6px">Your trip details</h3>
<table style="border-collapse:collapse">${row("Activity", esc(name))}${row("Date", esc(n.day))}${row("Start time", esc(n.clock))}${row("Meeting point", `${esc(trip.meeting)}<br><a href="${map}">Open in Maps</a>`)}${row("Group size", "Up to " + esc(trip.max) + " students")}</table>
<p>Please arrive 10 minutes early (<b>${esc(n.early)}</b>) so everyone can meet before the trip begins.</p>
<h3 style="margin:18px 0 6px">What to bring</h3><ul>${bring.map(b => `<li>${esc(b)}</li>`).join("")}</ul>${a && a.tip ? `<p style="background:#F8EFEA;padding:10px 12px;border-radius:8px">${esc(a.tip)}</p>` : ""}
<h3 style="margin:18px 0 6px">Weather for tomorrow</h3><p>${esc(wxLine)}</p>${wxWarn ? `<p style="color:#93442F"><b>${esc(wxWarn)}</b></p>` : ""}<p style="color:#6B5A52">Auckland weather changes quickly, so check again before you leave.</p>
<h3 style="margin:18px 0 6px">Connect with your group</h3><p>Open <a href="${SITE}">NZ Explorer</a>, then <b>Chats</b>, to talk to your group before you meet.</p>
<h3 style="margin:18px 0 6px">Can't make it?</h3><p>Open <a href="${SITE}">NZ Explorer</a>, then <b>Trips</b>, then <b>Leave trip</b>, so another student can take your place.</p>
<p style="margin-top:20px">See you tomorrow!<br><b>NZ Explorer Team</b><br><span style="color:#6B5A52">Explore Auckland. Meet New People. Make Memories.</span></p>
</div></div>`;
  return { subject, text, html };
}

async function run(deps) {
  const { db, auth, mailer, from, now, fetchFn, log, testTo, dryRun } = deps;
  const snap = await db.collection("trips").get();
  const trips = [];
  snap.forEach(d => trips.push(Object.assign({ id: d.id }, d.data())));
  if (testTo) {
    const t = trips.filter(x => tripStartUtc(x.date, x.time) > now).sort((p, q) => tripStartUtc(p.date, p.time) - tripStartUtc(q.date, q.time))[0]
      || { date: new Date(now + 864e5).toISOString().slice(0, 10), time: "10:00", meeting: "Downtown Ferry Terminal", max: 8, activityId: "A01" };
    const a = ACT[t.activityId], e = buildEmail("there", t, a, await forecast(a, t.date, fetchFn));
    await mailer.sendMail({ from, to: testTo, subject: "[TEST] " + e.subject, text: e.text, html: e.html });
    log(`Test email sent to ${testTo} for trip ${t.id || "(sample)"}`);
    return { sent: 1 };
  }
  let sent = 0;
  for (const t of trips) {
    if (!t.date) continue;
    const hrs = (tripStartUtc(t.date, t.time) - now) / 36e5;
    if (hrs <= 0 || hrs > WINDOW_HOURS) continue;
    const done = new Set(t.remindedUids || []);
    const mem = await db.collection("trips").doc(t.id).collection("members").get();
    const todo = [];
    mem.forEach(m => { if (!done.has(m.id)) todo.push({ uid: m.id, data: m.data() || {} }); });
    if (!todo.length) continue;
    const a = ACT[t.activityId], wx = await forecast(a, t.date, fetchFn);
    for (const m of todo) {
      let email = null;
      try { email = (await auth.getUser(m.uid)).email; } catch (e) { email = m.data.email || null; }
      if (!email) { log(`No email for member ${m.uid} on ${t.id}, skipped`); continue; }
      const e = buildEmail((m.data.name || "there").split(" ")[0], t, a, wx);
      if (dryRun) { log(`[dry run] would email ${email}: ${e.subject}`); continue; }
      await mailer.sendMail({ from, to: email, subject: e.subject, text: e.text, html: e.html });
      await db.collection("trips").doc(t.id).update({ remindedUids: deps.arrayUnion(m.uid) });
      sent++; log(`Reminder sent for trip ${t.id} (${hrs.toFixed(1)} h ahead)`);
    }
  }
  log(`Done. ${sent} reminder(s) sent.`);
  return { sent };
}

module.exports = { run, buildEmail, tripStartUtc, aucklandOffsetMinutes };

if (require.main === module) {
  (async () => {
    const testTo = process.env.TEST_TO || "";
    const need = ["GMAIL_USER", "GMAIL_APP_PASSWORD"].concat(testTo ? [] : ["FIREBASE_SERVICE_ACCOUNT"]).filter(k => !process.env[k]);
    if (need.length) { console.log("Missing secrets: " + need.join(", ") + ". Nothing sent."); process.exit(0); }
    const nodemailer = require("nodemailer");
    const mailer = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, "") } });
    let db = { collection: () => ({ get: async () => ({ forEach() {} }) }) }, auth = null, arrayUnion = v => v;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const admin = require("firebase-admin");
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
      db = admin.firestore(); auth = admin.auth(); arrayUnion = v => admin.firestore.FieldValue.arrayUnion(v);
    } else console.log("No Firebase key yet, so the test email uses a sample trip.");
    await run({ db, auth, mailer, from: `"NZ Explorer" <${process.env.GMAIL_USER}>`, now: Date.now(),
      fetchFn: fetch, log: console.log, testTo, dryRun: process.env.DRY_RUN === "1", arrayUnion });
  })().catch(e => { console.error("Reminder run failed:", e.message); process.exit(1); });
}
