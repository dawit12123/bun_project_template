import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { AppError } from "../src/errors/app.error";
import { emailField, ethiopianPhoneField, validateWith } from "../src/validation/validator";

describe("common field validators", () => {
  test.each([
    ["0911234567", "+251911234567"],
    ["+251 911 234 567", "+251911234567"],
    ["251711234567", "+251711234567"],
    ["0711-234-567", "+251711234567"],
  ])("normalizes Ethiopian mobile %s", (input, expected) => {
    expect(ethiopianPhoneField().parse(input)).toBe(expected);
  });

  test.each(["0811234567", "+25191123456", "12345", "+1 555 0100"])("rejects %s", (input) => {
    expect(ethiopianPhoneField().safeParse(input).success).toBe(false);
  });

  test("emails are trimmed and lower-cased", () => {
    expect(emailField().parse("  Abebe@Example.COM ")).toBe("abebe@example.com");
  });

  test("validateWith throws VALIDATION_FAILED with prefixed paths", () => {
    try {
      validateWith(z.object({ name: z.string().min(2) }), { name: "a" }, "body");
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("VALIDATION_FAILED");
      expect((error as AppError).details?.[0]?.path).toBe("body.name");
    }
  });
});
