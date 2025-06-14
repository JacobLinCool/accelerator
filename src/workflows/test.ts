import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";

export interface TestParams {}

export class TestWorkflow extends WorkflowEntrypoint<Env, TestParams> {
    async run(event: WorkflowEvent<TestParams>, step: WorkflowStep) {
        const res = await step.do("wait-test", async () => {
            return await Promise.race([step.waitForEvent("issue.opened", { type: "issues.opened", timeout: 5000 })]);
        });

        console.log("wait-test result:", res);
    }
}
