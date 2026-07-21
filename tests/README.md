# MeansTV Grayjay Plugin Test Suite

These Bun tests exercise the shipped TypeScript modules under `src/` through a mocked Grayjay runtime. They intentionally avoid copying parser or factory logic into the tests.

## Running Tests

```bash
# Full suite, from the repository root
bun test --preload ./tests/setup.ts

# Individual files
bun test --preload ./tests/setup.ts tests/parsers.test.ts
bun test --preload ./tests/setup.ts tests/utilities.test.ts
bun test --preload ./tests/setup.ts tests/factories.test.ts
bun test --preload ./tests/setup.ts tests/api-pagers-source.test.ts
```

## Test Files

- `setup.ts` installs Grayjay runtime mocks, a linkedom-backed `domParser`, and configurable `http.GET` route responses.
- `utilities.test.ts` covers duration and URL normalization boundaries.
- `parsers.test.ts` covers the real catalog/content parsers using fixtures from `tests/fixtures`.
- `factories.test.ts` covers conversion from parsed domain data to mocked Grayjay `Platform*` objects.
- `api-pagers-source.test.ts` covers API calls, pagers, and `source` method wiring through mocked GET routes.
