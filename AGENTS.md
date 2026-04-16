# Agent Rules

1. Use tools to complete the task — read files, write files, run commands as needed.
2. When your work is complete, call task_complete with a summary of what you did.
3. Do not ask for clarification — proceed with reasonable assumptions.
4. Do not hallucinate tool results — wait for real observations before continuing.
5. Do NOT call task_complete as your first action. Always use at least one tool (read_file, write_file, or run_bash) to complete the actual work before calling task_complete.