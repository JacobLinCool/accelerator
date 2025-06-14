import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";

export interface TestParams { }

class Slept { }

function sleep(ms: number): Promise<Slept> {
    return new Promise(resolve => setTimeout(() => resolve(new Slept()), ms));
}

export class TestWorkflow extends WorkflowEntrypoint<Env, TestParams> {
    async run(event: WorkflowEvent<TestParams>, step: WorkflowStep) {
        console.log("Test workflow started");

        const wait = step.waitForEvent("wait-for-test-event", { type: "test-event" });

        const r = await Promise.race([
            sleep(1),
            wait,
        ]);

        if (r instanceof Slept) {
            console.log("wait-test result: Slept");
        } else {
            console.log("wait-test result: Event received", r);
        }

        const x = await step.do("Test Step", async () => {
            console.log("Executing test step");
            return "Test step completed";
        });

        console.log("Test step result:", x);

        await wait;

        console.log("Test workflow completed");

        return;
    }
}
