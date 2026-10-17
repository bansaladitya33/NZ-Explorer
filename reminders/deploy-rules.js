// Publishes ../firestore.rules to Firebase using the service account in FIREBASE_SERVICE_ACCOUNT.
const fs = require("fs"), path = require("path");
const { GoogleAuth } = require("google-auth-library");
const PROJECT = "nz-explorer-8001c";
(async () => {
  const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
  if (!creds.client_email) throw new Error("FIREBASE_SERVICE_ACCOUNT secret is missing or not valid JSON");
  const auth = new GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase"] });
  const client = await auth.getClient();
  const base = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}`;
  const content = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");
  const rs = await client.request({ url: `${base}/rulesets`, method: "POST", data: { source: { files: [{ name: "firestore.rules", content }] } } });
  const rulesetName = rs.data.name;
  console.log("Created ruleset", rulesetName);
  await client.request({ url: `${base}/releases/cloud.firestore`, method: "PATCH",
    data: { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName } } });
  console.log("::notice::Firestore rules published: " + rulesetName);
})().catch(e => {
  const msg = (e.response && JSON.stringify(e.response.data)) || e.message;
  console.log("::error::Rules publish failed: " + String(msg).slice(0, 900));
  process.exit(1);
});
