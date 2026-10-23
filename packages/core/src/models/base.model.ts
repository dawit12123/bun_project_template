import type { DomainEvent } from "../types/event.interface";

/** Immutable value compared by content. */
export abstract class ValueObject<TProps extends object> {
  protected readonly props: Readonly<TProps>;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  equals(other?: ValueObject<TProps>): boolean {
    if (!other || other.constructor !== this.constructor) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}

/** Object with identity; two entities are equal when their ids match. */
export abstract class Entity<TProps extends object> {
  readonly id: string;
  protected props: TProps;

  protected constructor(id: string, props: TProps) {
    this.id = id;
    this.props = props;
  }

  equals(other?: Entity<TProps>): boolean {
    return !!other && other.constructor === this.constructor && other.id === this.id;
  }
}

/** Consistency boundary that records the domain events produced by its state changes. */
export abstract class AggregateRoot<TProps extends object> extends Entity<TProps> {
  #pendingEvents: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.#pendingEvents.push(event);
  }

  /** Returns and clears pending events; call when the change is about to be persisted. */
  pullEvents(): DomainEvent[] {
    const events = this.#pendingEvents;
    this.#pendingEvents = [];
    return events;
  }
}
