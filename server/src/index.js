// Local / always-on server: start the API (and serve the built React app if present)
import app from './app.js';
import { config } from './config.js';
import { ensureActivityTable } from './utils/activity.js';
import { startAutoBilling } from './services/billing.js';

ensureActivityTable()
  .catch((err) => console.error('[activity log] could not create table:', err.message))
  .finally(() => {
    app.listen(config.port, () => {
      console.log(`SubFlow API running on http://localhost:${config.port}`);
      startAutoBilling();
    });
  });
