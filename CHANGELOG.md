# Changelog

All notable changes to the Codex Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Phase 9: Performance & Polish (T024-T027)

##### SSEEventParser Optimizations (T024)
- **Memory Pooling**: Added `EventPool` class for reusing event objects to reduce GC pressure
- **Hot Path Optimization**: Implemented `EVENT_TYPE_CACHE` for faster event type lookups
- **Lazy Parsing**: Early exit for ignored event types to skip unnecessary processing
- **Performance Monitoring**: Built-in metrics tracking with < 10ms target per event
- **Batch Processing**: Added `processBatch()` method for processing multiple events efficiently

New APIs:
```typescript
// Performance monitoring
getPerformanceMetrics(): { totalProcessed: number; averageTime: number; isWithinTarget: boolean }
resetPerformanceMetrics(): void

// Batch processing
processBatch(dataArray: string[]): ResponseEvent[]
```

##### Request Queue System (T025)
- **Priority-based FIFO Queue**: Support for Urgent, High, Normal, and Low priority requests
- **Rate Limiting**: Configurable per-minute, per-hour, and burst limits
- **Persistence**: Queue state survives Chrome extension restarts via chrome.storage
- **Retry Logic**: Exponential backoff with configurable maximum retries
- **Queue Analytics**: Success rates, wait times, and trend analysis

New APIs:
```typescript
// Queue management
enqueue(request: CompletionRequest, priority: RequestPriority, options?: QueueOptions): string
dequeue(requestId: string): boolean
getStatus(): QueueStatus
getAnalytics(): QueueAnalytics

// Queue control
pause(): void
resume(): void
clear(): void
```

##### Enhanced Model Client Integration
- **Streaming Improvements**: Better SSE parsing with error recovery
- **Memory Management**: Buffer pooling and cleanup for long-running sessions
- **Queue Integration**: Automatic request queuing with priority support

### Changed

#### Breaking Changes
- `SSEEventParser.parse()` now uses memory pooling - events should not be modified after processing
- Performance metrics are now tracked automatically for all parsing operations

#### Performance Improvements
- Event processing optimized to target < 10ms per event
- Memory usage reduced through object pooling
- Request queuing prevents API rate limit violations
- Batch processing for multiple SSE events

### Technical Improvements

#### Memory Management
- Added `EventPool` class for object reuse
- Automatic cleanup of old queue entries (> 1 hour)
- Limited request history size (max 1000 entries)

#### Error Handling
- Enhanced malformed SSE event recovery
- Retry logic with exponential backoff
- Graceful degradation when rate limits are hit

#### Monitoring & Analytics
- Real-time performance metrics
- Queue status and analytics
- Request success/failure tracking
- Processing time monitoring

### Migration Guide

#### SSEEventParser Changes
If you were directly modifying parsed events, you now need to be careful as they may be pooled objects:

```typescript
// Before
const event = parser.parse(data);
event.customProperty = 'modified'; // Don't do this anymore

// After
const event = parser.parse(data);
const myEvent = { ...event, customProperty: 'modified' }; // Copy first
```

#### Queue Integration
The new RequestQueue can be integrated with existing model clients:

```typescript
// Create queue with rate limiting
const queue = new RequestQueue({
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  burstLimit: 10
});

// Queue requests with priority
const requestId = queue.enqueue(completionRequest, RequestPriority.HIGH, {
  maxRetries: 3,
  onComplete: (response) => console.log('Success:', response),
  onError: (error) => console.error('Failed:', error)
});
```

#### Performance Monitoring
Monitor parsing performance:

```typescript
const parser = new SSEEventParser();

// Process events
parser.parse(data);
parser.processEvent(event);

// Check performance
const metrics = parser.getPerformanceMetrics();
if (!metrics.isWithinTarget) {
  console.warn(`Average processing time: ${metrics.averageTime}ms (target: <10ms)`);
}
```

### Dependencies

No new external dependencies were added. All optimizations use built-in browser APIs and TypeScript features.

### Compatibility

- Chrome Extension Manifest V3 compatible
- Maintains backward compatibility with existing Event/Submission patterns
- Works with all existing model client implementations

---

## Development Notes

### Testing Performance Improvements
Run the test suite to verify performance improvements:

```bash
npm run test
```

Performance tests validate:
- Event processing stays under 10ms target
- Memory pooling reduces allocations
- Queue operations are efficient
- Rate limiting works correctly

### Future Improvements
- WebWorker support for heavy processing
- IndexedDB integration for larger queue persistence
- Advanced queue scheduling algorithms
- Compression for stored queue data