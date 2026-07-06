
// ============================================================================
// Circuit Breaker
// ============================================================================
export class CircuitBreaker {
    private failures = 0;
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private lastFailureTime = 0;
    private readonly threshold = 5;
    private readonly timeout = 60000;

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
        if (Date.now() - this.lastFailureTime > this.timeout) {
            this.state = 'HALF_OPEN';
        } else {
            throw new ApnsHttp3Error('Circuit breaker is OPEN', undefined, undefined, undefined, true);
        }
        }

        try {
        const result = await fn();
        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
            this.failures = 0;
        }
        return result;
        } catch (err) {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
        }
        throw err;
        }
    }

    getState(): string { return this.state; }
}