require('dotenv').config();
const express = require('express');
const cors = require('cors');

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

// Stripe Webhook muss VOR express.json eingebunden werden
// (Stripe braucht den raw/unverarbeiteten Request-Body für die Signatur)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));

// Öffentlich
app.get('/health', (req, res) => {
  res.json({ status: 'ok', geminiKey: !!process.env.GEMINI_API_KEY, supabase: !!process.env.SUPABASE_URL });
});

// Stripe: Webhook öffentlich, Checkout geschützt
app.use('/api/stripe', stripeRoutes);

// Geschützt: Login erforderlich
app.use('/api/user', requireAuth, userRoutes);

// Geschützt: Login + Nutzungslimit
app.use('/api/gemini', requireAuth, checkUsageLimit, geminiRoutes);
app.use('/api/agents', requireAuth, checkAgentLimit, agentRoutes);

// Geschützt: Login (kein Gemini-Limit, ruft externe API auf)
app.use('/api/search', requireAuth, searchRoutes);
app.use('/api/documents', requireAuth, documentRoutes);

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message || 'Interner Serverfehler' });
});

app.listen(PORT, () => {
  console.log(`QuizWise Backend laeuft auf Port ${PORT}`);
  console.log(`Gemini: ${!!process.env.GEMINI_API_KEY} | Supabase: ${!!process.env.SUPABASE_URL}`);
});
