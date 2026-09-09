# Deutsche Bahn Timetables Viewer

A simple Next.js frontend for browsing Deutsche Bahn (DB) timetable data with filtering capabilities.

## Features

✨ **Functionality:**
- 🚂 Real-time access to DB timetable API
- 📊 Clean, responsive table view
- 🔍 **Filter by:**
  - Station (EVA number)
  - Event type (Arrivals/Departures)
  - Status (On-time/Delayed)
  - Endpoint (Full changes, Recent changes, Planned data)
  - Specific date & hour for planned data
- 🟢 Visual indicators for delays (red highlight)
- 📱 Mobile-responsive design

## Quick Start

### Prerequisites
- Node.js 18+ installed
- Python 3.8+ (for the Python API script)

### Installation

```bash
# Install dependencies
npm install

# The .env.local file already has your API credentials
```

### Running the Frontend

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

Then open **http://localhost:3000** in your browser.

## Usage

1. **Select Station**: Enter station EVA number (default: 8000105 = Berlin Hbf)
2. **Choose Endpoint**:
   - **Full Changes (fchg)**: All current changes for the station
   - **Recent Changes (rchg)**: Changes from last 2 minutes
   - **Planned (plan)**: Scheduled timetable for a specific hour
3. **For Planned Data**: Set the date (YYMMDD) and hour (HH)
4. **Click Fetch** to load data
5. **Use filters** to view specific events (arrivals only, delayed only, etc.)

## API Reference

### Backend Route: `/api/timetables`

Query parameters:
- `endpoint`: `fchg` | `rchg` | `plan`
- `eva`: Station EVA number
- `date`: Date in YYMMDD format (for plan only)
- `hour`: Hour in HH format (for plan only)

Example:
```
GET /api/timetables?endpoint=plan&eva=8000105&date=260909&hour=14
GET /api/timetables?endpoint=fchg&eva=8000105
```

## Common Station EVA Numbers

| Station | EVA |
|---------|-----|
| Berlin Hbf | 8000105 |
| Frankfurt/Main Hbf | 8000261 |
| Munich Hbf | 8000442 |
| Hamburg Hbf | 8002549 |
| Cologne Hbf | 8000207 |

## Python Script

There's also a Python script for bulk data collection:

```bash
# Fetch all timetable data for today (all 24 hours)
python fetch_timetables.py

# For a different station
python fetch_timetables.py --eva 8000261

# Save to custom file
python fetch_timetables.py --output my_data.json

# Fetch current changes instead
python fetch_timetables.py --changes
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   ├── globals.css         # Global styles
│   └── api/
│       └── timetables/
│           └── route.ts    # API endpoint (proxy to DB API)
└── components/
    └── TimetableTable.tsx  # Main UI component
```

## Technologies

- **Framework**: Next.js 14 (React 18)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios (frontend), Node.js fetch (backend)
- **XML Parsing**: xml2js

## Environment Variables

The `.env.local` file contains:
- `CLIENT_ID`: Your DB API client ID
- `CLIENT_KEY`: Your DB API key
- `NEXT_PUBLIC_API_BASE`: API base URL

## Troubleshooting

### "401 Unauthorized" errors
- Make sure `CLIENT_ID` and `CLIENT_KEY` are correctly set in `.env.local`
- Credentials are passed as custom headers, not basic auth

### No data showing
- Try with Berlin Hbf (EVA: 8000105) first
- For planned data, ensure date and hour are in correct format (YYMMDD and HH)
- Check browser console for API errors

### Port 3000 already in use
```bash
npm run dev -- -p 3001  # Use port 3001 instead
```

## DB API Documentation

The full OpenAPI specification is available in:
`documentations/Timetables-1.0.274.json`

More info: https://apis.deutschebahn.com/
