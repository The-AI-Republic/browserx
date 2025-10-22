# Settings Configuration Refactoring

## Overview

This document describes the refactoring of authentication configuration management in the BrowserX Chrome Extension, consolidating previously scattered auth-related storage into a centralized AgentConfig system.

## Motivation

Previously, authentication data was stored across multiple storage keys:
- `browserx_auth_data` - Auth mode, account ID, plan type
- `browserx_api_key_encrypted` - Encrypted API key

This scattered approach made it difficult to:
- Maintain consistency across the codebase
- Validate configuration holistically
- Test authentication logic in isolation
- Ensure type safety and data integrity

## Solution

### Centralized Configuration

All authentication configuration is now managed through `AgentConfig` using the `IAuthConfig` interface:

```typescript
interface IAuthConfig {
  apiKey: string;              // Encrypted API key
  authMode: AuthMode;          // Authentication mode (ApiKey, ChatGPT, Local)
  accountId?: string | null;   // Optional account identifier
  planType?: PlanType | null;  // Optional plan information
  lastUpdated?: number;        // Timestamp of last update
}
```

### Storage Consolidation

All configuration is now stored under a single key: `agent_config` in `chrome.storage.local`.

### Architecture

```
┌─────────────────────────┐
│  Settings.svelte (UI)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   ChromeAuthManager     │  ◄── Uses AgentConfig internally
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│      AgentConfig        │  ◄── Centralized configuration
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│    ConfigStorage        │  ◄── Chrome storage wrapper
└─────────────────────────┘
```

## Changes by Component

### 1. Configuration Types (`src/config/types.ts`)

**Added:**
- `IAuthConfig` interface for authentication configuration
- `auth` property to `IAgentConfig`

### 2. Default Configuration (`src/config/defaults.ts`)

**Added:**
- `DEFAULT_AUTH_CONFIG` constant
- Updated `DEFAULT_AGENT_CONFIG` to include auth
- Changed `STORAGE_KEYS.CONFIG` from `'browserx_config_v1'` to `'agent_config'`

**Modified:**
- `mergeWithDefaults()` function to handle auth property

### 3. Encryption Utilities (`src/utils/encryption.ts`)

**New file** with reusable encryption functions:
- `encryptApiKey(plainText: string): string` - Encrypt API key for storage
- `decryptApiKey(encrypted: string): string | null` - Decrypt stored API key

**Note:** Current implementation uses simple base64 + string reversal. Not cryptographically secure - suitable for obfuscation only.

### 4. Validation (`src/config/validators.ts`)

**Added:**
- `validateAuthConfig(auth: any): ValidationResult` - Validates auth configuration

### 5. Storage Layer (`src/storage/ConfigStorage.ts`)

**Simplified:**
- Removed sync storage logic
- Uses only `chrome.storage.local`
- Simplified get/set/clear methods

### 6. AgentConfig (`src/config/AgentConfig.ts`)

**Added methods:**
- `getAuthConfig(): IAuthConfig` - Get current auth config
- `updateAuthConfig(config: Partial<IAuthConfig>): IAuthConfig` - Update auth config

**Behavior:**
- Automatic validation on update
- Automatic timestamp update (`lastUpdated`)
- Asynchronous persistence to storage
- Change event emission for reactivity

### 7. ChromeAuthManager (`src/models/ChromeAuthManager.ts`)

**Refactored to use AgentConfig:**
- Added `agentConfig` dependency (optional constructor parameter with fallback to singleton)
- Updated `initialize()` to load from AgentConfig
- Updated `storeApiKey()` to use `agentConfig.updateAuthConfig()`
- Updated `retrieveApiKey()` to use `agentConfig.getAuthConfig()`
- Updated `clearAuth()` to use `agentConfig.updateAuthConfig()`
- Removed private `encrypt()` and `decrypt()` methods (now use utilities)
- Removed `STORAGE_KEYS` constant
- Removed direct `chrome.storage.local` calls

### 8. Settings UI (`src/sidepanel/Settings.svelte`)

**No changes required** - continues to use ChromeAuthManager interface, which now internally uses AgentConfig.


## Testing

### Unit Tests

**Encryption utilities** (`tests/utils/encryption.test.ts`):
- ✓ 15 tests covering encryption/decryption
- ✓ Round-trip data integrity
- ✓ Error handling for invalid input
- ✓ Edge cases (empty strings, long keys, special characters)

### Integration Tests

**AgentConfig auth methods** (`tests/config/AgentConfig.auth.test.ts`):
- ✓ getAuthConfig() returns defaults and configured values
- ✓ updateAuthConfig() validates, persists, and emits events
- ✓ Error handling and validation

### Existing Tests

All existing UI tests continue to pass without modification (use mocked ChromeAuthManager).

## API Reference

### AgentConfig.getAuthConfig()

Get current authentication configuration.

```typescript
const authConfig = agentConfig.getAuthConfig();
if (authConfig.apiKey) {
  console.log('API key is configured');
}
```

**Returns:** `IAuthConfig` - Current auth config or defaults

### AgentConfig.updateAuthConfig()

Update authentication configuration with validation and persistence.

```typescript
// Update API key
agentConfig.updateAuthConfig({
  apiKey: encryptApiKey('sk-ant-api03-...'),
  authMode: AuthMode.ApiKey
});

// Clear auth
agentConfig.updateAuthConfig({
  apiKey: '',
  accountId: null,
  planType: null
});
```

**Parameters:**
- `config: Partial<IAuthConfig>` - Partial auth config to merge

**Returns:** `IAuthConfig` - Updated complete auth config

**Throws:** `ConfigValidationError` if validation fails

**Side effects:**
- Automatically sets `lastUpdated` timestamp
- Persists to storage asynchronously
- Emits change event for reactivity

### Encryption Utilities

```typescript
import { encryptApiKey, decryptApiKey } from './utils/encryption';

// Encrypt before storing
const encrypted = encryptApiKey('sk-ant-api03-...');

// Decrypt when retrieving
const decrypted = decryptApiKey(encrypted);
if (decrypted) {
  // Use decrypted key
}
```

## Security Considerations

### Current Implementation

- Uses simple base64 encoding + string reversal
- **Not cryptographically secure** - provides basic obfuscation only
- Suitable for preventing casual inspection of storage

### Future Enhancements

Consider upgrading to:
- Web Crypto API for proper encryption
- Key derivation from user-specific data
- Hardware-backed key storage (where available)

### Best Practices

1. **Never log decrypted keys** - Always use masked values in logs
2. **Validate before encryption** - Ensure API key format is valid
3. **Clear on logout** - Always clear sensitive data when user signs out
4. **HTTPS only** - API keys only transmitted over HTTPS to providers

## Integration Checklist

If you're updating code that uses authentication:

- [ ] Use `AgentConfig.getAuthConfig()` instead of direct storage access
- [ ] Use `AgentConfig.updateAuthConfig()` instead of direct storage writes
- [ ] Use `encryptApiKey()` and `decryptApiKey()` from utilities
- [ ] Update tests to use new AgentConfig methods

## Troubleshooting

### "Invalid auth mode" error

**Cause:** Attempting to set an invalid `authMode` value

**Solution:** Use values from `AuthMode` enum: `AuthMode.ApiKey`, `AuthMode.ChatGPT`, or `AuthMode.Local`

### "Config not initialized" error

**Cause:** Attempting to access config before `initialize()` completes

**Solution:** Always `await agentConfig.waitForInitialization()` before accessing config

### Decryption returns null

**Cause:** Encrypted value is corrupted or invalid base64

**Solution:**
1. Verify the encrypted value is valid base64
2. Check if the value was encrypted with the same algorithm
3. Re-encrypt the API key if data is corrupted

## Performance Considerations

### Caching

- ConfigStorage includes 5-second cache to minimize storage reads
- AgentConfig maintains in-memory config state
- Only writes to storage on updates (not reads)

### Async Operations

- Storage operations are asynchronous and don't block
- Failed persistence is logged but doesn't throw
- Consider persistence delay when testing

## Related Files

### Core Implementation
- `src/config/types.ts` - Type definitions
- `src/config/defaults.ts` - Default values and constants
- `src/config/AgentConfig.ts` - Main configuration manager
- `src/config/validators.ts` - Validation functions
- `src/storage/ConfigStorage.ts` - Storage wrapper
- `src/utils/encryption.ts` - Encryption utilities

### Auth Layer
- `src/models/ChromeAuthManager.ts` - Auth manager (refactored)
- `src/models/types/Auth.ts` - Auth-related types

### UI
- `src/sidepanel/Settings.svelte` - Settings UI component

### Tests
- `tests/utils/encryption.test.ts` - Encryption tests
- `tests/config/AgentConfig.auth.test.ts` - Integration tests

## Version History

### 1.0.0 (Current)
- Initial refactoring to centralized configuration
- Encryption utilities extracted
- Comprehensive test coverage
- Simplified storage layer

## Contributing

When adding new authentication-related features:

1. Update `IAuthConfig` interface if needed
2. Add validation in `validateAuthConfig()`
3. Update defaults in `DEFAULT_AUTH_CONFIG`
4. Add tests for new functionality
5. Update this documentation

## Support

For questions or issues:
1. Check existing GitHub issues
2. Review test files for usage examples
3. Consult JSDoc comments in source code
