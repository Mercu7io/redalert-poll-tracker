# RedAlert Poll Tracker 🚨

A modern, real-time WhatsApp poll tracker and emergency responder designed for rapid safety audits and crisis management. Built with Node.js, [Baileys](https://github.com/WhiskeySockets/Baileys) (100% headless, no Chromium required), SQLite (WAL mode), Socket.IO, and Tailwind CSS.

---

## ✨ Features

- **⚡ Lightweight Baileys Engine**: No Chromium, no Puppeteer overhead — consumes minimal RAM and boots instantly.
- **🔄 Real-time Live Tracking**: Live updates via Socket.IO whenever votes or poll changes occur.
- **🛡️ Instant Emergency Alerts**: Automated WhatsApp notifications triggered immediately upon critical responses (e.g., *"Need help"*, *"SOS"*, *"Aide"*).
- **👥 Intelligent Identity Resolution**:
  - Handles modern WhatsApp **LID** (Linked Identifier) vs. international phone numbers.
  - Automatic deduplication so each group member appears exactly once.
  - Inline one-click contact name editor with real-time UI propagation.
- **📊 Broadcast Poll Manager**:
  - Broadcast polls to any participating group with single-choice or multi-choice options.
  - One-click timestamp refresher (`[DD/MM/YYYY - HH:MM]`) preserving custom questions.
- **🔔 Bulk & Individual Reminders**: Follow up with pending members who haven't responded yet.
- **📥 CSV Export**: One-click download of timestamped voting results for compliance or reporting.
- **🌍 Bilingual Support (i18n)**: Seamless live language switching (French & English).
- **🔒 Robust Layered Architecture**: Clean separation into Repositories, Services, and Controllers with Zod schema validation and automated tests.

---

## 🏗️ Architecture

```
wa-poll-tracker/
├── src/
│   ├── config/             # Environment validation (Zod)
│   ├── database/           # SQLite connection & WAL setup
│   ├── repositories/       # Poll, Vote, and Contact data access
│   ├── services/           # Decryption, Baileys lifecycle, alerts, contact cache
│   ├── controllers/        # Request orchestration
│   ├── middlewares/        # Auth & validation
│   ├── validators/         # Typed request schemas
│   ├── routes/             # REST API routes
│   ├── app.js              # Express app
│   └── socket.js           # Socket.IO handler
├── public/                 # Responsive Tailwind UI, i18n locales, client assets
├── test/                   # Automated unit & integration test suites
├── server.js               # Entry point
└── docker-compose.yml      # Container orchestration
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm

### 1. Installation

```bash
git clone https://github.com/Mercu7io/redalert-poll-tracker.git
cd redalert-poll-tracker
npm install
```

### 2. Configuration

Create your `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3500
APP_PASSWORD=YourSecurePassword
ALERT_TARGET_NUMBER=33612345678
SESSION_TIMEOUT_HOURS=24
```

### 3. Running Locally

```bash
npm start
```

Access the dashboard at `http://localhost:3500`.

### 4. Running with Docker Compose (GitHub Packages)

The project includes an automated GitHub Actions CI/CD workflow that builds and pushes the Docker container directly to GitHub Container Registry (`ghcr.io`).

1. Log in to GitHub Container Registry (required for private repositories):
   ```bash
   echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
   ```

2. Copy the example configuration:
   ```bash
   cp docker-compose.example.yml docker-compose.yml
   cp .env.example .env
   ```

3. Pull the pre-built image and launch:
   ```bash
   docker compose pull
   docker compose up -d
   ```

---

## 🧪 Testing

Run the automated test suite (38 unit and integration tests):

```bash
npm test
```

---

## 📄 License

MIT

