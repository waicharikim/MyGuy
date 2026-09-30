import { createTask } from "./create_task";
import { createNote } from "./create_note";
import { scheduleFollowup } from "./schedule_followup";
import { logDecisionState } from "./log_decision_state";

export const ToolRegistry = {
  create_task: createTask,
  create_note: createNote,
  schedule_followup: scheduleFollowup,
  log_decision_state: logDecisionState,
};

export type ToolName = keyof typeof ToolRegistry;
