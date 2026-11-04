export interface FireStation {
    station_name: string;
    source_id: string | number;
    zoneid: string | number;
}

/** Finds the fire weather station whose name contains `town` (case-insensitive). */
export function findStation<T extends FireStation>(stations: T[], town: string): T | undefined {
    const query = town.trim().toLowerCase();
    if (!query) return undefined;
    return stations.find((s) => s.station_name?.toLowerCase().includes(query));
}
