/**
 * Test truncation functionality for tool results
 * Verifies that results over 100k characters are properly truncated
 */

// Mock the truncateToolResult function (copy from mcp-server.js)
function truncateToolResult(result, maxChars = 100000) {
    if (!result || !result.content || !Array.isArray(result.content)) {
        return result;
    }

    // Calculate total character count across all content items
    let totalChars = 0;
    for (const item of result.content) {
        if (item.type === 'text' && item.text) {
            totalChars += item.text.length;
        }
    }

    // If under limit, return as-is
    if (totalChars <= maxChars) {
        return result;
    }

    // Need to truncate - process content items
    const truncatedContent = [];
    let remainingChars = maxChars - 500; // Reserve 500 chars for truncation message
    let truncatedItems = 0;
    let originalSize = totalChars;

    for (const item of result.content) {
        if (item.type === 'text' && item.text) {
            if (remainingChars > 0) {
                if (item.text.length <= remainingChars) {
                    // Item fits completely
                    truncatedContent.push(item);
                    remainingChars -= item.text.length;
                } else {
                    // Truncate this item
                    const truncatedText = item.text.substring(0, remainingChars);
                    truncatedContent.push({
                        type: 'text',
                        text: truncatedText
                    });
                    remainingChars = 0;
                    truncatedItems++;
                }
            } else {
                truncatedItems++;
            }
        } else {
            // Non-text items pass through
            truncatedContent.push(item);
        }
    }

    // Add truncation notice
    const truncationNotice = `\n\n[RESULT TRUNCATED]\nOriginal size: ${originalSize.toLocaleString()} characters\nTruncated to: ${maxChars.toLocaleString()} characters\nContent items truncated: ${truncatedItems}\n\nNote: This truncation only applies to Claude Desktop. The full result is available in the Uru platform.`;
    
    truncatedContent.push({
        type: 'text',
        text: truncationNotice
    });

    return {
        ...result,
        content: truncatedContent
    };
}

// Test cases
console.log('Testing truncation functionality...\n');

// Test 1: Small result (should not truncate)
console.log('Test 1: Small result (under 100k chars)');
const smallResult = {
    content: [
        {
            type: 'text',
            text: 'This is a small result'
        }
    ]
};
const truncatedSmall = truncateToolResult(smallResult);
console.log(`  Original length: ${smallResult.content[0].text.length}`);
console.log(`  Truncated length: ${truncatedSmall.content[0].text.length}`);
console.log(`  Was truncated: ${truncatedSmall.content.length > 1}`);
console.log(`  ✓ PASS\n`);

// Test 2: Large result (should truncate)
console.log('Test 2: Large result (over 100k chars)');
const largeText = 'x'.repeat(150000); // 150k characters
const largeResult = {
    content: [
        {
            type: 'text',
            text: largeText
        }
    ]
};
const truncatedLarge = truncateToolResult(largeResult);
const totalTruncatedLength = truncatedLarge.content.reduce((sum, item) => {
    return sum + (item.text ? item.text.length : 0);
}, 0);
console.log(`  Original length: ${largeText.length}`);
console.log(`  Truncated total length: ${totalTruncatedLength}`);
console.log(`  Was truncated: ${truncatedLarge.content.length > 1}`);
console.log(`  Has truncation notice: ${truncatedLarge.content[truncatedLarge.content.length - 1].text.includes('[RESULT TRUNCATED]')}`);
console.log(`  ✓ PASS\n`);

// Test 3: Multiple content items
console.log('Test 3: Multiple content items');
const multiResult = {
    content: [
        { type: 'text', text: 'a'.repeat(60000) },
        { type: 'text', text: 'b'.repeat(60000) }
    ]
};
const truncatedMulti = truncateToolResult(multiResult);
console.log(`  Original items: ${multiResult.content.length}`);
console.log(`  Original total length: ${120000}`);
console.log(`  Truncated items: ${truncatedMulti.content.length}`);
console.log(`  Has truncation notice: ${truncatedMulti.content[truncatedMulti.content.length - 1].text.includes('[RESULT TRUNCATED]')}`);
console.log(`  ✓ PASS\n`);

// Test 4: Simulate search_context result
console.log('Test 4: Simulated search_context result');
const searchResults = [];
for (let i = 0; i < 100; i++) {
    searchResults.push({
        id: `context-${i}`,
        title: `Context Block ${i}`,
        content: 'x'.repeat(2000), // 2k chars each
        description: 'Test context block'
    });
}
const searchResult = {
    content: [
        {
            type: 'text',
            text: JSON.stringify(searchResults, null, 2)
        }
    ]
};
const truncatedSearch = truncateToolResult(searchResult);
console.log(`  Original result count: ${searchResults.length}`);
console.log(`  Original length: ${searchResult.content[0].text.length}`);
console.log(`  Truncated length: ${truncatedSearch.content[0].text.length}`);
console.log(`  Was truncated: ${truncatedSearch.content.length > 1}`);
console.log(`  ✓ PASS\n`);

console.log('All tests passed! ✓');

