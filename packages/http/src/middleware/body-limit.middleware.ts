import { Errors } from "@driversim/core";
import { bodyLimit } from "hono/body-limit";

export const requestBodyLimit = (maxBytes: number) =>
  bodyLimit({
    maxSize: maxBytes,
    onError: () => {
      throw Errors.payloadTooLarge();
    },
  });
