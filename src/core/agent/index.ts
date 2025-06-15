import { OpenAI } from "openai";
import { GENERAL_PROMPT } from "./prompt";
import { taskCompletionTool, toolLimitReachedTool, Tool, DONE_TOOL_NAME } from "./tool";

export class Agent {
    private client: OpenAI;
    private static readonly MAX_TOOL_CALLS = 20;

    constructor(apiKey: string) {
        this.client = new OpenAI({ apiKey });
    }

    async run(task: string, tools: Tool[] = []): Promise<string> {
        // Keep track of conversation context as simple text
        let input: OpenAI.Responses.ResponseInput = [
            {
                'role': 'developer',
                'content': `${GENERAL_PROMPT}\n\n---\n${task}`,
            }
        ];
        tools = [...tools, taskCompletionTool];

        let toolCalls = 0;
        while (true) {
            if (toolCalls >= Agent.MAX_TOOL_CALLS) {
                tools = [toolLimitReachedTool];
            }

            // Use the Responses API which is designed for tool use
            const res = await this.client.responses.create({
                model: "o4-mini",
                input,
                tools: tools.map((tool) => ({
                    type: "function",
                    ...tool.def,
                })),
                tool_choice: "required",
            });

            // Handle different response statuses
            if (res.status === 'completed') {
                // Response completed successfully
                // Process tool calls from the output
                for (const outputItem of res.output) {
                    if (outputItem.type === 'function_call') {
                        const toolCall = outputItem;
                        const tool = tools.find((t) => t.def.name === toolCall.name);
                        if (!tool) {
                            throw new Error(`Tool ${toolCall.name} not found`);
                        }

                        console.log(`Calling tool: ${toolCall.name} with args:`, toolCall.arguments);

                        if (toolCall.name === DONE_TOOL_NAME) {
                            const args = typeof toolCall.arguments === 'string'
                                ? JSON.parse(toolCall.arguments)
                                : toolCall.arguments;
                            return args.message as string;
                        }

                        try {
                            const args = typeof toolCall.arguments === 'string'
                                ? JSON.parse(toolCall.arguments)
                                : toolCall.arguments;
                            const result = await tool.exe(args);

                            input.push(toolCall);
                            input.push({
                                type: 'function_call_output',
                                call_id: toolCall.call_id,
                                output: JSON.stringify(result),
                            });
                        } catch (error) {
                            console.error(`Error calling tool ${toolCall.name}:`, error);
                            input.push({
                                type: 'function_call_output',
                                call_id: toolCall.call_id,
                                output: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
                            });
                        }
                    } else if (outputItem.type === 'reasoning') {
                        input.push(outputItem);
                    }
                }
            } else if (res.status === 'in_progress') {
                // Handle in-progress status - might need to poll or wait
                throw new Error("Response is still in progress - this shouldn't happen with synchronous calls");
            } else if (res.status === 'failed') {
                throw new Error("Response failed");
            } else {
                // Fallback for unknown response structure
                console.log("Unknown response structure:", res);
                throw new Error("Unknown response structure from OpenAI");
            }

            toolCalls++;
        }

        // unreachable
    }
}
