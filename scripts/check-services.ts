import { readiness } from '../server/config.js';
import { LiveServices } from '../server/services.js';
if (!readiness().chatReady) throw new Error('Set GROQ_API_KEY in the backend environment.');
const result = await new LiveServices().answer('Reply with OK.', []);
if (!result.content.trim()) throw new Error('Groq returned no answer.');
console.log('PASS Groq streaming model access');
