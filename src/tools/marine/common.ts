// Shared helpers for the marine weather tools.
//
// All data sources here are free, public, and require no API key, so the
// tools work identically whether the server runs locally over stdio or as a
// hosted HTTP deployment.

export const OPEN_METEO_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
export const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const NWS_API_URL = "https://api.weather.gov";
export const NOAA_TIDES_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
export const NOAA_STATIONS_URL =
    "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json";

// api.weather.gov rejects requests without a User-Agent identifying the app.
const USER_AGENT = "publicmcp-marine (github.com/stringtheoryaccelerator/publicmcp)";

export async function fetchJson(url: string): Promise<any> {
    const response = await fetch(url, {
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/geo+json, application/json",
        },
    });
    if (!response.ok) {
        throw new Error(`Request failed (${response.status} ${response.statusText}): ${url}`);
    }
    return response.json();
}

const EARTH_RADIUS_NM = 3440.065;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a));
}

export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Point at `fraction` (0..1) along the great circle between two coordinates.
export function intermediatePoint(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
    fraction: number,
): { latitude: number; longitude: number } {
    const phi1 = toRad(lat1);
    const lambda1 = toRad(lon1);
    const phi2 = toRad(lat2);
    const lambda2 = toRad(lon2);

    const delta =
        2 *
        Math.asin(
            Math.sqrt(
                Math.sin((phi2 - phi1) / 2) ** 2 +
                    Math.cos(phi1) * Math.cos(phi2) * Math.sin((lambda2 - lambda1) / 2) ** 2,
            ),
        );
    if (delta === 0) {
        return { latitude: lat1, longitude: lon1 };
    }

    const a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
    const b = Math.sin(fraction * delta) / Math.sin(delta);
    const x = a * Math.cos(phi1) * Math.cos(lambda1) + b * Math.cos(phi2) * Math.cos(lambda2);
    const y = a * Math.cos(phi1) * Math.sin(lambda1) + b * Math.cos(phi2) * Math.sin(lambda2);
    const z = a * Math.sin(phi1) + b * Math.sin(phi2);

    return {
        latitude: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
        longitude: toDeg(Math.atan2(y, x)),
    };
}

// Point reached by travelling `distanceNm` from a start point on an initial true bearing.
export function destinationPoint(
    lat: number,
    lon: number,
    bearingDeg: number,
    distanceNm: number,
): { latitude: number; longitude: number } {
    const delta = distanceNm / EARTH_RADIUS_NM;
    const theta = toRad(bearingDeg);
    const phi1 = toRad(lat);
    const lambda1 = toRad(lon);
    const phi2 = Math.asin(
        Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
    );
    const lambda2 =
        lambda1 +
        Math.atan2(
            Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
            Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
        );
    return { latitude: toDeg(phi2), longitude: ((toDeg(lambda2) + 540) % 360) - 180 };
}

const COMPASS_POINTS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function degreesToCompass(degrees: number): string {
    return COMPASS_POINTS[Math.round(degrees / 22.5) % 16];
}

export function metersToFeet(meters: number): number {
    return meters * 3.28084;
}

// Thresholds loosely follow NWS marine warning criteria (sustained wind, knots).
export function windWarning(windKn: number): string | null {
    if (windKn >= 64) return "Hurricane-force wind conditions";
    if (windKn >= 48) return "Storm-force wind conditions";
    if (windKn >= 34) return "Gale-force wind conditions";
    if (windKn >= 21) return "Small craft advisory wind conditions";
    return null;
}

export function waveWarning(waveM: number): string | null {
    if (waveM >= 6) return "Very high seas (6 m / 20 ft or greater)";
    if (waveM >= 4) return "Very rough seas (4 m / 13 ft or greater)";
    if (waveM >= 2.5) return "Rough seas hazardous to small craft (2.5 m / 8 ft or greater)";
    return null;
}

export const MARINE_DISCLAIMER =
    "Data from public model forecasts (Open-Meteo/NOAA). Not for primary navigation - always check official marine forecasts and Notices to Mariners before departure.";

export const NWS_MARINE_DISCLAIMER =
    "Official National Weather Service marine forecast (api.weather.gov). Not for primary navigation - always check current broadcasts and Notices to Mariners before departure.";

// Open-Meteo returns an object for a single location and an array for
// multi-location requests; normalize to an array.
export function asLocationArray(data: any): any[] {
    return Array.isArray(data) ? data : [data];
}

// Index of the hourly timestamp closest to `target`. Open-Meteo returns
// times like "2026-07-30T13:00" (UTC when timezone=UTC is requested).
export function nearestHourIndex(times: string[], target: Date): number {
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(new Date(times[i] + "Z").getTime() - target.getTime());
        if (diff < bestDiff) {
            bestDiff = diff;
            best = i;
        }
    }
    return best;
}

// Index of the hourly slot containing `now` (Open-Meteo data starts at midnight
// UTC, so slicing from 0 would include hours already past). Returns 0 if the
// data starts in the future and -1 if every slot is in the past.
export function currentHourIndex(times: string[], now: Date = new Date()): number {
    const hourStart = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
    return times.findIndex((t) => new Date(t + "Z").getTime() >= hourStart);
}

// Days of data to request so that `hours` of forecast are available from the
// current UTC hour (data starts at midnight UTC). Capped at Open-Meteo's 8 days
// for the marine model.
export function forecastDaysNeeded(hours: number, now: Date = new Date()): number {
    return Math.min(8, Math.ceil((now.getUTCHours() + hours) / 24));
}
