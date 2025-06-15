import type { HandlerFunction } from "@octokit/webhooks/dist-types/types";
import { GitHubClient } from "./core/github/client";
import { IssueTrackingParams } from "./workflows/issue-tracking";

type GitHubWebhookEvent = Parameters<
    HandlerFunction<
        | "issues.opened"
        | "issues.reopened"
        | "issues.edited"
        | "issues.closed"
        | "issues.labeled"
        | "issues.unlabeled"
        | "issues.assigned"
        | "issues.unassigned"
    >
>[0]["payload"];

export async function handleGitHubWebhook(req: Request, env: Env): Promise<Response> {
    try {
        // Get headers
        const signature = req.headers.get("x-hub-signature-256");
        const event = req.headers.get("x-github-event");

        if (!signature || !event) {
            return Response.json({ error: "Missing required headers" }, { status: 400 });
        }

        // Get payload
        const payload = await req.text();

        // Parse webhook data
        let webhookData: GitHubWebhookEvent;
        try {
            webhookData = JSON.parse(payload);
        } catch (error) {
            return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
        }

        // Only handle issue events
        if (event !== "issues" || !webhookData.issue || !webhookData.repository) {
            return Response.json({ message: "Event ignored" });
        }

        // Verify webhook signature
        const githubClient = GitHubClient.create(webhookData.repository.owner.login, webhookData.repository.name, env);

        const isValid = await githubClient.verifyWebhookSignature(payload, signature);
        if (!isValid) {
            return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        // Only process specific actions
        const validActions = ["opened", "reopened", "closed", "labeled", "unlabeled"];
        if (!validActions.includes(webhookData.action)) {
            return Response.json({ message: "Action ignored" });
        }

        switch (webhookData.action) {
            case "opened":
            case "reopened": {
                // check if label accelerator-managed is present
                if (webhookData.issue.labels?.some((label) => label?.name === "accelerator-managed")) {
                    const workflowParams: IssueTrackingParams = {
                        owner: webhookData.repository.owner.login,
                        repo: webhookData.repository.name,
                        issueNumber: webhookData.issue.number,
                    };

                    const instance = await env.ISSUE_TRACKING_WORKFLOW.create({
                        id: `issue-${webhookData.repository.owner.login}-${webhookData.repository.name}-${webhookData.issue.number}`,
                        params: workflowParams,
                    });

                    return Response.json({
                        message: "New issue tracking workflow started",
                        workflowInstanceId: instance.id,
                        issueNumber: webhookData.issue.number,
                        action: webhookData.action,
                    });
                }
                return Response.json({
                    message: "Issue opened or reopened without accelerator-managed label",
                    issueNumber: webhookData.issue.number,
                    action: webhookData.action,
                });
            }
            case "labeled": {
                // if label accelerator-managed is added, start workflow
                if (webhookData.label?.name === "accelerator-managed") {
                    const workflowParams: IssueTrackingParams = {
                        owner: webhookData.repository.owner.login,
                        repo: webhookData.repository.name,
                        issueNumber: webhookData.issue.number,
                    };

                    const instance = await env.ISSUE_TRACKING_WORKFLOW.create({
                        id: `issue-${webhookData.repository.owner.login}-${webhookData.repository.name}-${webhookData.issue.number}`,
                        params: workflowParams,
                    });

                    return Response.json({
                        message: "Issue tracking workflow started for labeled issue",
                        workflowInstanceId: instance.id,
                        issueNumber: webhookData.issue.number,
                        action: webhookData.action,
                    });
                }
                return Response.json({
                    message: "Issue labeled without accelerator-managed label",
                    issueNumber: webhookData.issue.number,
                    action: webhookData.action,
                });
            }
            case "closed": {
                // if issue is closed, send event to existing workflow
                try {
                    const instanceId = `issue-${webhookData.repository.owner.login}-${webhookData.repository.name}-${webhookData.issue.number}`;
                    const instance = await env.ISSUE_TRACKING_WORKFLOW.get(instanceId);

                    // Send closure event to the workflow
                    await instance.sendEvent({
                        type: "stop-tracking",
                        payload: {
                            action: "closed",
                            timestamp: new Date().toISOString(),
                        },
                    });

                    return Response.json({
                        message: "Issue closure event sent to workflow",
                        workflowInstanceId: instanceId,
                        issueNumber: webhookData.issue.number,
                        action: webhookData.action,
                    });
                } catch (error) {
                    console.log("No active workflow found for closed issue:", webhookData.issue.number);
                    return Response.json({
                        message: "No active workflow found for this issue",
                    });
                }
            }
            case "unlabeled": {
                // if label accelerator-managed is removed, terminate workflow
                if (webhookData.label?.name === "accelerator-managed") {
                    try {
                        const instanceId = `issue-${webhookData.repository.owner.login}-${webhookData.repository.name}-${webhookData.issue.number}`;
                        const instance = await env.ISSUE_TRACKING_WORKFLOW.get(instanceId);

                        // Send unlabeled event to the workflow
                        await instance.sendEvent({
                            type: "stop-tracking",
                            payload: {
                                action: "unlabeled",
                                timestamp: new Date().toISOString(),
                            },
                        });

                        return Response.json({
                            message: "Issue tracking workflow stopped for unlabeled issue",
                            workflowInstanceId: instanceId,
                            issueNumber: webhookData.issue.number,
                            action: webhookData.action,
                        });
                    } catch (error) {
                        console.log("No active workflow found for unlabeled issue:", webhookData.issue.number);
                        return Response.json({
                            message: "No active workflow found for this issue",
                        });
                    }
                }
            }
        }

        // For other actions (assigned, etc.), just log them for now
        return Response.json({
            message: "Webhook received and logged",
            action: webhookData.action,
            issueNumber: webhookData.issue.number,
        });
    } catch (error) {
        console.error("Error processing GitHub webhook:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
