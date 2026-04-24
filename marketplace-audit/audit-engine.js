import { fetchNIP11, RelayAuditor } from './utils.js';
import { validateListing, analyzeSearchPrecision } from './validators.js';

export async function auditRelay(url, queries) {
    const report = {
        url,
        nip11: null,
        status: 'PENDING',
        metrics: {
            capability: { nip50: false, searchOnTags: false },
            performance: { connectLatency: 0, searchLatencyAvg: 0, degradationFactor: 1.0 },
            quality: { schemaCompliance: 0, searchPrecision: 0, freshListingRatio: 0 },
            coverage: { totalFound: 0, uniqueIds: new Set(), hasBaseEvents: false }
        },
        tests: []
    };

    console.log(`[AUDIT] Starting: ${url}`);

    // 1. NIP-11 Check
    const startNip11 = performance.now();
    report.nip11 = await fetchNIP11(url);
    report.metrics.performance.connectLatency = performance.now() - startNip11;

    if (report.nip11) {
        report.metrics.capability.nip50 = report.nip11.supported_nips?.includes(50) || false;
        report.metrics.capability.searchOnTags = report.nip11.supported_nips?.includes(501) || false;
    }

    const auditor = new RelayAuditor(url);
    try {
        await auditor.connect();

        let totalSearchTime = 0;
        let firstSearchTime = 0;

        // Baseline Query (No Search Filter) - confirm the relay indexes 30402 at all
        const baselineStart = performance.now();
        const baselineResult = await auditor.query('audit-baseline', { kinds: [30402], limit: 10 });
        const baselineLatency = performance.now() - baselineStart;

        report.metrics.coverage.hasBaseEvents = baselineResult.events.length > 0;
        report.tests.push({
            query: "(BASELINE: no-search)",
            count: baselineResult.events.length,
            latency: baselineLatency,
            validRatio: baselineResult.events.length > 0 ? 1.0 : 0,
            precision: 1.0
        });

        for (let i = 0; i < queries.length; i++) {
            const query = queries[i];
            const startSearch = performance.now();
            const result = await auditor.query(`audit-${i}`, { kinds: [30402], search: query, limit: 20 });
            const duration = performance.now() - startSearch;

            totalSearchTime += duration;
            if (i === 0) firstSearchTime = duration;

            // Analyze Quality
            const validations = result.events.map(validateListing);
            const validRatio = validations.filter(v => v.valid).length / (result.events.length || 1);
            const precision = analyzeSearchPrecision(result.events, query);

            report.metrics.coverage.totalFound += result.events.length;
            result.events.forEach(e => report.metrics.coverage.uniqueIds.add(e.id));

            report.tests.push({
                query,
                count: result.events.length,
                latency: duration,
                validRatio,
                precision: precision.averagePrecision,
                garbageCount: Math.round(precision.garbageRatio * result.events.length)
            });

            await new Promise(r => setTimeout(r, 500));
        }

        report.metrics.performance.searchLatencyAvg = totalSearchTime / (queries.length || 1);
        const lastSearchTime = report.tests[report.tests.length - 1]?.latency || 0;
        report.metrics.performance.degradationFactor = lastSearchTime / (firstSearchTime || 1);

        report.metrics.quality.schemaCompliance = report.tests.reduce((a, b) => a + b.validRatio, 0) / (report.tests.length || 1);
        report.metrics.quality.searchPrecision = report.tests.reduce((a, b) => a + b.precision, 0) / (report.tests.length || 1);

        report.status = 'COMPLETED';
    } catch (err) {
        report.status = 'FAILED';
        report.error = err.message;
    } finally {
        await auditor.close();
    }

    return report;
}

export function computeCrossRelayMetrics(allReports) {
    const globalUniverse = new Set();
    allReports.forEach(r => {
        if (r.metrics?.coverage?.uniqueIds) {
            r.metrics.coverage.uniqueIds.forEach(id => globalUniverse.add(id));
        }
    });

    const universeSize = globalUniverse.size;

    allReports.forEach(r => {
        if (r.status === 'COMPLETED') {
            const mySize = r.metrics.coverage.uniqueIds.size;
            r.metrics.coverage.recallIndex = mySize / (universeSize || 1);
        }
    });

    return { universeSize, reports: allReports };
}
