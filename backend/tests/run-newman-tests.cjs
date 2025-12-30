#!/usr/bin/env node

const newman = require('newman');
const path = require('path');
const fs = require('fs');

// Ensure test-results directory exists
const resultsDir = path.join(__dirname, 'test-results');
if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
}

const cookieJarPath = path.join(resultsDir, 'cookies.json');

console.log('🧪 Running Gastos Households API Tests with Newman\n');
console.log('Configuration:');
console.log(`  Collection: Gastos_Households_API.postman_collection.json`);
console.log(`  Environment: newman-environment.json`);
console.log(`  Cookie Jar: ${cookieJarPath}`);
console.log(`  Verbose: enabled\n`);

// Run the collection with cookie persistence
newman.run({
    collection: path.join(__dirname, 'Gastos_Households_API.postman_collection.json'),
    environment: path.join(__dirname, 'newman-environment.json'),
    reporters: ['cli', 'json'],
    reporter: {
        json: {
            export: path.join(resultsDir, 'newman-report.json')
        }
    },
    insecure: true,  // Allow self-signed certificates
    timeout: 10000,  // 10 second timeout
    timeoutRequest: 10000,
    timeoutScript: 5000,
    delayRequest: 100,  // 100ms delay between requests
    bail: false,  // Run all tests even if some fail
    color: 'on',
    verbose: true,  // Show detailed output including cookies
    cookieJar: cookieJarPath,  // Persist cookies across requests
}, function (err, summary) {
    if (err) {
        console.error('\n❌ Collection run encountered an error:', err);
        process.exit(1);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`Total Requests:   ${summary.run.stats.requests.total}`);
    console.log(`Total Tests:      ${summary.run.stats.tests.total}`);
    console.log(`Passed Tests:     ${summary.run.stats.tests.total - summary.run.stats.tests.failed}`);
    console.log(`Failed Tests:     ${summary.run.stats.tests.failed}`);
    console.log(`Total Assertions: ${summary.run.stats.assertions.total}`);
    console.log(`Failed Assertions: ${summary.run.stats.assertions.failed}`);
    console.log(`Average Response: ${Math.round(summary.run.timings.responseAverage)}ms`);
    
    if (summary.run.failures.length > 0) {
        console.log('\n❌ Failed Tests:');
        console.log('='.repeat(60));
        summary.run.failures.forEach((failure, index) => {
            const requestName = failure.source?.name || 'Unknown Request';
            const assertionName = failure.error?.test || 'Unknown Assertion';
            const errorMessage = failure.error?.message || 'Unknown Error';
            
            console.log(`\n${index + 1}. ${requestName}`);
            console.log(`   Assertion: ${assertionName}`);
            console.log(`   Error: ${errorMessage}`);
        });
        console.log('\n' + '='.repeat(60));
        process.exit(1);
    } else {
        console.log('\n' + '='.repeat(60));
        console.log('✅ All tests passed!');
        console.log('='.repeat(60));
        process.exit(0);
    }
});
