import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { Agent, GitHubClient } from "../core";
import { createSleepTool } from "../core/agent/tool";
import dedent from "dedent";

export interface IssueTrackingParams {
    owner: string;
    repo: string;
    issueNumber: number;
}

export interface CheckResult {
    lastCheckTime: Date;
    sleepDuration: WorkflowSleepDuration;
}

export class IssueTrackingWorkflow extends WorkflowEntrypoint<Env, IssueTrackingParams> {
    async run(event: WorkflowEvent<IssueTrackingParams>, step: WorkflowStep) {
        const { owner, repo, issueNumber } = event.payload;

        // Initialize services
        const githubClient = new GitHubClient(owner, repo, this.env.GITHUB_TOKEN, this.env.GITHUB_WEBHOOK_SECRET);
        const agent = new Agent(this.env.OPENAI_API_KEY);

        const stop = step.waitForEvent("stop-tracking", { type: "stop-tracking" }).then(() => {
            console.log("Stopping issue tracking workflow");
            return { stopped: true as const };
        });

        function waitOrStop(name: string, t: WorkflowSleepDuration): Promise<{ stopped: boolean }> {
            return Promise.race([step.sleep(name, t).then(() => ({ stopped: false as const })), stop]);
        }

        let result: CheckResult = { lastCheckTime: new Date(), sleepDuration: 0 };
        result = await step.do<CheckResult>("Initialize Issue Tracking", async () => {
            const sleepTool = createSleepTool();
            await agent.run(
                dedent`
                Current time is ${new Date().toISOString()}.
                Please follow these steps to initialize the issue tracking workflow:
                1. Checkout the conversation history of issue #${issueNumber} in ${owner}/${repo}.
                2. Check your note for available engineers and assign one to the issue #${issueNumber} if there are no assignees yet.
                3. Check if there is a branch linked to the issue. (linkedBranches) If not, create a branch with prefix "issue-${issueNumber}-" and link it to the issue. (must use createLinkedBranch in graphql)
                4. If any changes did, add a comment to the issue, pinging the assigned engineer, to notify them about the assignment and branch creation. (Don't say anything if no changes were made)
                5. Set a reminder to check the task status again, the duration range is 1-3 days, based on the task complexity, urgency, and the assigned engineer's workload.
                `,
                [githubClient.tool(), sleepTool.tool]
            );
            return { lastCheckTime: new Date(), sleepDuration: sleepTool.sleeper.duration || "1 day" };
        });

        let w = await waitOrStop("wait-for-initial-check", result.sleepDuration);
        if (w.stopped) {
            return;
        }

        for (let i = 0; i < 20; i++) {
            const sleepTool = createSleepTool();
            result = await step.do<CheckResult>(`Check Task Status ${i + 1}`, async () => {
                await agent.run(
                    dedent`
                        Last check was made at ${result.lastCheckTime.toISOString()}. Current time is ${new Date().toISOString()}.
                        Please follow these steps to check the task status:
                        1. Check the conversation history of issue #${issueNumber} in ${owner}/${repo}.
                        2. Check if the assigned engineer has made reasonable progress in the linked branch after the last check.
                        3. If the assigned engineer has made progress, update the issue with the current status and any relevant information.
                        4. If the assigned engineer has not made progress, remind them to provide an update.
                        5. Set a reminder to check the task status again, the duration range is 1-3 days, based on the task complexity, urgency, and the assigned engineer's workload.
                        `,
                    [githubClient.tool(), sleepTool.tool]
                );
                return { lastCheckTime: new Date(), sleepDuration: sleepTool.sleeper.duration || "1 day" };
            });

            w = await waitOrStop(`wait-for-check-${i + 1}`, result.sleepDuration);
            if (w.stopped) {
                console.log("Stopping issue tracking workflow after check", i + 1);
                return;
            }
        }
    }
}
