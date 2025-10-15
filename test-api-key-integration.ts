/**
 * Test script to verify API key integration between ChromeAuthManager and ModelClientFactory
 */

import { chromeAuthManager } from './src/models/ChromeAuthManager';
import { ModelClientFactory } from './src/models/ModelClientFactory';

async function testIntegration() {
  console.log('Testing API Key Integration...\n');

  // Simulate storing an OpenAI API key via ChromeAuthManager
  const testOpenAIKey = 'sk-test1234567890abcdefghijklmnopqrstuvwxyz';

  console.log('1. Storing OpenAI API key via ChromeAuthManager...');
  await chromeAuthManager.storeApiKey(testOpenAIKey);

  // Retrieve via ChromeAuthManager
  const retrievedKey = await chromeAuthManager.retrieveApiKey();
  console.log('2. Retrieved from ChromeAuthManager:', retrievedKey ? 'Success' : 'Failed');

  // Now test ModelClientFactory
  const factory = ModelClientFactory.getInstance();

  console.log('3. Testing ModelClientFactory.loadApiKey() for OpenAI...');
  const loadedOpenAIKey = await factory.loadApiKey('openai');
  console.log('   Result:', loadedOpenAIKey ? 'Success - Key loaded' : 'Failed - No key found');

  if (loadedOpenAIKey === testOpenAIKey) {
    console.log('   ✅ Keys match! Integration working correctly for OpenAI.');
  } else if (loadedOpenAIKey) {
    console.log('   ⚠️  Key loaded but doesn\'t match expected value');
  } else {
    console.log('   ❌ Failed to load key from ModelClientFactory');
  }

  // Test with Anthropic key
  const testAnthropicKey = 'sk-ant-test1234567890abcdefghijklmnopqrstuvwxyz';

  console.log('\n4. Storing Anthropic API key via ChromeAuthManager...');
  await chromeAuthManager.storeApiKey(testAnthropicKey);

  console.log('5. Testing ModelClientFactory.loadApiKey() for Anthropic...');
  const loadedAnthropicKey = await factory.loadApiKey('anthropic');
  console.log('   Result:', loadedAnthropicKey ? 'Success - Key loaded' : 'Failed - No key found');

  if (loadedAnthropicKey === testAnthropicKey) {
    console.log('   ✅ Keys match! Integration working correctly for Anthropic.');
  } else if (loadedAnthropicKey) {
    console.log('   ⚠️  Key loaded but doesn\'t match expected value');
  } else {
    console.log('   ❌ Failed to load key from ModelClientFactory');
  }

  // Test hasValidApiKey
  console.log('\n6. Testing hasValidApiKey()...');
  const hasOpenAI = await factory.hasValidApiKey('openai');
  const hasAnthropic = await factory.hasValidApiKey('anthropic');
  console.log('   OpenAI:', hasOpenAI ? '✅ Valid' : '❌ Invalid');
  console.log('   Anthropic:', hasAnthropic ? '✅ Valid' : '❌ Invalid');

  console.log('\n✅ Integration test complete!');
}

// Run test if this file is executed directly
if (require.main === module) {
  testIntegration().catch(console.error);
}

export { testIntegration };