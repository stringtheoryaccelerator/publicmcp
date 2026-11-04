import { destinationPoint, haversineNm, initialBearing } from "./common.js";

export interface ZoneFeature {
    id?: string;
    properties: { id: string; name: string; type?: string; "@id"?: string };
}

/** Returns the NWS marine zones covering a point (empty when the point is on land). */
export type ZoneLookup = (latitude: number, longitude: number) => Promise<ZoneFeature[]>;

export interface NearestZoneResult {
    zone: ZoneFeature;
    /** Where the zone was found: the requested point itself, or the probe that hit. */
    latitude: number;
    longitude: number;
    /** 0 when the requested point is inside the zone. */
    distanceNm: number;
    bearingTrue: number;
}

export interface NearestZoneOptions {
    /** Rings searched in order; the first ring with a hit wins. */
    radiiNm?: number[];
    /** Never probe further than this, so inland places don't get a distant zone. */
    maxRadiusNm?: number;
    /** Probes per ring, evenly spaced around the compass. */
    bearings?: number;
}

const DEFAULT_RADII_NM = [2, 5, 10, 15, 20, 25];

// Coastal zones are the near-shore forecasts boaters want; offshore/high-seas zones overlap them.
function preferCoastal(features: ZoneFeature[]): ZoneFeature {
    return features.find((f) => f.properties?.type === "coastal") ?? features[0];
}

/**
 * Finds the NWS marine zone at a point or, if the point is on land (e.g. a town
 * center that a geocoder returned), the nearest zone found by probing rings of
 * points around it. Returns null when nothing is found within maxRadiusNm.
 */
export async function findNearestMarineZone(
    latitude: number,
    longitude: number,
    lookup: ZoneLookup,
    options: NearestZoneOptions = {},
): Promise<NearestZoneResult | null> {
    const maxRadiusNm = options.maxRadiusNm ?? 25;
    const bearingCount = options.bearings ?? 8;
    const radii = (options.radiiNm ?? DEFAULT_RADII_NM).filter((r) => r > 0 && r <= maxRadiusNm);

    // The point itself: let failures surface, since they mean the service is down.
    const here = await lookup(latitude, longitude);
    if (here.length > 0) {
        return { zone: preferCoastal(here), latitude, longitude, distanceNm: 0, bearingTrue: 0 };
    }

    for (const radius of radii) {
        const probes = Array.from({ length: bearingCount }, (_, i) => {
            const bearing = (360 / bearingCount) * i;
            return { bearing, ...destinationPoint(latitude, longitude, bearing, radius) };
        });
        const results = await Promise.all(
            probes.map((p) => lookup(p.latitude, p.longitude).catch(() => [] as ZoneFeature[])),
        );
        const hits = probes
            .map((p, i) => ({ probe: p, features: results[i] }))
            .filter((h) => h.features.length > 0);
        if (hits.length === 0) continue;

        const best = hits.find((h) => h.features.some((f) => f.properties?.type === "coastal")) ?? hits[0];
        return {
            zone: preferCoastal(best.features),
            latitude: best.probe.latitude,
            longitude: best.probe.longitude,
            distanceNm: Math.round(haversineNm(latitude, longitude, best.probe.latitude, best.probe.longitude) * 100) / 100,
            bearingTrue: Math.round(initialBearing(latitude, longitude, best.probe.latitude, best.probe.longitude)),
        };
    }
    return null;
}
