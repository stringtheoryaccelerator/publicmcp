# Public MCP Server (Maine Burn Permits + Marine Weather)

A Model Context Protocol (MCP) server that provides automated tools for checking fire danger levels and applying for burn permits in Maine, plus marine weather forecasting and route planning tools built entirely on free public data sources.

## Overview

This MCP server exposes these tools:

1. **Check Fire Danger** - Retrieves current fire danger ratings for Maine towns from the Maine Fire Weather system
2. **Apply for Burn Permit** - Automates the process of applying for an open burn permit through Maine's official burn permit system
3. **Get Marine Forecast** - Hourly waves, swell, wind, sea surface temperature, and currents for any ocean coordinate worldwide (Open-Meteo)
4. **Get Coastal Marine Forecast** - Official NWS marine zone text forecasts and active alerts (small craft advisories, gale warnings) for US waters
5. **Get Tide Predictions** - NOAA CO-OPS high/low tide predictions, with automatic nearest-station lookup
6. **Plan Marine Route** - Weather routing: great-circle legs between waypoints with the forecast conditions expected at each point at the vessel's ETA, with hazard flagging
7. **Search Location** - Geocodes place names like "Portland, ME" or "Portland, Maine" to coordinates, returning ranked candidate matches

All marine tools also accept a `location` place name directly (e.g. `"Portland, ME"`) and automatically use the best geocoder match, so you never have to supply coordinates by hand.

All marine tools use free, no-API-key public sources (Open-Meteo, NOAA/NWS, NOAA CO-OPS), so they work identically whether the server runs locally over stdio or as a public hosted deployment.

## Features

- 🔥 Real-time fire danger monitoring for Maine locations
- 📝 Automated burn permit application submission
- 🌊 Global marine forecasts (waves, swell, wind, SST, currents) with no API keys
- ⚓ US coastal zone forecasts, marine alerts, and tide predictions from NOAA
- 🧭 Route planning with per-leg ETAs and time-matched forecasts along the route
- 🤖 Model Context Protocol integration for AI assistant compatibility
- 🌐 Web scraping using Puppeteer for up-to-date information (burn permit tools)
- ✅ Input validation using Zod schemas

## Quick Start (Using from GitHub)

The fastest way to use this MCP server with Claude Desktop:

1. Open your Claude Desktop config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add this configuration:
   ```json
   {
     "mcpServers": {
       "maine-burn-permit": {
         "command": "npx",
         "args": ["-y", "github:yourusername/publicmcp"]
       }
     }
   }
   ```

3. Restart Claude Desktop

4. Start asking about fire danger or burn permits in Maine!

That's it! No local installation needed.

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- Chrome/Chromium (for Puppeteer)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd publicmcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript project:
```bash
npm run build
```

## Usage

### Starting the Server

Run the MCP server:
```bash
npm start
```

The server will start and communicate via stdio, making it compatible with MCP clients.

### Development Mode

For development with auto-rebuild on file changes:
```bash
npm run dev
```

### Deploying to GitHub

To make your MCP server available via GitHub for easy distribution:

1. **Update the repository URL in `package.json`:**
   
   Replace `yourusername` with your actual GitHub username:
   ```json
   "repository": {
     "type": "git",
     "url": "https://github.com/yourusername/publicmcp.git"
   }
   ```

2. **Commit and push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/publicmcp.git
   git push -u origin main
   ```

3. **Tag a release (optional but recommended):**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

Once pushed to GitHub, anyone can use your MCP server without cloning it locally!

**Note about the `dist` folder:**
- The `dist` folder is in `.gitignore` and won't be committed to GitHub
- This is intentional! When users install from GitHub via npx, the `prepare` script automatically runs `npm run build`
- This ensures the TypeScript is compiled fresh for each installation
- Keep `dist` in `.gitignore` for cleaner version control

### Connecting to an MCP Client

#### Claude Desktop Configuration

To use this MCP server with Claude Desktop, add it to your Claude Desktop configuration file:

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "maine-burn-permit": {
      "command": "node",
      "args": ["/Users/wolfbird/dev/publicmcp/dist/index.js"]
    }
  }
}
```

Replace `/Users/wolfbird/dev/publicmcp` with the actual path to your project directory.

After updating the configuration, restart Claude Desktop.

#### Serving Directly from GitHub

You can also configure Claude Desktop to run this MCP server directly from GitHub without cloning the repository locally. This approach automatically uses the latest version from the repository.

**Configuration using npx:**

```json
{
  "mcpServers": {
    "maine-burn-permit": {
      "command": "npx",
      "args": [
        "-y",
        "github:yourusername/publicmcp"
      ]
    }
  }
}
```

Replace `yourusername/publicmcp` with the actual GitHub repository path (e.g., `wolfbird/publicmcp`).

**Benefits of GitHub deployment:**
- ✅ No local installation required
- ✅ Automatically uses the latest version
- ✅ Easier to share with others
- ✅ Consistent environment across users

**Requirements:**
- The repository must be public, or you need GitHub authentication configured
- Your `package.json` must include a `bin` field or `start` script (already configured)
- Node.js and npm must be installed locally

**Alternative: Using a specific version/branch**

To use a specific branch or commit:

```json
{
  "mcpServers": {
    "maine-burn-permit": {
      "command": "npx",
      "args": [
        "-y",
        "github:yourusername/publicmcp#main"
      ]
    }
  }
}
```

Or a specific release tag:

```json
{
  "mcpServers": {
    "maine-burn-permit": {
      "command": "npx",
      "args": [
        "-y",
        "github:yourusername/publicmcp#v1.0.0"
      ]
    }
  }
}
```

#### Using with Other MCP Clients

Any MCP-compatible client can connect to this server via stdio. Configure your client to run:

**Local installation:**
```bash
node /path/to/publicmcp/dist/index.js
```

**From GitHub:**
```bash
npx -y github:yourusername/publicmcp
```

## Example Usage

Once configured, you can interact with the tools through your MCP client. Here are some example conversations:

### Example 1: Check Fire Danger

**You:** "What's the current fire danger in Augusta, Maine?"

**Claude (using check_fire_danger tool):**
```
Fire Weather Data for Augusta (Zone 23):
Burning Index: 15
Fire Moisture (1-hr): 12%
Fire Moisture (10-hr): 15%
Fire Moisture (100-hr): 18%
Weather: 65°F, RH 45%, Wind 5 mph

Note: Please verify the official Class Day (Low/Moderate/High) on the main map...
```

### Example 2: Apply for Burn Permit

**You:** "I need to apply for a burn permit. My name is John Smith, I live at 123 Main Street, Augusta, ME 04330. My phone is 207-555-1234, email is john@example.com. I want to burn brush piles on my property behind the barn. My date of birth is 01/15/1980."

**Claude (using apply_for_burn_permit tool):**
```
Permit Application Successful! Permit Number: 123456. 
Please download the permit from the provided link or save the confirmation page.
```

### Example 3: Complete Workflow

**You:** "I want to burn some brush in Portland. Can you check if it's safe and help me get a permit?"

**Claude:** *First checks fire danger for Portland, then if conditions are appropriate, helps gather the required information and submits the permit application.*

## Available Tools

### 1. Check Fire Danger

Check the current fire danger rating for a specific Maine town.

**Tool Name:** `check_fire_danger`

**Input Parameters:**
- `town` (string, required): The name of the town to check fire danger for

**Example Response:**
```
Fire Weather Data for Augusta (Zone 23):
Burning Index: 15
Fire Moisture (1-hr): 12%
Fire Moisture (10-hr): 15%
Fire Moisture (100-hr): 18%
Weather: 65°F, RH 45%, Wind 5 mph

Note: Please verify the official Class Day (Low/Moderate/High) on the main map...
```

### 2. Apply for Burn Permit

Automates the process of applying for a Maine open burn permit.

**Tool Name:** `apply_for_burn_permit`

**Input Parameters:**
- `town` (string, required): Town where burning will occur
- `address` (string, required): Physical address of the burn site
- `city` (string, required): City of the applicant's address
- `state` (string, optional): State of the applicant's address (default: "ME")
- `zip` (string, required): Zip code
- `dob` (string, required): Date of Birth in MM/DD/YYYY format
- `material` (string, required): Material to be burned
  - Options: "Brush", "Wood Debris", "Agricultural", "Campfire"
- `applicantName` (string, required): Full name of the applicant
- `phone` (string, required): Phone number (e.g., 207-555-1234)
- `email` (string, required): Email address
- `burnLocation` (string, required): Description of burn location on property

**Example Response:**
```
Permit Application Successful! Permit Number: 123456. 
Please download the permit from the provided link or save the confirmation page.
```

### 3. Get Marine Forecast

Hourly marine forecast for any ocean coordinate worldwide.

**Tool Name:** `get_marine_forecast`

**Input Parameters:**
- `latitude` / `longitude` (numbers, optional): Position at sea
- `location` (string, optional): Place name to look up instead of coordinates, e.g. `"Portland, ME"` - the best geocoder match is used
- `hours` (number, optional): Forecast length in hours (default 48, max 168)

Provide either coordinates or a `location` name.

Returns hourly wave height/direction/period, swell, wind waves, wind speed/gusts/direction (knots), sea surface temperature, ocean currents, visibility, and precipitation, with automatic hazard warnings (small craft advisory, gale, storm, hurricane-force thresholds).

**Source:** [Open-Meteo Marine & Weather APIs](https://open-meteo.com/) - free, no API key.

### 4. Get Coastal Marine Forecast

Official National Weather Service marine zone forecast and active alerts for US waters.

**Tool Name:** `get_coastal_marine_forecast`

**Input Parameters:**
- `latitude` / `longitude` (numbers, optional): Position in US coastal/offshore waters
- `location` (string, optional): US coastal place name, e.g. `"Portland, ME"` - the best geocoder match is used

Provide either coordinates or a `location` name.

Returns the NWS marine zone text forecast (the same product mariners hear on VHF weather radio) plus any active marine alerts such as Small Craft Advisories or Gale Warnings.

**Source:** [api.weather.gov](https://www.weather.gov/documentation/services-web-api) - free, no API key.

### 5. Get Tide Predictions

High/low tide predictions for US tide stations.

**Tool Name:** `get_tide_predictions`

**Input Parameters:**
- `stationId` (string, optional): NOAA CO-OPS station ID (e.g. `8418150` for Portland, ME)
- `latitude` / `longitude` (numbers, optional): Used to find the nearest tide prediction station when no `stationId` is given
- `location` (string, optional): Place name, e.g. `"Portland, ME"` - the nearest tide station to the best geocoder match is used
- `days` (number, optional): Days of predictions starting today (default 2, max 7)

**Source:** [NOAA CO-OPS Tides & Currents API](https://api.tidesandcurrents.noaa.gov/api/prod/) - free, no API key.

### 6. Plan Marine Route

Weather routing along a set of waypoints.

**Tool Name:** `plan_marine_route`

**Input Parameters:**
- `waypoints` (array, required): Ordered waypoints, starting with the departure point (minimum 2). Each waypoint is either `{latitude, longitude, name?}` or `{location: "Portland, ME", name?}` - place names are geocoded to the best match
- `departureTime` (string, optional): ISO 8601 departure time (default: now)
- `speedKnots` (number, optional): Average boat speed in knots (default 5)

Computes great-circle legs (distance and true bearing), estimates the ETA at points along the route, and fetches the forecast conditions expected **at each point at the time the vessel will be there** - not just current conditions. Long legs are automatically subdivided into intermediate sample points. Flags hazards (gale-force winds, rough seas) and warns when parts of the route are beyond the forecast horizon.

**Example:** "Plan a route from Portland, ME (43.66, -70.24) to Monhegan Island (43.76, -69.32) leaving tomorrow at 8am at 6 knots."

### 7. Search Location

Geocode a place name to coordinates.

**Tool Name:** `search_location`

**Input Parameters:**
- `query` (string, required): Place name, optionally with a state or country after a comma, e.g. `"Portland, ME"`, `"Portland, Maine"`, or `"Cork, Ireland"`. US state abbreviations are expanded automatically
- `count` (number, optional): Maximum matches to return (default 8)

Returns ranked candidate matches with coordinates, plus a best-guess first match. Useful for disambiguating (e.g. Portland, Maine vs Portland, Oregon) before calling the forecast tools - or skip it entirely and pass `location` directly to those tools.

**Source:** [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) - free, no API key.

> ⚠️ The marine tools use public model forecasts and are **not for primary navigation**. Always check official marine forecasts and Notices to Mariners before departure.

## Project Structure

```
publicmcp/
├── src/
│   ├── index.ts                 # Main MCP server setup
│   ├── tools/
│   │   ├── applyPermit.ts      # Burn permit application tool
│   │   ├── fireDanger.ts       # Fire danger checking tool
│   │   └── marine/
│   │       ├── common.ts       # Shared fetch + great-circle helpers, hazard thresholds
│   │       ├── locations.ts    # Geocoding: place-name search + best-match resolution
│   │       ├── marineForecast.ts   # Global marine forecast (Open-Meteo)
│   │       ├── coastalForecast.ts  # NWS zone forecasts + marine alerts
│   │       ├── tides.ts        # NOAA CO-OPS tide predictions
│   │       └── routePlanner.ts # Route planning with time-matched forecasts
│   ├── test_apply_permit.ts    # Test script for permit application
│   └── test_fire_danger.ts     # Test script for fire danger check
├── dist/                        # Compiled JavaScript output
├── package.json
├── tsconfig.json
└── README.md
```

## Technical Details

### Technologies Used

- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk)**: Official MCP SDK for building MCP servers
- **[Puppeteer](https://pptr.dev/)**: Headless browser automation for web scraping
- **[Zod](https://github.com/colinhacks/zod)**: TypeScript-first schema validation
- **TypeScript**: Type-safe development

### How It Works

1. **MCP Server**: The main server (`src/index.ts`) implements the Model Context Protocol, exposing tools via stdio transport
2. **Tool Handlers**: Each tool uses Puppeteer to interact with Maine government websites
3. **Validation**: Zod schemas ensure input parameters are valid before processing
4. **Error Handling**: Comprehensive error handling with user-friendly error messages

## Important Notes

⚠️ **Legal and Safety Disclaimer**
- This tool automates access to public Maine government websites
- Always verify permit details and fire danger ratings manually
- Follow all local regulations and burn restrictions
- Burn permits are subject to approval and weather conditions
- The user is responsible for safe burning practices

## Troubleshooting

### Puppeteer Issues

If Puppeteer fails to launch Chrome:
```bash
# On Linux, you may need to install additional dependencies
sudo apt-get install chromium-browser
```

### Network Errors

The tools require internet access to:
- https://mainefireweather.org
- https://www13.maine.gov/burnpermit
- https://marine-api.open-meteo.com and https://api.open-meteo.com (marine forecasts, route planning)
- https://geocoding-api.open-meteo.com (place-name lookup)
- https://api.weather.gov (NWS coastal forecasts and alerts)
- https://api.tidesandcurrents.noaa.gov (tide predictions)

Ensure your network allows access to these domains. The marine tools use plain HTTPS `fetch` (no browser required), so they work even where Puppeteer/Chromium cannot run.

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## License

ISC

## Acknowledgments

- Maine Forest Service for providing the burn permit system
- Maine Fire Weather for fire danger data
- Model Context Protocol community

## Support

For issues or questions, please open an issue on the GitHub repository.

