require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const geminiRoutes = require('./routes/gemini');
const agentRoutes = require('./routes/agents');
const userRoutes = require('./routes/user');
const stripeRoutes = require('./routes/stripe');
const searchRoutes = require('./routes/search');
const documentRoutes = require('./routes/documents');
const { requireAuth } = require('./middleware/auth');
const { checkUsageLimit } = require('./middleware/limits');
const { checkAgentLimit } = require('./middleware/agentLimits');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https:\/\/[a-z0-9-]+-enes-yazicis-projects\.vercel\.app$/.test(origin)) return callback(null, true);
    callback(new Error('CORS: Diese Domain ist nicht erlaubt.'));
  },
}));

const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Zu viele Anfragen. Bitte warte eine Minute.' } });
const geminiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Zu viele KI-Anfragen. Bitte warte eine Minute.' } });
const stripeLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Zu viele Checkout-Anfragen. Bitte warte eine Minute.' } });

app.use('/api/', globalLimiter);

// Stripe Webhook muss VOR express.json eingebunden werden
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));

// Öffentlich
app.get('/health', (req, res) => {
  res.json({ status: 'ok', geminiKey: !!process.env.GEMINI_API_KEY, supabase: !!process.env.SUPABASE_URL });
});

// Stripe: Webhook öffentlich, Checkout geschützt
app.use('/api/stripe', stripeLimiter, stripeRoutes);

// Geschützt: Login erforderlich
app.use('/api/user', requireAuth, userRoutes);

// Geschützt: Login + Nutzungslimit + Rate-Limit
app.use('/api/gemini', geminiLimiter, requireAuth, checkUsageLimit, geminiRoutes);
app.use('/api/agents', geminiLimiter, requireAuth, checkAgentLimit, agentRoutes);

// Geschützt: Login (kein Gemini-Limit, ruft externe API auf)
app.use('/api/search', requireAuth, searchRoutes);
app.use('/api/documents', requireAuth, documentRoutes);

app.use((err, req, res, next) => {
  // Vollständigen Fehler serverseitig loggen (Stacktrace fürs Debugging)
  console.error(err.stack || err.message);
  const status = err.statusCode || 500;
  // Nur als sicher markierte (err.expose) oder Client-Fehler (4xx) zeigen ihre
  // Nachricht. Interne 5xx-Fehler bekommen eine generische Meldung — keine
  // Supabase-Pfade, Stacktraces oder SDK-Interna leaken nach außen.
  const expose = err.expose === true || status < 500;
  res.status(status).json({
    error: expose ? err.message : 'Interner Serverfehler. Bitte versuche es erneut.',
  });
});

app.listen(PORT, () => {
  console.log(`QuizWise Backend laeuft auf Port ${PORT}`);
  console.log(`Gemini: ${!!process.env.GEMINI_API_KEY} | Supabase: ${!!process.env.SUPABASE_URL}`);
});
