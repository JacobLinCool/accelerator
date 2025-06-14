import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { Agent, GitHubClient } from "../core";
import { createSleepTool } from "../core/agent/tool";
import dedent from "dedent";

export interface IssueTrackingParams {
    owner: string;
    repo: string;
    issueNumber: number;
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

        await step.do("Check Assignees", async () => {
            return await agent.run(
                dedent`
                1. Check your note for available engineers and assign one to the issue #${issueNumber} in ${owner}/${repo} if there are no assignees yet.
                2. Check if there is a branch linked to the issue. If not, create a branch with prefix "issue-${issueNumber}-" and link it to the issue. (linkedBranch)
                3. Add a comment to the issue, pinging the assigned engineer, to notify them about the assignment and branch creation.
                `,
                [githubClient.tool()]
            );
        });

        let lastCheckTime = new Date();
        const waitForFirstCheck = await step.do("Wait for first check", async () => {
            return Promise.race([
                step.sleep("wait-for-first-check", "1 day").then(() => {
                    return { stopped: false as const, lastCheckTime: new Date() };
                }),
                stop,
            ]);
        });
        if (waitForFirstCheck.stopped) {
            return;
        }
        lastCheckTime = waitForFirstCheck.lastCheckTime;

        for (let i = 0; i < 20; i++) {
            const sleepTool = createSleepTool();
            const checkTaskStatus = await step.do(`Check Task Status ${i + 1}`, async () => {
                await agent.run(
                    dedent`
                        1. Check the status of the task in issue #${issueNumber} in ${owner}/${repo}.
                        2. Check if the assigned engineer has made reasonable progress on the task since the last check.
                        3. If the assigned engineer has made progress, update the issue with the current status and any relevant information.
                        4. If the assigned engineer has not made progress, remind them to provide an update.
                        5. Set a reminder to check the task status again, the duration range is 1-3 days, based on the task complexity, urgency, and the assigned engineer's workload.
                        `,
                    [githubClient.tool(), sleepTool.tool]
                );
                return { lastCheckTime: new Date() };
            });
            lastCheckTime = checkTaskStatus.lastCheckTime;

            const waitForNextCheck = await step.do(`Wait for Next Check ${i + 1}`, async () => {
                const duration = sleepTool.sleeper.duration || "1 day";
                return Promise.race([
                    step.sleep("wait-for-next-check", duration).then(() => {
                        return { stopped: false as const };
                    }),
                    stop,
                ]);
            });
            if (waitForNextCheck.stopped) {
                return;
            }
        }
    }
}
