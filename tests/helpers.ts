import { isRecord } from "../src/utilities/guards";

const fixtureBase = new URL("./fixtures/", import.meta.url);

export function readFixture(name: string): Promise<string> {
  return Bun.file(new URL(name, fixtureBase)).text();
}

export function requireRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  throw new Error("Expected an object record");
}

export function requireArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  throw new Error("Expected an array");
}

export function parseJsonRecord(text: string): Record<string, unknown> {
  return requireRecord(JSON.parse(text));
}
