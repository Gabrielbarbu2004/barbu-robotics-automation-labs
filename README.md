# Barbu Robotics — automation prototypes

Three independent demonstration projects exploring practical automation problems. These are runnable software prototypes, not commissioned client systems. All run locally in a browser with no account, external service or package installation required.

| Project | Demonstrates |
| --- | --- |
| Workflow Automation Bench | CSV validation, deterministic routing, review decisions, duplicate protection and an audit trail |
| Warehouse Control Lab | Bounded queues, sequenced transfer, simulated interlocks, fault injection and explicit recovery |
| Vision Inspection Workbench | Synthetic raster generation, thresholding, connected components, geometric inspection and evaluation |

## Run

From this folder, run `python -m http.server 8000`, then open a project's folder through http://localhost:8000. Modern browsers load the ES modules through HTTP. Opening an HTML file directly through `file://` may block module loading.

To run each project's tests with a recent Node.js release, change into that project directory and run `node --test`. See each README for model assumptions and test descriptions.

## Explore the projects

- [Workflow Automation Bench](https://github.com/Gabrielbarbu2004/barbu-robotics-automation-labs/tree/main/workflow-automation-bench) — [live demo](https://gabrielbarbu2004.github.io/demos/workflow-automation-bench/)
- [Warehouse Control Lab](https://github.com/Gabrielbarbu2004/barbu-robotics-automation-labs/tree/main/warehouse-control-lab) — [live demo](https://gabrielbarbu2004.github.io/demos/warehouse-control-lab/)
- [Vision Inspection Workbench](https://github.com/Gabrielbarbu2004/barbu-robotics-automation-labs/tree/main/vision-inspection-workbench) — [live demo](https://gabrielbarbu2004.github.io/demos/vision-inspection-workbench/)

Each folder is a standalone project. Only generated example data is included. No authentication credentials or private application documents are needed.

## Interpretation

- The workflow classifier is deterministic and rule-based, not a trained model or an LLM.
- The warehouse lab models control logic with idealised timing, not robot physics or certified safety controls.
- The vision workbench evaluates generated images only. Its metrics do not establish performance on real cameras, production parts or a customer dataset.

These limits are part of the engineering case: test an idea, make assumptions visible, and collect the evidence needed for the next stage.
