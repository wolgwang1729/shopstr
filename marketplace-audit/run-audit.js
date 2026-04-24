import fs from 'fs/promises';
import { auditRelay, computeCrossRelayMetrics } from './audit-engine.js';

// Phase 1: Project Default Relays (as defined in Shopstr context)
const DEFAULT_RELAYS = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://purplepag.es",
    "wss://relay.primal.net",
    "wss://relay.nostr.band"
];

// Phase 2: Specialized Search Candidates for NIP-50 kind:30402
const SEARCH_CANDIDATES = [
    "wss://aeon.libretechsystems.xyz",
    "wss://ammetronics.com",
    "wss://antiprimal.net/",
    "wss://artisanspyramid.libretechsystems.xyz",
    "wss://cagliostr.compile-error.net",
    "wss://cdn.czas.xyz",
    "wss://cfrelay.haorendashu.workers.dev",
    "wss://cfrelay.haorendashutest.workers.dev",
    "wss://cfrelay.puhcho.workers.dev",
    "wss://cfrelay.royalgarter.workers.dev",
    "wss://cfrelay.snowcait.workers.dev",
    "wss://cobrafuma.com/relay",
    "wss://dev.relay.stream",
    "wss://directory.yabu.me",
    "wss://dm.czas.xyz",
    "wss://fenrir-s.notoshi.win",
    "wss://filter.nostr.wine",
    "wss://henhouse.social/relay",
    "wss://index.hzrd149.com",
    "wss://librepress.libretechsystems.xyz",
    "wss://news-zh-node2.relay.stream",
    "wss://nostr-relay.moe.gift",
    "wss://nostr.compile-error.net",
    "wss://nostr.me/relay",
    "wss://nostr.nodesmap.com",
    "wss://nostr.novacisko.cz",
    "wss://nostr.wine",
    "wss://nostrja-kari-nip50.heguro.com",
    "wss://orly-stil.edufeed.org",
    "wss://orly.edufeed.org",
    "wss://playground.nostrcheck.me/relay",
    "wss://private.nostr.bar",
    "wss://relay-dev.gulugulu.moe",
    "wss://relay.44billion.net",
    "wss://relay.agilesolutionlabs.com",
    "wss://relay.artiostr.ch",
    "wss://relay.azzamo.net",
    "wss://relay.cal3b.com",
    "wss://relay.cloistr.xyz",
    "wss://relay.crostr.com",
    "wss://relay.ditto.pub",
    "wss://relay.divine.video",
    "wss://relay.dreamith.to",
    "wss://relay.gulugulu.moe",
    "wss://relay.innis.xyz",
    "wss://relay.laantungir.net",
    "wss://relay.mcfamily.social",
    "wss://relay.nos.social",
    "wss://relay.nostr-check.me",
    "wss://relay.nostr.moe",
    "wss://relay.nostriches.club",
    "wss://relay.nostrverse.net",
    "wss://relay.noswhere.com",
    "wss://relay.og.coop",
    "wss://relay.orangepill.dev",
    "wss://relay.paulstephenborile.com",
    "wss://relay.plebeian.market",
    "wss://relay.rushmi0.win",
    "wss://relay.scuba323.com",
    "wss://relay.snort.social",
    "wss://relay.spacetomatoes.net",
    "wss://relay.staging.dvines.org",
    "wss://relay.stargazer.social",
    "wss://relay.stream",
    "wss://relay.vertexlab.io",
    "wss://relay.ygg.gratis",
    "wss://relay2.veganostr.com",
    "wss://search.nos.today",
    "wss://shu05.shugur.net",
    "wss://social.protest.net/relay",
    "wss://spatia-arcana.com",
    "wss://testing.gathr.gives",
    "wss://top.testrelay.top",
    "wss://trobades.kilombino.com",
    "wss://us.azzamo.net",
    "wss://us.nostr.wine"
];

const QUERIES = ["bitcoin", "vintage camera", "art", "sticker", "lightning"];

async function main() {
    console.log(`
--------------------------------------------------------------
         SHOPSTR ADVANCED MARKETPLACE SEARCH AUDIT          
--------------------------------------------------------------
    `);

    const rawReports = [];

    console.log("-- Phase 1: Auditing Project Default Relays --");
    for (const url of DEFAULT_RELAYS) {
        const result = await auditRelay(url, QUERIES);
        rawReports.push({ ...result, group: 'default' });
    }

    console.log("\n-- Phase 2: Auditing Search-Specialized Candidates --");
    for (const url of SEARCH_CANDIDATES) {
        const result = await auditRelay(url, QUERIES);
        rawReports.push({ ...result, group: 'search' });
    }

    const { universeSize, reports } = computeCrossRelayMetrics(rawReports);

    // Scoring Logic (0-100)
    reports.forEach(r => {
        if (r.status !== 'COMPLETED') {
            r.score = 0;
            return;
        }

        let score = 0;
        if (r.metrics.capability.nip50) score += 10;
        score += (r.metrics.quality.schemaCompliance * 30);
        score += (r.metrics.quality.searchPrecision * 20);
        score += (r.metrics.coverage.recallIndex * 30);

        // Penalize latency > 1s
        const latencyPenalty = Math.max(0, (r.metrics.performance.searchLatencyAvg - 500) / 500) * 5;
        score -= latencyPenalty;

        // Penalize degradation > 1.5x
        if (r.metrics.performance.degradationFactor > 1.5) score -= 10;

        r.score = Math.max(0, Math.min(100, Math.round(score)));
    });

    reports.sort((a, b) => b.score - a.score);

    // Generate Markdown Report
    let md = `# Shopstr Marketplace Search Audit Report\n\n`;
    md += `**Date:** ${new Date().toISOString()}\n`;
    md += `**Global Universe Discovered:** ${universeSize} unique kind:30402 events\n\n`;

    md += `## Executive Summary\n\n`;
    md += `| Relay | Group | Score | Recall | Precision | Latency | Verdict |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    reports.forEach(r => {
        const verdict = r.score > 80 ? 'ELITE' : r.score > 60 ? 'RELIABLE' : r.score > 40 ? 'MARGINAL' : 'POOR';
        const recall = r.status === 'COMPLETED' ? `${(r.metrics.coverage.recallIndex * 100).toFixed(1)}%` : 'N/A';
        const precision = r.status === 'COMPLETED' ? `${(r.metrics.quality.searchPrecision * 100).toFixed(1)}%` : 'N/A';
        const latency = r.status === 'COMPLETED' ? `${Math.round(r.metrics.performance.searchLatencyAvg)}ms` : 'FAIL';
        const groupLabel = r.group === 'default' ? 'Default' : 'Search';

        md += `| \`${r.url}\` | ${groupLabel} | **${r.score}** | ${recall} | ${precision} | ${latency} | ${verdict} |\n`;
    });

    md += `\n## Technical Deep-Dive\n\n`;
    reports.filter(r => r.status === 'COMPLETED').forEach(r => {
        md += `### ${r.url}\n`;
        md += `- **Recall Index:** ${r.metrics.coverage.recallIndex.toFixed(3)}\n`;
        md += `- **Schema Compliance:** ${(r.metrics.quality.schemaCompliance * 100).toFixed(1)}%\n`;
        md += `- **Search Precision:** ${(r.metrics.quality.searchPrecision * 100).toFixed(1)}%\n`;
        md += `- **Degradation Factor:** ${r.metrics.performance.degradationFactor.toFixed(2)}x\n\n`;
    });

    // Save outputs
    await fs.writeFile('./marketplace-audit/audit-results.json', JSON.stringify(reports, (key, value) => value instanceof Set ? Array.from(value) : value, 2));
    await fs.writeFile('./marketplace-audit/MARKETPLACE_SEARCH_AUDIT.md', md);

    // Generate relay selection recommendation for the app
    const topRelays = reports.filter(r => r.score > 60).map(r => r.url);
    const tsConfig = `/** 
 * AUTO-GENERATED BY MARKETPLACE-AUDIT
 * RE-RUN 'npm run audit:marketplace' TO REFRESH
 */
export const RECOMMENDED_SEARCH_RELAYS = ${JSON.stringify(topRelays, null, 2)};
`;
    await fs.writeFile('./marketplace-audit/relay-config-recommendation.ts', tsConfig);

    console.log(`\n[SUCCESS] Audit complete. Reports generated in ./marketplace-audit/`);
    console.log(`Results saved to MARKETPLACE_SEARCH_AUDIT.md`);
}

main().catch(console.error);
