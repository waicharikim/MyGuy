"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const create_task_1 = require("./create_task");
const create_note_1 = require("./create_note");
const schedule_followup_1 = require("./schedule_followup");
const log_decision_state_1 = require("./log_decision_state");
exports.ToolRegistry = {
    create_task: create_task_1.createTask,
    create_note: create_note_1.createNote,
    schedule_followup: schedule_followup_1.scheduleFollowup,
    log_decision_state: log_decision_state_1.logDecisionState,
};
