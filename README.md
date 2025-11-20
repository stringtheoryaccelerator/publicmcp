# Maine Burn Permit MCP Server

[![smithery badge](https://smithery.ai/badge/@stringtheoryaccelerator/publicmcp)](https://smithery.ai/server/@stringtheoryaccelerator/publicmcp)

A Model Context Protocol (MCP) server that provides automated tools for checking fire danger levels and applying for burn permits in Maine.

## Overview

This MCP server exposes two main tools:

1. **Check Fire Danger** - Retrieves current fire danger ratings for Maine towns from the Maine Fire Weather system
2. **Apply for Burn Permit** - Automates the process of applying for an open burn permit through Maine's official burn permit system

## Features

- 🔥 Real-time fire danger monitoring for Maine locations
- 📝 Automated burn permit application submission
- 🤖 Model Context Protocol integration for AI assistant compatibility
- 🌐 Web scraping using Puppeteer for up-to-date information
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

## Project Structure

```
publicmcp/
├── src/
│   ├── index.ts                 # Main MCP server setup
│   ├── tools/
│   │   ├── applyPermit.ts      # Burn permit application tool
│   │   └── fireDanger.ts       # Fire danger checking tool
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

Ensure your network allows access to these domains.

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