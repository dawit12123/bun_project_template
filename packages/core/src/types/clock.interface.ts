export interface Clock {
  now(): Date;
}

export type IdGenerator = () => string;
