import { Octokit } from "@octokit/rest";
import { Webhooks } from "@octokit/webhooks";
import { createAppAuth } from "@octokit/auth-app";
import type { Tool } from "../agent/tool";

export interface GitHubPATAuth {
    type: "pat";
    token: string;
}

export interface GitHubAppAuth {
    type: "app";
    appId: string;
    privateKey: string;
    installationId: string;
}

export type GitHubAuth = GitHubPATAuth | GitHubAppAuth;

export class GitHubClient {
    public readonly octokit: Octokit;
    public readonly webhooks: Webhooks;

    constructor(public readonly owner: string, public readonly repo: string, auth: GitHubAuth, secret: string) {
        if (auth.type === "pat") {
            this.octokit = new Octokit({
                auth: auth.token,
                userAgent: "Accelerator/1.0.0",
            });
        } else {
            this.octokit = new Octokit({
                authStrategy: createAppAuth,
                auth: {
                    appId: auth.appId,
                    privateKey: auth.privateKey,
                    installationId: auth.installationId,
                },
                userAgent: "Accelerator/1.0.0",
            });
        }
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

    public static create(owner: string, repo: string, env: Env): GitHubClient {
        // Check if GitHub App credentials are available
        if (env.GITHUB_APP_ID && env.GITHUB_PRIVATE_KEY && env.GITHUB_INSTALLATION_ID) {
            const auth: GitHubAppAuth = {
                type: "app",
                appId: env.GITHUB_APP_ID,
                privateKey: env.GITHUB_PRIVATE_KEY,
                installationId: env.GITHUB_INSTALLATION_ID,
            };
            return new GitHubClient(owner, repo, auth, env.GITHUB_WEBHOOK_SECRET);
        }

        // Fall back to Personal Access Token
        if (env.GITHUB_TOKEN) {
            const auth: GitHubPATAuth = {
                type: "pat",
                token: env.GITHUB_TOKEN,
            };
            return new GitHubClient(owner, repo, auth, env.GITHUB_WEBHOOK_SECRET);
        }

        throw new Error("No GitHub authentication method available. Please provide either GITHUB_TOKEN or GitHub App credentials (GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_INSTALLATION_ID).");
    }
}