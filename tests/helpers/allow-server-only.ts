// Lets unit tests import modules marked `import "server-only"`: outside Next's
// react-server build that package throws on import, so stub it before they load.
// Import this first; tsx runs tests as CommonJS, in import order.
const id = require.resolve("server-only");
require.cache[id] = { id, filename: id, loaded: true, exports: {} } as unknown as NodeJS.Module;
