import { handleGitHubWebhook } from "./webhook";

export { IssueTrackingWorkflow, TestWorkflow } from "./workflows";

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);

		// Handle favicon requests
		if (url.pathname.startsWith("/favicon")) {
			return new Response(null, { status: 404 });
		}

		// Handle GitHub webhooks
		if (url.pathname === "/webhook/github" && req.method === "POST") {
			return await handleGitHubWebhook(req, env);
		}

		// Handle workflow status queries
		if (url.pathname.startsWith("/status")) {
			const instanceId = url.searchParams.get("instanceId");
			if (instanceId && env.ISSUE_TRACKING_WORKFLOW) {
				try {
					const instance = await env.ISSUE_TRACKING_WORKFLOW.get(instanceId);
					return Response.json({
						status: await instance.status(),
					});
				} catch (error) {
					return Response.json({ error: "Instance not found" }, { status: 404 });
				}
			}
		}

		return new Response("Not Found", { status: 404 });
	},
};
