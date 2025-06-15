import { OpenAI } from "openai";

export type Tool<O = any> = {
    def: Omit<OpenAI.Responses.FunctionTool, "type">;
    exe: (...param: any[]) => Promise<O>
};

export const DONE_TOOL_NAME = "done";

export const taskCompletionTool: Tool<string> = {
    def: {
        name: DONE_TOOL_NAME,
        description:
            "Mark the task as successfully completed and end the conversation. Use this when the task has been finished or when temporarily pausing (e.g., waiting for external input or dependencies).",
        strict: true,
        parameters: {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "A comprehensive summary message explaining what was accomplished and the current status of the task.",
                },
            },
            required: ["message"],
            additionalProperties: false,
        },
    },
    exe: async (params: { message: string }) => {
        return params.message;
    },
};

export const toolLimitReachedTool: Tool<string> = {
    def: {
        name: DONE_TOOL_NAME,
        description:
            "Terminate the task execution because the maximum number of tool calls has been reached. Use this when the agent has exhausted its allowed tool usage quota and must stop processing.",
        strict: true,
        parameters: {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description:
                        "An explanatory message indicating that the task cannot be completed due to reaching the tool call limit, along with any partial progress made.",
                },
            },
            required: ["message"],
            additionalProperties: false,
        },
    },
    exe: async (params: { message: string }) => {
        return params.message;
    },
};


type Sleeper = { duration: number | null };

export function createSleepTool(): {
    tool: Tool;
    sleeper: Sleeper;
} {
    const sleeper: Sleeper = { duration: null };

    const tool: Tool = {
        def: {
            name: "wait",
            description: "Setup an alert to wait for a specified duration before proceeding.",
            strict: true,
            parameters: {
                type: "object",
                properties: {
                    duration: {
                        type: "number",
                        description: "The duration to wait before proceeding, in milliseconds.",
                    },
                    reason: {
                        type: "string",
                        description: "Short reason for the wait.",
                    },
                },
                required: ["duration", "reason"],
                additionalProperties: false,
            },
        },
        exe: async (param: { duration: number; reason: string }) => {
            if (param.duration < 0) {
                throw new Error("Duration must be a non-negative number.");
            }

            console.log(`Waiting for ${param.duration} milliseconds... Reason: ${param.reason}`);
            sleeper.duration = param.duration;

            return `Set up a wait for ${param.duration} milliseconds.`;
        },
    };

    return { tool, sleeper };
}
