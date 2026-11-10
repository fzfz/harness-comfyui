export const promptEditingStyles = `
.experiment-workbench .prompt-comparison-modal { width: min(1080px, calc(100% - 48px)); max-height: 92vh; overflow: auto; }
.experiment-workbench .prompt-edit-context { padding: 16px 0; border-bottom: 1px solid var(--line); }
.experiment-workbench .prompt-edit-context p { white-space: pre-wrap; margin-top: 8px; }
.experiment-workbench .prompt-comparison-field { margin: 18px 0; }
.experiment-workbench .prompt-comparison-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.experiment-workbench .prompt-comparison-columns section { min-width: 0; }
.experiment-workbench .prompt-comparison-columns h4 { color: var(--muted); font-weight: 500; margin: 8px 0; }
.experiment-workbench .prompt-comparison-columns textarea, .experiment-workbench .prompt-comparison-source { width: 100%; min-height: 140px; border: 1px solid var(--line); border-radius: 6px; padding: 10px; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--surface); }
.experiment-workbench .prompt-comparison-columns textarea { resize: vertical; color: var(--ink); }
.experiment-workbench .prompt-translation { min-height: 36px; color: var(--muted); white-space: pre-wrap; padding: 8px 0; }
.experiment-workbench .prompt-request-state { margin-top: 10px; color: var(--green); }
.experiment-workbench .template-variable-editor { position: relative; margin: 10px 0; }
.experiment-workbench .template-variable-editor textarea { display: block; width: 100%; min-height: 150px; margin-top: 8px; border: 1px solid var(--line); border-radius: 6px; padding: 10px; font-family: var(--mono); resize: vertical; }
.experiment-workbench .template-variable-list { position: absolute; top: 30px; right: 0; z-index: 2; border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 8px 24px #26352f20; background: var(--surface); padding: 5px; }
.experiment-workbench .template-variable-list button { display: block; width: 100%; text-align: left; padding: 8px; border-radius: 4px; }
.experiment-workbench .template-variable-list button[aria-selected=true], .experiment-workbench .template-variable-list button:hover { background: var(--tint); }
.experiment-workbench .template-variable-list code { display: block; color: var(--muted); }
.experiment-workbench .request-block-editor, .experiment-workbench .request-reference-editor, .experiment-workbench .request-preview { margin: 14px 0; }
.experiment-workbench .request-preview pre, .experiment-workbench .prompt-task-turns pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.experiment-workbench .prompt-task-turns details { margin: 12px 0; border-top: 1px solid var(--line); padding-top: 12px; }
@media (max-width: 800px) { .experiment-workbench .prompt-comparison-columns { grid-template-columns: 1fr; } }
`
