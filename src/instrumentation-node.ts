import { schedulerWanted } from './lib/scheduler-switch';
import { registerPreScoreHook, startScheduler } from './lib/schedule';
import { getConnection } from './lib/google/store';
import { syncGoogleForSite } from './lib/google/server';

if (schedulerWanted()) {
  // Pull fresh Search Console and GA4 data before each scheduled run when the site is connected to Google.
  // A failed sync is recorded on the run; scoring still goes ahead on the latest uploads.
  registerPreScoreHook(async (siteId) => {
    if (!getConnection(siteId)) return;
    const result = await syncGoogleForSite(siteId);
    if (!result.ok) throw new Error(result.error);
  });
  startScheduler();
}
