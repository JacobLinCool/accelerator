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
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            {
                role: "developer",
                content: `${GENERAL_PROMPT}\n\n---\n${task}`,
            },
        ];
        tools = [...tools, taskCompletionTool];

        let toolCalls = 0;
        while (true) {
            if (toolCalls >= Agent.MAX_TOOL_CALLS) {
                tools = [toolLimitReachedTool];
            }

            const res = await this.client.chat.completions.create({
                model: "o4-mini",
                messages,
                tools: tools.map((tool) => ({
                    type: "function",
                    function: tool.def,
                })),
                tool_choice: "required",
            });

            const choice = res.choices[0];
            if (!choice || !choice.message) {
                throw new Error("No response from OpenAI");
            }

            const message = choice.message;
            if (message.tool_calls) {
                messages.push(message);

                if (message.content) {
                    console.log("Message with tool calls:", message.content);
                }

                for (const toolCall of message.tool_calls) {
                    if (toolCall.function) {
                        const tool = tools.find((t) => t.def.name === toolCall.function.name);
                        if (!tool) {
                            throw new Error(`Tool ${toolCall.function.name} not found`);
                        }
                        console.log(`Calling tool: ${toolCall.function.name} with args:`, toolCall.function.arguments);

                        if (toolCall.function.name === DONE_TOOL_NAME) {
                            return JSON.parse(toolCall.function.arguments).message as string;
                        }

                        try {
                            const result = await tool.exe(JSON.parse(toolCall.function.arguments));
                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify(result),
                            });
                        } catch (error) {
                            console.error(`Error calling tool ${toolCall.function.name}:`, error);
                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({
                                    error: `Failed to execute tool ${toolCall.function.name}: ${error instanceof Error ? error.message : String(error)}`,
                                }),
                            });
                        }
                    }
                }
            } else {
                throw new Error("No tool calls in OpenAI response");
            }

            toolCalls++;
        }

        // unreachable
    }
}
