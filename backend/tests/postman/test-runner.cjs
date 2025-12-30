#!/usr/bin/env node

const newman = require('newman');
const path = require('path');

// Run the collection
newman.run({
    collection: path.join(__dirname, 'Gastos_Households_API.postman_collection.json'),
    reporters: ['cli', 'json'],
    reporter: {
        json: {
            export: path.join(__dirname, 'test-results/newman-report.json')
        }
    },
    bail: false,  // Continue on errors to see all failures
    color: 'on',
    timeoutRequest: 10000,
    delayRequest: 100  // Small delay between requests
}, function (err, summary) {
    if (err) {
        console.error('Collection run encountered an error:', err);
        process.exit(1);
    }
    
    console.log('\n📊 Test Summary:');
    console.log(`   Total Tests: ${summary.run.stats.tests.total}`);
    console.log(`   Passed: ${summary.run.stats.tests.total - summary.run.stats.tests.failed}`);
    console.log(`   Failed: ${summary.run.stats.tests.failed}`);
    console.log(`   Assertions: ${summary.run.stats.assertions.total} (${summary.run.stats.assertions.failed} failed)`);
    
    if (summary.run.failures.length > 0) {
        console.log('\n❌ Failed Tests:');
        summary.run.failures.forEach((failure, index) => {
            console.log(`   ${index + 1}. ${failure.source.name || 'Unknown'}`);
            console.log(`      ${failure.error.message}`);
        });
        process.exit(1);
    } else {
        console.log('\n✅ All tests passed!');
        process.exit(0);
    }
});
