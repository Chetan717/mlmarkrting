import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Run from the Marketing project root. Each CLI process completes before the
// next starts. No automatic retries, function deletes or frontend deployment.
const projectId = "mlmbooster-a4887";
const callingTargets = [
  "callingCreateSessionFromTwoFactor",
  "callingSessionStatus",
  "callingUnlockSession",
  "callingPanelLogout",
  "callingGetDashboard",
  "callingSaveFollowup",
];
const allTargets = [
  "marketingCreateSessionFromTwoFactor", "marketingSessionStatus", "marketingUnlockSession",
  "marketingListSessions", "marketingRevokeSession", "marketingPanelLogout", "marketingGetProfiles",
  "marketingGetMyTeam", "marketingGetTeamMemberLeads", "marketingListCallingTeam",
  "marketingCreateCallingMember", "marketingUpdateCallingMember", "marketingSetCallingMemberActive",
  "marketingResetCallingMemberPassword", "marketingGetCallingMemberAnalysis", "panelCustomerSearch",
  ...callingTargets,
];

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("node deploy-calling-one-by-one.mjs [--dry-run] [--all-panels] [--from FUNCTION_NAME]");
    console.log("Default: deploy only the six failed Calling Panel functions, one at a time.");
    return 0;
  }
  let dryRun = false, allPanels = false, from = "";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--dry-run") dryRun = true;
    else if (args[index] === "--all-panels") allPanels = true;
    else if (args[index] === "--from" && args[index + 1]) from = args[++index];
    else { console.error(`Unknown or incomplete option: ${args[index]}`); return 2; }
  }
  const targets = allPanels ? allTargets : callingTargets;
  const start = from ? targets.indexOf(from) : 0;
  if (start < 0) { console.error("--from must name a function in the selected deployment list."); return 2; }
  if (!existsSync("firebase.json") || !existsSync("functions/index.js")) {
    console.error("Run this command from the Marketing project root containing firebase.json and functions/index.js.");
    return 2;
  }
  const pending = targets.slice(start);
  console.log(`Project: ${projectId}. ${pending.length} function(s), sequential deployment.`);
  for (const [index, target] of pending.entries()) {
    const cliArgs = ["deploy", "--only", `functions:${target}`, "--project", projectId];
    console.log(`\n[${index + 1}/${pending.length}] firebase ${cliArgs.join(" ")}`);
    if (dryRun) continue;
    const result = spawnSync("firebase", cliArgs, { stdio: "inherit", shell: process.platform === "win32" });
    if (result.error || result.signal || result.status !== 0) {
      console.error(`\nStopped at ${target}. Remaining functions were not deployed.`);
      if (result.error) console.error(result.error.message);
      console.error("For the CPU quota error, check Cloud Run regional CPU quota in asia-south1. Do not delete production functions.");
      console.error(`After resolving the error, resume with: node deploy-calling-one-by-one.mjs${allPanels ? " --all-panels" : ""} --from ${target}`);
      return Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
    }
  }
  console.log(dryRun ? "\nDry run complete. Nothing was deployed." : "\nAll selected functions deployed successfully. Complete the guide's checks before deploying the frontend.");
  return 0;
}

process.exitCode = main();
