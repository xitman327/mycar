// ─── Trip File Parsing ───────────────────────────────────────────────

/**
 * Parse a trip file in the custom format:
 * First line: JSON with start_timestamp, log_objs (column headers)
 * Middle lines: CSV data matching log_objs columns
 * Last line: JSON with stop_timestamp, trip_locations_count, etc.
 */
function parseTripFile(content, filename) {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return null;

    // First line is JSON header
    const header = JSON.parse(lines[0]);

    // Last line is JSON footer
    const footer = JSON.parse(lines[lines.length - 1]);

    // Middle lines are CSV data
    const csvLines = lines.slice(1, lines.length - 1);

    const headers = header.log_objs.map(h =>
        String(h).trim().replace(/ /g, "_").replace(/[^\w]/g, "")
    );

    const locations = csvLines.map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((key, i) => {
            const val = values[i];
            obj[key] = val !== undefined ? (isNaN(val) ? val : parseFloat(val)) : null;
        });
        return obj;
    });

    return {
        id: filename,
        name: filename.replace(/\.(trip|csv)$/, ''),

        start_timestamp: header.start_timestamp,
        end_timestamp: footer.stop_timestamp || null,
        trip_duration: footer.stop_timestamp ? (footer.stop_timestamp - header.start_timestamp) : null,
        trip_locations_count: footer.trip_locations_count || locations.length,
        trip_locations: locations,
        log_objs: header.log_objs,
        trip_distance: footer.trip_distance_km || 0,
        top_speed: footer.top_speed || 0,
        max_consumption: footer.top_consumption || 0,
        avg_consumption: footer.avg_consumption || 0
    };
}
