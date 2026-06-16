'use strict';

// One-time-paste bootstrap. Run it to pull the latest module files from the
// repo into Scriptable's folder. Only CODE is fetched; transaction DATA never
// leaves the phone.
const RAW_BASE = 'https://raw.githubusercontent.com/Anhle65/ExpenditureTracking/main/src';
const FILES = ['lines.js', 'parser.js', 'categorizer.js', 'store.js',
               'aggregate.js', 'storeFile.js', 'import.js', 'dashboard.js',
               'recategorize.js'];

const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();

for (const name of FILES) {
  // ?v=timestamp busts GitHub's CDN cache so we always get the latest push.
  const req = new Request(`${RAW_BASE}/${name}?v=${Date.now()}`);
  req.headers = { 'Cache-Control': 'no-cache' };
  const code = await req.loadString();
  fm.writeString(fm.joinPath(dir, name), code);
  console.log(`synced ${name} (${code.length} bytes)`);
}

const a = new Alert();
a.title = 'Sync complete';
a.message = `Pulled ${FILES.length} files.`;
a.addAction('OK');
await a.present();
