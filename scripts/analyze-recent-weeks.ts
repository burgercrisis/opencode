#!/usr/bin/env bun

/**
 * Cross-platform GitHub Issues Analyzer for Recent Weeks
 * Analyzes Dec 15-21 (Week 50) and Dec 22-26 (Week 51)
 * Replaces scripts/analyze-recent-weeks.sh
 */

import { $ } from "bun";
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const REPO = "sst/opencode";
const GITHUB_API = "https://api.github.com/repos";
const START_DATE = "2025-12-15T00:00:00Z";

console.log("Analyzing GitHub issues from Dec 15 onwards...");
console.log(`Start date: ${START_DATE}`);
console.log("");

// Create temp file
const tempDir = mkdtempSync(join(tmpdir(), 'issues-analysis-'));
const tempFile = join(tempDir, 'issues.json');

const cleanup = () => {
    try {
        rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
        // Ignore cleanup errors
    }
};

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

// Fetch all issues from Dec 15 onwards (paginate through results)
console.log("Fetching issues...");
let allIssues: any[] = [];

for (let page = 1; page <= 5; page++) {
    console.log(`  Fetching page ${page}...`);

    try {
        const response = await fetch(`${GITHUB_API}/${REPO}/issues?state=all&sort=created&direction=desc&per_page=100&page=${page}`);
        const pageData = await response.json();

        if (!Array.isArray(pageData) || pageData.length === 0) {
            console.log(`  No more results on page ${page}`);
            break;
        }

        // Filter issues from Dec 15 onwards
        const filtered = pageData.filter((issue: any) => issue.created_at >= START_DATE);
        const filteredCount = filtered.length;
        console.log(`  Found ${filteredCount} issues from Dec 15 onwards on page ${page}`);

        // Append to all issues
        allIssues = allIssues.concat(filtered);

        // If we've started getting old data, we can stop
        const oldestIssue = pageData[pageData.length - 1];
        if (oldestIssue && oldestIssue.created_at < START_DATE) {
            console.log(`  Reached data older than Dec 15, stopping`);
            break;
        }
    } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        break;
    }
}

console.log("");

// Analysis function converted to TypeScript/JavaScript
function analyzeIssues(issuesData: any[]) {
    if (!issuesData || issuesData.length === 0) {
        console.log("No issues found from Dec 15 onwards");
        return;
    }

    console.log(`Analyzing ${issuesData.length} issues...\n`);

    // Categorize and group by week
    const issuesByWeek = new Map<string, Map<string, number>>();
    const weekTotals = new Map<string, number>();
    const weekOrder: string[] = [];

    // Response tracking
    const responseByWeek = new Map<string, {
        total: number;
        with_response: number;
        no_response: number;
    }>();

    function getWeekLabel(dateStr: string): string {
        const date = new Date(dateStr);

        // Manual week grouping for clarity
        if (date >= new Date(2025, 11, 22)) { // December 22
            return "Week 51: Dec 22-26";
        } else if (date >= new Date(2025, 11, 15)) { // December 15
            return "Week 50: Dec 15-21";
        } else {
            return "Earlier";
        }
    }

    function categorizeIssue(item: any): string {
        if (item.pull_request) {
            return "PR";
        }

        const labels = (item.labels || []).map((label: any) => label.name);
        const title = (item.title || "").toLowerCase();

        if (labels.includes('discussion')) {
            return "Feature Request";
        } else if (labels.includes('help-wanted')) {
            return "Help Question";
        } else if (labels.includes('bug')) {
            return "Bug Report";
        } else if (title.includes('[feature]') || title.includes('feature request') || title.includes('[feat]')) {
            return "Feature Request";
        } else if (title.endsWith('?') && !title.includes('bug')) {
            return "Help Question";
        } else {
            return "Other";
        }
    }

    // Process each issue
    for (const item of issuesData) {
        const weekLabel = getWeekLabel(item.created_at || '');
        if (!weekOrder.includes(weekLabel) && weekLabel !== "Earlier") {
            weekOrder.push(weekLabel);
        }

        const category = categorizeIssue(item);

        // Check if it's an actual issue (not PR)
        if (!item.pull_request) {
            if (!responseByWeek.has(weekLabel)) {
                responseByWeek.set(weekLabel, {
                    total: 0,
                    with_response: 0,
                    no_response: 0
                });
            }

            const responseWeekData = responseByWeek.get(weekLabel)!;
            responseWeekData.total += 1;

            if ((item.comments || 0) > 0) {
                responseWeekData.with_response += 1;
            } else {
                responseWeekData.no_response += 1;
            }
        }

        if (!issuesByWeek.has(weekLabel)) {
            issuesByWeek.set(weekLabel, new Map());
        }

        const weekIssues = issuesByWeek.get(weekLabel)!;
        weekIssues.set(category, (weekIssues.get(category) || 0) + 1);
        weekTotals.set(weekLabel, (weekTotals.get(weekLabel) || 0) + 1);
    }

    // Sort weeks (most recent first)
    weekOrder.sort((a, b) => b.localeCompare(a));

    // Print results
    console.log("=".repeat(80));
    console.log("GITHUB ISSUES BREAKDOWN - RECENT WEEKS");
    console.log("=".repeat(80) + "\n");

    for (const week of weekOrder) {
        const total = weekTotals.get(week) || 0;
        console.log(`${week}: ${total} total`);

        const weekIssues = issuesByWeek.get(week);
        if (weekIssues) {
            const sortedCategories = Array.from(weekIssues.entries()).sort((a, b) => b[1] - a[1]);
            for (const [category, count] of sortedCategories) {
                console.log(`  • ${category}: ${count}`);
            }
        }
        console.log();
    }

    console.log("---");
    const total = Array.from(weekTotals.values()).reduce((sum, count) => sum + count, 0);
    console.log(`TOTAL: ${total} issues/PRs\n`);

    console.log("OVERALL SUMMARY:");
    const allCounts = new Map<string, number>();

    for (const weekIssues of issuesByWeek.values()) {
        for (const [category, count] of weekIssues.entries()) {
            allCounts.set(category, (allCounts.get(category) || 0) + count);
        }
    }

    const sortedCategories = Array.from(allCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [category, count] of sortedCategories) {
        const pct = (count / total) * 100;
        console.log(`  • ${category}: ${count} (${pct.toFixed(1)}%)`);
    }

    // Response rates
    console.log("\n" + "=".repeat(80));
    console.log("ISSUE RESPONSE RATES");
    console.log("=".repeat(80) + "\n");

    for (const week of weekOrder) {
        const data = responseByWeek.get(week);
        if (data && data.total > 0) {
            const rate = (data.with_response / data.total) * 100;
            console.log(`${week}:`);
            console.log(`  Total issues: ${data.total}`);
            console.log(`  With response: ${data.with_response} (${rate.toFixed(1)}%)`);
            console.log(`  No response: ${data.no_response}`);
            console.log();
        }
    }

    // Week over week comparison
    console.log("=".repeat(80));
    console.log("WEEK-OVER-WEEK COMPARISON");
    console.log("=".repeat(80) + "\n");

    if (weekOrder.length >= 2) {
        const w1 = weekOrder[0];  // Most recent
        const w2 = weekOrder[1];  // Previous

        const vol1 = weekTotals.get(w1) || 0;
        const vol2 = weekTotals.get(w2) || 0;
        const volChange = vol1 - vol2;
        const volPct = vol2 > 0 ? (volChange / vol2 * 100) : 0;

        console.log(`Volume Change: ${vol2} → ${vol1} (${volPct >= 0 ? '+' : ''}${volPct.toFixed(1)}%)`);
        console.log();

        console.log("Category Changes:");
        for (const [category] of sortedCategories) {
            const week1Issues = issuesByWeek.get(w1);
            const week2Issues = issuesByWeek.get(w2);

            const oldVal = week2Issues?.get(category) || 0;
            const newVal = week1Issues?.get(category) || 0;
            const change = newVal - oldVal;
            const direction = change > 0 ? "↑" : change < 0 ? "↓" : "→";

            console.log(`  ${category.padEnd(18)}: ${oldVal.toString().padStart(3)} → ${newVal.toString().padStart(3)}  ${direction} ${Math.abs(change)}`);
        }

        console.log();
        const response1 = responseByWeek.get(w1);
        const response2 = responseByWeek.get(w2);

        if (response1 && response2 && response1.total > 0 && response2.total > 0) {
            const r1 = (response1.with_response / response1.total) * 100;
            const r2 = (response2.with_response / response2.total) * 100;
            console.log(`Response Rate: ${r2.toFixed(1)}% → ${r1.toFixed(1)}% (${(r1 - r2).toFixed(1)}pp)`);
        }
    }

    console.log("\n" + "=".repeat(80) + "\n");
}

// Run the analysis
analyzeIssues(allIssues);

cleanup();
