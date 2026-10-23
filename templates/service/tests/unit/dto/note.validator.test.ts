import { describe, expect, test } from "bun:test";
import { validateCreateNote, validateUpdateNote } from "@/dto/note/validator";
import { AppError } from "@driversim/core";

/** EXAMPLE DOMAIN validator tests. */
describe("note validators", () => {
  test("validateCreateNote trims and applies defaults", () => {
    expect(validateCreateNote({ title: " Hi " })).toEqual({ title: "Hi", body: "" });
  });

  test("validateUpdateNote requires a change and a version", () => {
    try {
      validateUpdateNote({ version: 1 });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).details?.[0]?.path).toBe("body.title");
    }
    expect(() => validateUpdateNote({ title: "x" })).toThrow(AppError);
  });
});
