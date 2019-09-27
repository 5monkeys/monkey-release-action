const core = require("@actions/core");
const { action } = require("./src/action");

action().catch(error => {
  core.setFailed(error.message);
});
