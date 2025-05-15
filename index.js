import core from "@actions/core";
import { action } from "./src/action";

action().catch((error) => {
  // Action threw an error. Fail the action with the error message.
  core.setFailed(`${error.message} ${JSON.stringify(error)}`);
});
