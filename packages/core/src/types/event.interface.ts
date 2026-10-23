/** Raised inside an aggregate; converted to an EventEnvelope before leaving the service. */
export interface DomainEvent<TPayload = unknown> {
  readonly type: string;
  readonly version: number;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

/** Wire format shared by every DriverSim service on Redpanda/Kafka. */
export interface EventEnvelope<TData = unknown> {
  id: string;
  type: string;
  version: number;
  source: string;
  occurredAt: string;
  subject: string;
  schoolId: string | null;
  correlationId: string | null;
  causationId: string | null;
  data: TData;
}

export interface OutboundMessage<TData = unknown> {
  topic: string;
  /** Partition key; events for the same subject keep their order. */
  key: string;
  envelope: EventEnvelope<TData>;
}
