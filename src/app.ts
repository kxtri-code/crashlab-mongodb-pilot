import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { getCollections, checkReadiness } from './db.js';
import { verifyPassword, createSession, signSession, verifySession } from './auth.js';
import type { StagingSession } from './types.js';

const SESSION_COOKIE_NAME = 'crashlab_staging_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'crashlab-mongodb-pilot-secure-staging-secret-2026';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Security headers middleware - prevent any secret leakage
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
  });

  // Extract session middleware
  const authenticate = (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies[SESSION_COOKIE_NAME];
    if (token) {
      const session = verifySession(token, SESSION_SECRET);
      if (session) {
        (req as any).user = session;
      }
    }
    next();
  };

  app.use(authenticate);

  // Require auth guard
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as StagingSession | undefined;
    if (!user) {
      if (req.accepts('html')) {
        return res.redirect('/login');
      }
      return res.status(401).json({ success: false, error: 'Unauthorized: login required' });
    }
    next();
  };

  // Base layout generator
  const renderLayout = (title: string, bodyContent: string, user?: StagingSession) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | CrashLab MongoDB Pilot Fixture</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-heading: #f0f6fc;
      --accent: #58a6ff;
      --accent-hover: #1f6feb;
      --warning-bg: #bb800926;
      --warning-border: #bb8009;
      --warning-text: #f2cc60;
      --danger-bg: #da3633;
      --danger-hover: #b62324;
      --success: #238636;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #safety-banner {
      background: var(--warning-bg);
      border-bottom: 2px solid var(--warning-border);
      color: var(--warning-text);
      padding: 10px 20px;
      text-align: center;
      font-size: 0.85rem;
      font-weight: 500;
      letter-spacing: 0.3px;
    }
    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-heading);
    }
    .badge-staging {
      background: #1f6feb26;
      color: #58a6ff;
      border: 1px solid #1f6feb;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    nav {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    nav a {
      color: var(--text);
      text-decoration: none;
      font-size: 0.9rem;
      transition: color 0.15s ease;
    }
    nav a:hover { color: var(--accent); }
    .container {
      max-width: 900px;
      margin: 32px auto;
      padding: 0 20px;
      width: 100%;
      flex: 1;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    h1, h2, h3 { color: var(--text-heading); margin-bottom: 12px; }
    p { margin-bottom: 14px; line-height: 1.5; }
    .btn {
      display: inline-block;
      padding: 9px 18px;
      font-size: 0.9rem;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: background 0.15s ease;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-defect {
      background: var(--danger-bg);
      color: #fff;
      font-size: 0.95rem;
      padding: 12px 24px;
      margin-top: 16px;
    }
    .btn-defect:hover { background: var(--danger-hover); }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-heading);
    }
    input[type="email"], input[type="password"], input[type="text"] {
      width: 100%;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-heading);
      font-size: 0.95rem;
    }
    input:focus {
      outline: none;
      border-color: var(--accent);
    }
    .event-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }
    .event-card {
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .event-info h3 { margin-bottom: 4px; }
    .event-meta { font-size: 0.85rem; color: #8b949e; }
    .category-list {
      list-style: none;
      margin-top: 12px;
    }
    .category-item {
      background: #0d1117;
      border: 1px solid var(--border);
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .feedback-box {
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.85rem;
      display: none;
    }
    .feedback-box.error {
      display: block;
      background: #da363326;
      border: 1px solid #da3633;
      color: #f85149;
    }
    footer {
      border-top: 1px solid var(--border);
      padding: 16px;
      text-align: center;
      font-size: 0.8rem;
      color: #8b949e;
    }
  </style>
</head>
<body>
  <div id="safety-banner" class="safety-banner">
    ⚠️ <strong>STAGING TEST FIXTURE</strong> — Synthetic Data Only. Never processes real payments. Never sends real emails/SMS. CrashLab black-box testing environment.
  </div>

  <header>
    <div class="brand-group">
      <span class="brand-title">CrashLab MongoDB Pilot Fixture</span>
      <span id="fixture-badge" class="badge-staging">Staging Test Environment</span>
    </div>
    <nav>
      ${user ? `
        <span id="nav-user" style="font-size: 0.85rem; color: #8b949e;">User: <strong style="color: #f0f6fc;">${user.email}</strong></span>
        <a id="nav-dashboard-link" href="/dashboard">Dashboard</a>
        <a id="nav-events-link" href="/events">Events</a>
        <a id="nav-logout-link" href="/logout">Logout</a>
      ` : `
        <a id="nav-login-link" href="/login">Login</a>
      `}
    </nav>
  </header>

  <main class="container">
    ${bodyContent}
  </main>

  <footer>
    <p>CrashLab MongoDB Pilot Fixture &bull; Dedicated Black-Box Test Target &bull; Environment: staging &bull; Database: MongoDB</p>
  </footer>
</body>
</html>`;
  };

  // 6. Health endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      status: 'ok',
      environment: 'staging',
      database: 'mongodb',
      fixture: 'crashlab-mongodb-pilot',
    });
  });

  // 7. Readiness endpoint
  app.get('/readiness', async (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    const { ready, error } = await checkReadiness();
    if (!ready) {
      return res.status(503).json({
        status: 'unavailable',
        database: 'disconnected',
        error: error || 'Database unavailable',
      });
    }
    res.status(200).json({
      status: 'ready',
      database: 'connected',
    });
  });

  // 5. Controlled defect probe endpoint
  app.get('/api/staging/defect-probe', (_req: Request, res: Response) => {
    const isStagingOrTest =
      process.env.NODE_ENV === 'staging' ||
      process.env.TEST_MODE === 'true' ||
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development';

    if (!isStagingOrTest) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ENVIRONMENT',
          message: 'Controlled defect endpoint is restricted to staging and test environments.',
        },
      });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      success: false,
      error: {
        code: 'CONTROLLED_MONGODB_PILOT_DEFECT',
        message: 'Intentional staging-only defect for CrashLab validation',
      },
    });
  });

  // 1. Login page
  app.get('/login', (req: Request, res: Response) => {
    const user = (req as any).user;
    if (user) {
      return res.redirect('/dashboard');
    }

    const errorMsg = req.query.error ? '<div id="login-error" style="background:#da363326;border:1px solid #da3633;color:#f85149;padding:10px;border-radius:6px;margin-bottom:16px;font-size:0.9rem;">Invalid email or password</div>' : '';

    const content = `
      <div class="card" style="max-width: 440px; margin: 40px auto;">
        <h2>Sign In to Staging Pilot</h2>
        <p style="font-size: 0.9rem; color: #8b949e;">Authenticate using the dedicated staging test credentials.</p>
        ${errorMsg}
        <form id="login-form" action="/api/auth/login" method="POST">
          <div class="form-group">
            <label for="login-email">Test User Email</label>
            <input type="email" id="login-email" name="email" required autocomplete="email" placeholder="qa-pilot@example.test" value="qa-pilot@example.test">
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" name="password" required autocomplete="current-password" placeholder="••••••••••••">
          </div>
          <button type="submit" id="login-submit-btn" class="btn btn-primary" style="width: 100%;">Sign In</button>
        </form>
      </div>
    `;
    res.send(renderLayout('Login', content));
  });

  // Auth: Login POST
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      if (req.accepts('html') && !req.is('json')) {
        return res.redirect('/login?error=invalid');
      }
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    try {
      const collections = getCollections();
      const user = await collections.users.findOne({ email: email.trim().toLowerCase() });

      if (!user || !user.passwordHash || !user.salt) {
        // Generic failure prevents email enumeration
        if (req.accepts('html') && !req.is('json')) {
          return res.redirect('/login?error=invalid');
        }
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      const isValid = verifyPassword(password, user.passwordHash, user.salt);
      if (!isValid) {
        if (req.accepts('html') && !req.is('json')) {
          return res.redirect('/login?error=invalid');
        }
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      const session = createSession(user);
      const token = signSession(session, SESSION_SECRET);

      const isSecure = process.env.NODE_ENV === 'production';
      res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      if (req.accepts('html') && !req.is('json')) {
        return res.redirect('/dashboard');
      }
      return res.status(200).json({ success: true, user: { email: user.email } });
    } catch (err: any) {
      if (req.accepts('html') && !req.is('json')) {
        return res.redirect('/login?error=invalid');
      }
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }
  });

  // Auth: Logout
  app.all('/logout', (_req: Request, res: Response) => {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.redirect('/login');
  });

  // 2. Dashboard page
  app.get(['/', '/dashboard'], requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user as StagingSession;
    const collections = getCollections();
    const eventCount = await collections.events.countDocuments();

    const content = `
      <div class="card">
        <h1>CrashLab MongoDB Pilot Fixture</h1>
        <p><span class="badge-staging">Staging Test Environment</span></p>
        <p>This fixture provides a realistic, synthetic event and ticketing application backed by MongoDB for CrashLab browser and HTTP layer validation.</p>

        <div style="background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 16px; margin: 20px 0;">
          <h3 style="font-size: 0.95rem; margin-bottom: 8px;">Active Staging Session</h3>
          <p style="font-size: 0.9rem; margin-bottom: 4px;">Authenticated User: <strong id="current-user-email">${user.email}</strong></p>
          <p style="font-size: 0.9rem; margin-bottom: 0;">Seeded Fake Events: <strong id="fake-event-count">${eventCount} events</strong></p>
        </div>

        <div style="display: flex; gap: 12px; margin-top: 16px;">
          <a id="nav-events-btn" href="/events" class="btn btn-primary">Browse Fake Events</a>
          <a id="nav-logout-btn" href="/logout" class="btn" style="background: #21262d; color: #c9d1d9;">Sign Out</a>
        </div>
      </div>
    `;
    res.send(renderLayout('Dashboard', content, user));
  });

  // 3. Events page
  app.get('/events', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user as StagingSession;
    const collections = getCollections();
    const events = await collections.events.find().toArray();

    const eventRows = events
      .map(
        (evt) => `
        <div class="event-card" id="event-card-${evt.id}">
          <div class="event-info">
            <h3 id="event-title-${evt.id}">${evt.title}</h3>
            <p class="event-meta" id="event-meta-${evt.id}">
              📅 <span id="event-date-${evt.id}">${new Date(evt.date).toLocaleDateString()}</span> &bull;
              📍 <span id="event-venue-${evt.id}">${evt.venue}</span> &bull;
              🎟️ <span id="event-tickets-${evt.id}">${evt.totalAvailableTickets} available</span> &bull;
              Status: <span id="event-status-${evt.id}" style="color: #3fb950; font-weight: 600; text-transform: uppercase;">${evt.status}</span>
            </p>
          </div>
          <div>
            <a id="view-event-${evt.id}" href="/events/${evt.id}" class="btn btn-primary" style="font-size: 0.85rem;">View Details</a>
          </div>
        </div>
      `
      )
      .join('');

    const content = `
      <div class="card">
        <h2>Seeded Staging Events</h2>
        <p style="font-size: 0.9rem; color: #8b949e;">Synthetic events registered in MongoDB fixture.</p>
        <div class="event-grid">
          ${eventRows}
        </div>
      </div>
    `;
    res.send(renderLayout('Events', content, user));
  });

  // 4. Event details page with controlled defect button
  app.get('/events/:id', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user as StagingSession;
    const collections = getCollections();
    const event = await collections.events.findOne({ id: req.params.id });

    if (!event) {
      return res.status(404).send(
        renderLayout(
          'Event Not Found',
          `<div class="card"><h2>Event Not Found</h2><p>The requested staging event does not exist.</p><a href="/events" class="btn btn-primary">Back to Events</a></div>`,
          user
        )
      );
    }

    const categoriesHtml = (event.ticketCategories || [])
      .map(
        (cat) => `
        <li class="category-item" id="ticket-cat-${cat.id}">
          <div>
            <strong>${cat.name}</strong>
            <span style="font-size: 0.8rem; color: #8b949e; margin-left: 8px;">(Synthetic Ticket)</span>
          </div>
          <div>
            <span style="color: #58a6ff; font-weight: 600;">$${cat.price.toFixed(2)}</span>
            <span style="font-size: 0.85rem; color: #8b949e; margin-left: 12px;">${cat.availableCount} remaining</span>
          </div>
        </li>
      `
      )
      .join('');

    const content = `
      <div class="card">
        <div style="margin-bottom: 16px;">
          <a href="/events" style="color: var(--accent); text-decoration: none; font-size: 0.85rem;">&larr; Back to Events</a>
        </div>
        <h1 id="event-detail-title">${event.title}</h1>
        <p id="event-detail-desc" style="font-size: 1.05rem; color: #8b949e; margin: 12px 0;">${event.description}</p>

        <div style="background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 14px 18px; margin: 20px 0;">
          <p style="margin-bottom: 6px;">📍 <strong>Venue:</strong> <span id="event-detail-venue">${event.venue}</span></p>
          <p style="margin-bottom: 6px;">📅 <strong>Date:</strong> <span id="event-detail-date">${new Date(event.date).toUTCString()}</span></p>
          <p style="margin-bottom: 0;">🎟️ <strong>Total Available:</strong> <span id="event-detail-tickets">${event.totalAvailableTickets} synthetic tickets</span></p>
        </div>

        <h3 style="margin-top: 24px;">Ticket Categories (Synthetic)</h3>
        <ul id="ticket-categories-list" class="category-list">
          ${categoriesHtml}
        </ul>

        <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border);">
          <h3 style="color: #f85149;">CrashLab Defect Probe (Staging Test Only)</h3>
          <p style="font-size: 0.85rem; color: #8b949e;">Clicking this button triggers an intentional HTTP 500 response from <code>/api/staging/defect-probe</code> and emits a browser console error for CrashLab verification.</p>

          <button id="btn-trigger-staging-error" class="btn btn-defect btn-interact" data-testid="btn-interact" onclick="triggerControlledDefect()">
            Trigger Controlled Staging Error
          </button>

          <div id="defect-feedback" class="feedback-box"></div>
        </div>
      </div>

      <script>
        async function triggerControlledDefect() {
          // Log intentional console error for CrashLab observation
          console.error("CONTROLLED_STAGING_DEFECT: Intentional staging-only defect probe triggered for CrashLab validation");

          const feedback = document.getElementById('defect-feedback');
          try {
            const res = await fetch('/api/staging/defect-probe');
            const data = await res.json();
            feedback.style.display = 'block';
            feedback.className = 'feedback-box error';
            feedback.innerHTML = '<strong>Controlled Defect Response Captured (HTTP ' + res.status + '):</strong><br>' + JSON.stringify(data, null, 2);
          } catch (err) {
            console.error("DEFECT_PROBE_NETWORK_ERROR", err);
            feedback.style.display = 'block';
            feedback.className = 'feedback-box error';
            feedback.innerText = "Fetch error: " + err.message;
          }
        }
      </script>
    `;

    res.send(renderLayout(event.title, content, user));
  });

  return app;
}
