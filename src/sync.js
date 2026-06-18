'use strict';

// One-time-paste bootstrap. Resolves the latest commit SHA on main, then pulls
// every file in manifest.json from the IMMUTABLE by-SHA raw URLs. Branch URLs
// (.../main/...) are CDN-cached and can serve stale code for minutes after a
// push; by-SHA URLs are never stale. Only CODE is fetched; DATA stays on-device.
const REPO = 'Anhle65/ExpenditureTracking';

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();

// Latest commit SHA on main (the API is authoritative and not raw-CDN cached).
const shaReq = new Request(`https://api.github.com/repos/${REPO}/commits/main`);
shaReq.headers = { Accept: 'application/vnd.github.sha' };
const sha = (await shaReq.loadString()).trim();
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${sha}`;

async function fetchText(repoPath) {
  return new Request(`${RAW_BASE}/${repoPath}`).loadString();
}

const manifest = JSON.parse(await fetchText('manifest.json'));
for (const repoPath of manifest) {
  const code = await fetchText(repoPath);
  const name = repoPath.split('/').pop();   // write as a flat script name
  fm.writeString(fm.joinPath(dir, name), code);
  console.log(`synced ${name} (${code.length} bytes)`);
}

const a = new Alert();
a.title = 'Sync complete';
a.message = `Pulled ${manifest.length} files at ${sha.slice(0, 7)}.`;
a.addAction('OK');
await a.present();
