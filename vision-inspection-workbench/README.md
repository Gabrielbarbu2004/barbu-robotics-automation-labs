# Vision Inspection Workbench

An original, independent Barbu Robotics prototype for exploring image formation, geometric inspection and decision errors. All images and labels are generated locally. It makes no claims about real-world inspection performance, clients or industrial deployment.

## Run

Serve this folder with any HTTP server and open `index.html`. ES modules need HTTP; double-clicking the file may be blocked by the browser.

With Node.js (no installation or dependencies required beyond Node):

```sh
node serve.mjs
```

Open http://127.0.0.1:8080. Alternatively, use `python -m http.server 8080` in this folder. Everything stays in the browser. CSV export is a local download; no images, seeds or results are sent anywhere.

## Experiment

1. Run calibration using seed **731**. The default batch has 20 good and 20 defective synthetic components.
2. Inspect individual generated images, threshold masks and measurements.
3. Set both tolerances to **24 px** and rerun: some genuinely defective generated parts will be accepted.
4. Restore defaults, reduce exposure to **−110**, and rerun: good parts become difficult to detect at the original threshold.
5. Reduce the brightness threshold to **80** to recover segmentation under the low-exposure condition.
6. Run evaluation with a separate seed, **1907**, then export the per-sample measurements and configuration as CSV.

Controls apply when a batch is run. If controls change, the interface marks the existing results as belonging to the previous run. CSV always uses the configuration actually used for the displayed batch.

Using a distinct seed keeps calibration images separate from evaluation images. Repeatedly tuning against evaluation results makes them another calibration set; a real validation workflow requires a genuinely untouched dataset.

## Method

- **Generator:** deterministic seeded pseudo-random raster images, 160 × 120 pixels. A bright rectangular body surrounds a dark circular hole, with small geometry variation, an additive exposure offset and bounded independent pixel noise.
- **Ground truth:** alternating good and defective samples. Defects are missing hole, hole displaced horizontally by 18 pixels, or nominal body width reduced from 90 to 70 pixels. Ground truth is generated from the construction parameters, not inferred from the inspection.
- **Segmentation:** threshold the image, then locate the largest 4-connected bright region with at least 600 pixels.
- **Measurement:** measure region bounding-box width/height. Find enclosed dark connected regions of at least 20 pixels, measure equivalent circular radius and offset from the bounding-box centre.
- **Decision:** accept only when width is within the adjustable tolerance of 90 px, height is within 6 px of 64 px, there is one qualifying enclosed region, equivalent hole radius is 7–13 px and the hole-centre offset is within the adjustable tolerance.
- **Scoring:** compare the image-derived decision with the generator label. A false accept is a defective part accepted; a false reject is a good part rejected. The inspector never reads the ground-truth label or defect type.

The default fixture batches are deliberately simple and separable. Correct decisions on these generated batches are a software demonstration, not an estimate of generalization, a confidence interval or a real-camera benchmark. Exposure and noise can fragment the threshold mask, which is part of the experiment.

## Files and integration

- `index.html`: standalone browser entry; suitable for a subfolder or iframe.
- `style.css`: responsive dark navy and lime interface, keyboard focus states and 16 px base typography.
- `engine.mjs`: reusable pure generator, connected-component inspection, evaluation and CSV functions; no DOM or dependencies.
- `app.mjs`: controls, canvas overlays, batch snapshots, sample navigation and downloads.
- `engine.test.mjs`: meaningful deterministic algorithm tests using built-in `node:test`.
- `serve.mjs`: optional loopback-only development server using built-in Node modules.

All asset references are relative. No external fonts, services, libraries, telemetry or model APIs are used.

## Test

```sh
node --test engine.test.mjs
```

Tests cover reproducibility, independent seeds, correct classification of all three defect families, label independence, tolerance-induced false accepts, exposure failure/recovery, blank/saturated image rejection, CSV content and invalid batch inputs.

## Limits

This is classical image processing, not a trained machine-learning model. It assumes one axis-aligned part, fixed scale, a fixed camera view and strong contrast. It does not simulate lens distortion, perspective, real surface texture, reflections, occlusion, motion blur or camera calibration. Pixel dimensions are not physical measurements. Connected-component geometry does not prove that a hole is circular or that the part is otherwise defect-free. Only three synthetic defect families are labelled. There is no camera integration, PLC output, robot interface or safety certification.

For a real inspection system, gather representative labelled data, calibrate the camera and physical dimensions, define process-specific acceptance criteria, estimate uncertainty and validate on held-out operating conditions before any production decision.
