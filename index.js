const core = require("@actions/core");
const { action } = require("./src/action");

action().catch((error) => {
  // Action threw an error. Fail the action with the error message.
  core.setFailed(`${error.message} ${JSON.stringify(error)}`);
});
