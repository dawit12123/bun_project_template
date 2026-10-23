export interface HttpRequestLabels {
  method: string;
  route: string;
  status: number;
}

export interface MetricsRecorder {
  observeHttpRequest(labels: HttpRequestLabels, durationSeconds: number): void;
  recordOutboxPublished(count: number): void;
  recordOutboxFailed(count: number): void;
  recordRateLimited(limiter: string): void;
  render(): Promise<string>;
  readonly contentType: string;
}
