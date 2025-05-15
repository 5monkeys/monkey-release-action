/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};
const core = require("@actions/core");
const { action } = require("./src/action");

action().catch((error) => {
  // Action threw an error. Fail the action with the error message.
  core.setFailed(`${error.message} ${JSON.stringify(error)}`);
});

