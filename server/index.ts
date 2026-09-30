import { createApp } from './app.js';
import { config, readiness } from './config.js';
import { LiveServices } from './services.js';
const services = new LiveServices();
const server = createApp(services).listen(config.port, process.env.HOST || '127.0.0.1', () => {
  console.log(`Margin API listening at http://127.0.0.1:${config.port}`);
  const missing = readiness().missing;
  if (missing.length) console.log(`Setup needed: ${missing.join(', ')}. See README.md.`);
  if (!process.env.SESSION_SECRET) console.log('Development session secret generated. Sessions reset when the server restarts.');
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(() => process.exit(0)); });
