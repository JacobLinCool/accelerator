# Accelerator

A mindful AI project manager that helps engineering teams move fast while maintaining healthy minds and sustainable practices. Built on Cloudflare Workers with GitHub integration and OpenAI-powered workflows.

## Features

- **Intelligent Issue Management**: Automatically tracks and manages GitHub issues labeled with `accelerator-managed`
- **AI-Powered Task Assignment**: Matches tasks to engineers based on skills, capacity, and growth opportunities
- **Engineer Wellbeing Monitoring**: Watches for signs of burnout and suggests workload adjustments
- **Automated Workflows**: Handles issue assignments, branch creation, and team notifications
- **GitHub Integration**: Deep integration with GitHub's GraphQL API for comprehensive project insights
- **Real-time Processing**: Webhook-driven automation for immediate response to project changes

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- Cloudflare Workers account
- GitHub personal access token
- OpenAI API key

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd accelerator
```

1. Install dependencies:

```bash
pnpm install
```

1. Configure environment variables in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "GITHUB_TOKEN": "your-github-token",
    "GITHUB_WEBHOOK_SECRET": "your-webhook-secret", 
    "OPENAI_API_KEY": "your-openai-api-key"
  }
}
```

1. Deploy to Cloudflare Workers:

```bash
pnpm run deploy
```

### GitHub Webhook Setup

1. Go to your repository settings → Webhooks
2. Add a new webhook with:
   - **Payload URL**: `https://your-worker.your-subdomain.workers.dev/webhook/github`
   - **Content type**: `application/json`
   - **Secret**: Same as `GITHUB_WEBHOOK_SECRET`
   - **Events**: Select "Issues"

## Usage

### Basic Workflow

1. **Label an Issue**: Add the `accelerator-managed` label to any GitHub issue
2. **Automatic Processing**: Accelerator will:
   - Assign an available engineer based on skills and capacity
   - Create a linked branch with prefix `issue-{number}-`
   - Add a comment notifying the assigned engineer
3. **Continuous Monitoring**: The system tracks progress and can suggest adjustments

### Workflow Status

Check workflow status by visiting:

```
https://your-worker.your-subdomain.workers.dev/status?instanceId=<workflow-id>
```

### Development

Start local development server:

```bash
pnpm run dev
```

Generate TypeScript types for Cloudflare Workers:

```bash
pnpm run cf-typegen
```

## Architecture

- **Cloudflare Workers**: Serverless runtime for webhook processing and workflow execution
- **GitHub GraphQL API**: Deep integration for issue management and team insights
- **OpenAI GPT**: AI-powered decision making for task assignments and team management
- **Workflows**: Long-running processes for continuous issue tracking and team monitoring
