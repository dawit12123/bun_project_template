import type { HttpRequestLabels, MetricsRecorder } from "@driversim/core";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export interface PrometheusMetricsOptions {
  serviceName: string;
  collectDefaults: boolean;
}

/** Prometheus adapter. Each instance owns its registry, so tests never share global state. */
export class PrometheusMetrics implements MetricsRecorder {
  readonly registry = new Registry();
  readonly contentType: string;
  readonly #httpRequests: Counter<"method" | "route" | "status">;
  readonly #httpDuration: Histogram<"method" | "route" | "status">;
  readonly #outboxPublished: Counter;
  readonly #outboxFailed: Counter;
  readonly #rateLimited: Counter<"limiter">;

  constructor(options: PrometheusMetricsOptions) {
    this.registry.setDefaultLabels({ service: options.serviceName });
    this.contentType = this.registry.contentType;

    if (options.collectDefaults) {
      try {
        collectDefaultMetrics({ register: this.registry });
      } catch {
        // Some runtime collectors are unavailable on Bun; HTTP/business metrics still work.
      }
    }

    this.#httpRequests = new Counter({
      name: "http_requests_total",
      help: "Completed HTTP requests.",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
    });
    this.#httpDuration = new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request latency.",
      labelNames: ["method", "route", "status"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.#outboxPublished = new Counter({
      name: "outbox_messages_published_total",
      help: "Outbox messages delivered to the broker.",
      registers: [this.registry],
    });
    this.#outboxFailed = new Counter({
      name: "outbox_messages_failed_total",
      help: "Outbox delivery attempts that failed.",
      registers: [this.registry],
    });
    this.#rateLimited = new Counter({
      name: "http_rate_limited_total",
      help: "Requests rejected by a rate limiter.",
      labelNames: ["limiter"],
      registers: [this.registry],
    });
  }

  observeHttpRequest(labels: HttpRequestLabels, durationSeconds: number): void {
    const values = { method: labels.method, route: labels.route, status: String(labels.status) };
    this.#httpRequests.inc(values);
    this.#httpDuration.observe(values, durationSeconds);
  }

  recordOutboxPublished(count: number): void {
    this.#outboxPublished.inc(count);
  }

  recordOutboxFailed(count: number): void {
    this.#outboxFailed.inc(count);
  }

  recordRateLimited(limiter: string): void {
    this.#rateLimited.inc({ limiter });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
