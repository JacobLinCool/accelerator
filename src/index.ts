import { Elysia, type Context } from "elysia";
import { handleGitHubWebhook } from "./webhook";

interface CF extends Context {
    env: Env;
}

const app = new Elysia({ aot: false })
    .onError(({ code, error, set }) => {
        console.error(`Error ${code}:`, error);

        if (code === "NOT_FOUND") {
            set.status = 404;
            return { error: "Not Found" };
        }

        if (code === "VALIDATION") {
            set.status = 400;
            return { error: "Validation Error", details: error.message };
        }

        set.status = 500;
        return { error: "Internal Server Error" };
    })
    .get("/favicon*", () => {
        throw new Error("Not Found");
    })
    .get("/", () => ({
        message: "Accelerator API is running",
        timestamp: new Date().toISOString(),
    }))
    .post("/webhook/github", async ({ env, request }: CF) => {
        return await handleGitHubWebhook(request, env);
    });
// .group("/test", (app) =>
//     app
//         .get("/", async ({ request, env }: CF) => {
//             if (!env.TEST_WORKFLOW) {
//                 throw new Error("Test workflow service not available");
//             }

//             const ins = await env.TEST_WORKFLOW.create();
//             const url = new URL(request.url);
//             const triggerUrl = new URL(`/test-event?instanceId=${ins.id}`, url.origin);
//             triggerUrl.searchParams.set("eventType", "test-event");

//             return {
//                 instanceId: ins.id,
//                 triggerUrl: triggerUrl.toString(),
//             };
//         })
//         .get("/event", async ({ query, env }: CF) => {
//             const { instanceId, eventType = "test-event" } = query;

//             if (!instanceId) {
//                 throw new Error("instanceId query parameter is required");
//             }

//             if (!env.TEST_WORKFLOW) {
//                 throw new Error("Test workflow service not available");
//             }

//             try {
//                 const instance = await env.TEST_WORKFLOW.get(instanceId);
//                 await instance.sendEvent({
//                     type: eventType,
//                     payload: {
//                         timestamp: new Date().toISOString(),
//                     },
//                 });

//                 return {
//                     message: `Event ${eventType} sent to workflow instance ${instanceId}`,
//                 };
//             } catch (error) {
//                 throw new Error("Instance not found");
//             }
//         })
// );

// Export for Cloudflare Workers
export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        try {
            const response = await app.decorate({ env }).handle(req);
            return response;
        } catch (error) {
            console.error("Unhandled error:", error);
            return new Response(JSON.stringify({ error: "Internal Server Error" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    },
};

export { IssueTrackingWorkflow, TestWorkflow } from "./workflows";
