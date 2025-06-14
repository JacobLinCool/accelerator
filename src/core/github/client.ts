import { Octokit } from "@octokit/rest";
import { Webhooks } from "@octokit/webhooks";
import type { Tool } from "../agent/tool";

export class GitHubClient {
    public readonly octokit: Octokit;
    public readonly webhooks: Webhooks;

    constructor(public readonly owner: string, public readonly repo: string, token: string, secret: string) {
        this.octokit = new Octokit({
            auth: token,
            userAgent: "Accelerator/1.0.0",
        });
        this.webhooks = new Webhooks({ secret });
    }

    public async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
        return await this.webhooks.verify(payload, signature);
    }

    public tool(): Tool {
        const octokit = this.octokit;
        return {
            def: {
                name: "github_graphql",
                description: "Execute a GraphQL query against the GitHub API",
                strict: true,
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The GraphQL query to execute",
                        },
                    },
                    required: ["query"],
                    additionalProperties: false,
                },
            },
            async exe(param: { query: string }): Promise<unknown> {
                const response = await octokit.graphql(param.query);
                return response;
            }
        }
    }
}
