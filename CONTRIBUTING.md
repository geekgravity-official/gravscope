# Contributing

GravScope is maintained by GeekGravity. Small bug fixes and focused improvements are welcome. Open an issue before a large feature or API change.

Use Node.js 22.12+ and run `npm ci`. Start the demo with `npm run dev`.

Before submitting a pull request, run:

```sh
npm run typecheck
npm test
npm run build
npm run check:package
```

Describe the observed problem, expected behavior and how you verified the fix. Add regression coverage for capture, lifecycle or serialization changes. For UI changes, include light/dark screenshots and report the browser/device used. Never include real credentials, private request bodies or customer logs in issues or fixtures.

Keep dependencies and shipped bundle size small. Capture failures must not change host-page behavior. Preserve wrappers owned by other tools on teardown. Document browser API limitations instead of inferring device support from ES5 syntax alone.

Do not commit `dist`, `node_modules`, package archives or credentials. Maintainers build the release artifacts from source.
