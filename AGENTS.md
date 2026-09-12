# Local SEO service

Docker Desktop and the Docker CLI (including Docker Compose) are allowed apps for this project. Use them to build, inspect, start, stop, and restart this project’s services. Preserve existing containers and persistent volumes belonging to other projects; deleting data or volumes requires explicit authorization.

Keep the dashboard on loopback with password authentication. Keep credentials and raw audit data out of Git and Docker build contexts.

Before connecting the website project, prove dashboard persistence and MCP access to the same database. Expose only the nine read tools listed in the setup guide; website edits belong in the website repository through its Git and PR workflow.

For local startup, MCP integration, validation, and website handoff, read [LOCAL-SETUP.md](LOCAL-SETUP.md).
