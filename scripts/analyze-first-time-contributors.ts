#!/usr/bin/env bun

/**
 * Cross-platform First-Time Contributor Analyzer
 * Analyzes PRs from first-time contributors over the last 4 weeks
 * Replaces scripts/analyze-first-time-contributors.sh
 */

import { $ } from "bun";
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const REPO = "sst/opencode";
const GITHUB_API = "https://api.github.com/repos";

// Calculate date 4 weeks ago
const fourWeeksAgo = new Date();
fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
const FOUR_WEEKS_AGO = fourWeeksAgo.toISOString();

console.log("Analyzing first-time contributors from last 4 weeks...");
console.log(`Start date: ${FOUR_WEEKS_AGO}`);
console.log("");

// Create temp files
const tempDir = mkdtempSync(join(tmpdir(), 'contributor-analysis-'));
const tempPrsFile = join(tempDir, 'prs.json');
const tempContributorsFile = join(tempDir, 'contributors.txt');

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

// Fetch all PRs from the last 4 weeks
console.log("Fetching PRs...");
let allPrs: any[] = [];

for (let page = 1; page <= 10; page++) {
    console.log(`  Page ${page}...`);

    try {
        const response = await fetch(`${GITHUB_API}/${REPO}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`);
        const pageData = await response.json();

        if (!Array.isArray(pageData) || pageData.length === 0) {
            break;
        }

        // Filter PRs from the last 4 weeks
        const filtered = pageData.filter((pr: any) => pr.created_at >= FOUR_WEEKS_AGO);
        allPrs = allPrs.concat(filtered);

        // Check if we've reached PRs older than 4 weeks ago
        const oldestPr = pageData[pageData.length - 1];
        if (oldestPr && oldestPr.created_at < FOUR_WEEKS_AGO) {
            break;
        }
    } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        break;
    }
}

console.log(`  Found ${allPrs.length} PRs`);

// Write PRs to temp file
writeFileSync(tempPrsFile, JSON.stringify(allPrs, null, 2));

console.log("");
console.log("Checking contributor status for each PR...");

// Extract PR data with author info
const contributorLines = allPrs.map(pr =>
    `${pr.number}|${pr.user?.login || 'unknown'}|${pr.created_at}|${pr.author_association}`
).join('\n');

writeFileSync(tempContributorsFile, contributorLines);

console.log("");

// Python analysis converted to TypeScript/JavaScript
function analyzeContributors(contributorData: string) {
    const lines = contributorData.trim().split('\n').filter(line => line.trim());

    const prData = lines.map(line => {
        const parts = line.split('|');
        return {
            number: parts[0] || '',
            author: parts[1] || 'unknown',
            created_at: parts[2] || '',
            author_association: parts[3] || ''
        };
    });

    console.log(`Analyzing ${prData.length} PRs...\n`);

    // Categorize by week
    function getWeekLabel(dateStr: string): string {
        const date = new Date(dateStr);

        // Hard-coded weeks for the analysis period
        if (date >= new Date(2025, 11, 22)) { // December 22
            return "Week 51: Dec 22-26";
        } else if (date >= new Date(2025, 11, 15)) { // December 15
            return "Week 50: Dec 15-21";
        } else if (date >= new Date(2025, 11, 8)) { // December 8
            return "Week 49: Dec 8-14";
        } else if (date >= new Date(2025, 11, 1)) { // December 1
            return "Week 48: Dec 1-7";
        } else {
            return "Earlier";
        }
    }

    const byWeek = new Map<string, {
        total: number;
        first_time: number;
        returning: number;
        first_time_authors: Set<string>;
    }>();

    const allAuthors = new Map<string, number>();

    for (const pr of prData) {
        const week = getWeekLabel(pr.created_at);
        const author = pr.author;
        const assoc = pr.author_association;

        if (!byWeek.has(week)) {
            byWeek.set(week, {
                total: 0,
                first_time: 0,
                returning: 0,
                first_time_authors: new Set()
            });
        }

        const weekData = byWeek.get(week)!;
        weekData.total += 1;

        const authorCount = (allAuthors.get(author) || 0) + 1;
        allAuthors.set(author, authorCount);

        // GitHub marks first-time contributors explicitly
        if (assoc === 'FIRST_TIME_CONTRIBUTOR' || (assoc === 'NONE' && authorCount === 1)) {
            weekData.first_time += 1;
            weekData.first_time_authors.add(author);
        } else {
            weekData.returning += 1;
        }
    }

    // Print results
    console.log("=".repeat(90));
    console.log("FIRST-TIME CONTRIBUTOR ANALYSIS - LAST 4 WEEKS");
    console.log("=".repeat(90) + "\n");

    const weeks = ["Week 48: Dec 1-7", "Week 49: Dec 8-14", "Week 50: Dec 15-21", "Week 51: Dec 22-26"];

    console.log("PRs by Contributor Type:\n");
    for (const week of weeks) {
        const data = byWeek.get(week);
        if (data) {
            const total = data.total;
            const first_time = data.first_time;
            const returning = data.returning;
            const first_time_pct = total > 0 ? (first_time / total * 100) : 0;

            console.log(`${week}: ${total} PRs`);
            console.log(`  ✨ First-time contributors: ${first_time} (${first_time_pct.toFixed(1)}%)`);
            console.log(`  ↩️  Returning contributors:  ${returning} ${(100 - first_time_pct).toFixed(1)}%`);
            console.log();
        }
    }

    // Overall summary
    const totalPrs = Array.from(byWeek.values()).reduce((sum, data) => sum + data.total, 0);
    const totalFirstTime = Array.from(byWeek.values()).reduce((sum, data) => sum + data.first_time, 0);
    const totalReturning = Array.from(byWeek.values()).reduce((sum, data) => sum + data.returning, 0);
    const overallFirstTimePct = totalPrs > 0 ? (totalFirstTime / totalPrs * 100) : 0;

    console.log("=".repeat(90));
    console.log("OVERALL SUMMARY");
    console.log("=".repeat(90) + "\n");

    console.log(`Total PRs (4 weeks):              ${totalPrs}`);
    console.log(`From first-time contributors:     ${totalFirstTime} (${overallFirstTimePct.toFixed(1)}%)`);
    console.log(`From returning contributors:      ${totalReturning} ${(100 - overallFirstTimePct).toFixed(1)}%`);

    // Count unique first-time contributors
    const allFirstTimeAuthors = new Set<string>();
    for (const data of byWeek.values()) {
        for (const author of data.first_time_authors) {
            allFirstTimeAuthors.add(author);
        }
    }

    console.log(`\nUnique first-time contributors:   ${allFirstTimeAuthors.size}`);

    // Week by week trend
    console.log("\n" + "=".repeat(90));
    console.log("TREND ANALYSIS");
    console.log("=".repeat(90) + "\n");

    console.log("First-Time Contributor Rate by Week:\n");
    for (const week of weeks) {
        const data = byWeek.get(week);
        if (data) {
            const rate = data.total > 0 ? (data.first_time / data.total * 100) : 0;
            const bar = "█".repeat(Math.floor(rate / 2));
            console.log(`  ${week}: ${rate.toFixed(1).padStart(5)}% ${bar}`);
        }
    }

    console.log("\n" + "=".repeat(90));
    console.log("KEY INSIGHTS");
    console.log("=".repeat(90) + "\n");

    const insights: string[] = [];

    if (totalFirstTime > 0) {
        insights.push(
            `1. New Contributors: ${totalFirstTime} PRs from first-timers shows healthy\n` +
            `   community growth and welcoming environment for new contributors.`
        );
    }

    if (overallFirstTimePct > 20) {
        insights.push(
            `2. High New Contributor Rate: ${overallFirstTimePct.toFixed(1)}% from first-timers is\n` +
            `   excellent. Indicates strong onboarding and accessible contribution process.`
        );
    } else if (overallFirstTimePct > 10) {
        insights.push(
            `2. Moderate New Contributor Rate: ${overallFirstTimePct.toFixed(1)}% from first-timers\n` +
            `   is healthy. Good balance of new and returning contributors.`
        );
    } else {
        insights.push(
            `2. Low New Contributor Rate: ${overallFirstTimePct.toFixed(1)}% from first-timers.\n` +
            `   Most PRs from established contributors (mature project pattern).`
        );
    }

    // Check for trend
    const weekRates: number[] = [];
    for (const week of weeks) {
        const data = byWeek.get(week);
        if (data) {
            const rate = data.total > 0 ? (data.first_time / data.total * 100) : 0;
            weekRates.push(rate);
        }
    }

    if (weekRates.length >= 3) {
        const firstRate = weekRates[0] ?? 0;
        const lastRate = weekRates[weekRates.length - 1] ?? 0;

        if (lastRate > firstRate) {
            insights.push(
                `3. Growing Trend: First-time contributor rate increasing\n` +
                `   (${firstRate.toFixed(1)}% → ${lastRate.toFixed(1)}%). Project attracting more new contributors.`
            );
        } else if (lastRate < firstRate) {
            insights.push(
                `3. Declining Trend: First-time contributor rate decreasing\n` +
                `   (${firstRate.toFixed(1)}% → ${lastRate.toFixed(1)}%). May indicate shifting to core contributors.`
            );
        } else {
            insights.push(
                `3. Stable Trend: First-time contributor rate relatively stable\n` +
                `   across weeks. Consistent new contributor engagement.`
            );
        }
    }

    insights.push(
        `4. Unique Contributors: ${allFirstTimeAuthors.size} unique new people made their\n` +
        `   first contribution. Shows breadth of community involvement.`
    );

    for (const insight of insights) {
        console.log(`${insight}\n`);
    }

    console.log("=".repeat(90) + "\n");
}

// Run the analysis
analyzeContributors(contributorLines);

cleanup();
