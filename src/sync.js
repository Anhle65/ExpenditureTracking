'use strict';

// One-time-paste bootstrap. Reads manifest.json from the repo, then pulls every
// listed file into Scriptable's folder. Because the file list lives in the repo,
// you never need to re-paste this Sync script again when new scripts are added.
// Only CODE is fetched; transaction DATA never leaves the phone.
const RAW_BASE = 'https://raw.githubusercontent.com/Anhle65/ExpenditureTracking/main';

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();

async function fetchText(repoPath) {
  // ?v=timestamp busts GitHub's CDN cache so we always get the latest push.
  const req = new Request(`${RAW_BASE}/${repoPath}?v=${Date.now()}`);
  req.headers = { 'Cache-Control': 'no-cache' };
  return req.loadString();
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
a.message = `Pulled ${manifest.length} files.`;
a.addAction('OK');
await a.present();
