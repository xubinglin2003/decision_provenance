# Decision Provenance Workspace

This repository contains the code and data for an interactive decision provenance workspace built with Next.js. The application supports crime dataset exploration, linked visualizations, table-based inspection, and provenance tracking for analytic decisions and interactions.

## Included in this repository

- Source code for the web application
- Dataset file used by the application
- Dependency lockfile for reproducible installation
- API routes and in-memory session/provenance logic needed to run the demo locally

## Project structure

- `app/`: Next.js app routes, layout, and API endpoints
- `components/`: UI components, charts, tables, and workspace views
- `hooks/`: client-side state and data loading hooks
- `lib/`: shared types, analytics logic, CSV parsing, and server utilities
- `public/state_crime_small.csv`: bundled dataset used by the application

## Environment requirements

- Node.js `>= 20.9.0`
- npm `>= 10`

Tested locally with:

- Node.js `v23.6.1`
- npm `10.9.2`

If you use `nvm`, run:

```bash
nvm use
```

## Dataset

The application loads the dataset from:

`public/state_crime_small.csv`

Dataset summary:

- CSV file with 400 data rows plus 1 header row
- State-level crime statistics by year
- No extra download or preprocessing is required

## How to run the project

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open the application in a browser:

`http://localhost:3000`

## Production build verification

To verify that the project is directly runnable from a clean install:

```bash
npm run build
npm start
```

Then open:

`http://localhost:3000`

## Available scripts

- `npm run dev`: start the local development server
- `npm run build`: create a production build
- `npm start`: run the production server
- `npm run lint`: run ESLint checks

## Configuration notes

- No environment variables are required for heuristic-only hypothesis generation
- No database setup is required
- No external data download is required
- The included CSV file is loaded directly by the app

## Optional LLM configuration

To enable backend LLM-based hypothesis generation before heuristic fallback, set these environment variables in `.env.local`:

```bash
LLM_PROVIDER=qwen
LLM_MODEL=your-model-name
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://your-provider-compatible-base-url
```

Optional:

```bash
LLM_TIMEOUT_MS=12000
```

If these variables are missing or the request fails, the backend automatically falls back to the existing heuristic hypotheses.
