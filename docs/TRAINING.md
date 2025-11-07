# Training all tools and models

This guide shows how to train/fine‑tune each component in the MedRAX stack: classifier, segmentation, multimodal (LLaVA‑style) reasoning, and report generation. Start small with the demo DICOMs (demo/chest), then scale up with your own datasets.

## Prerequisites

- Windows or Linux with Python 3.10+
- GPU recommended (CUDA). CPU works for toy runs.
- Dependencies from `pyproject.toml` (already included in this repo)

Tip: If you use Conda, create an environment and install with `pip install -e .` at the repo root.

## 1) Dataset preparation (DICOM → PNG + manifest)

Use the helper to convert DICOMs to 512×512 PNGs and create a manifest:

```
python tools/prepare_dataset.py --src demo/chest --out data/prepared
```

Outputs:
- `data/prepared/pngs/*.png`
- `data/prepared/manifest.json` with entries:

```
{
  "image_path": "data/prepared/pngs/LIDC.png",
  "case_id": null,
  "modality": "CT|DX|CR|…",
  "labels": {}
}
```

Add labels later (0/1 per finding) if you plan to train the classifier.

## 2) Train the chest X‑ray classifier (multi‑label)

Fine‑tunes a ResNet on your prepared images:

```
python tools/train_classifier.py --manifest data/prepared/manifest.json --epochs 5 --labels Effusion Pneumothorax Consolidation Edema Pneumonia
```

Saves to `models/xray_classifier/model.pt`.

Integration: point the classification tool to the saved weights (future hook: we can add a loader to `medrax/tools/classification.py`).

## 3) Train a segmentation model (optional)

Provide masks that match your PNG filenames (binary or multi‑class). Directory example:

```
data/seg/
  images/  # prepared/pngs or another folder
  masks/   # same basenames as images
```

Train (single‑class by default):

```
python tools/train_segmentation.py --images data/prepared/pngs --masks data/seg/masks --epochs 20 --out models/seg
```

This writes `models/seg/model.pt`. You can wire it in `medrax/tools/segmentation.py` similarly to the classifier.

## 4) Multimodal reasoning (LLaVA‑style) LoRA fine‑tuning

Goal: Improve the assistant’s image‑grounded answers using instruction SFT on image‑text pairs.

Data format (JSONL), similar to LLaVA:

```
{"image": "path/to.png", "conversations": [
  {"from": "human", "value": "<image> Please summarize findings for this chest X-ray."},
  {"from": "gpt",   "value": "Findings: … Impression: … Confidence: 85%"}
]}
```

Where to get targets:
- Use vetted doctor reports or your current AI analysis (weak labels).
- Ensure no PHI is present.

Training options:
- Use Hugging Face PEFT (LoRA) on a LLaVA‑compatible base (e.g., LLaVA‑Med or LLaVA‑v1.5). Given this repo has `medrax/llava`, you can either:
  1) Use the community LLaVA training scripts with your dataset, producing LoRA adapters, or
  2) Extend `medrax/llava` to add a PEFT training entrypoint (advanced; recommended after (1) works).

High‑level PEFT pseudo‑command (reference only):

```
# Pseudocode - adapt to your actual base and training script
python train_llava_lora.py \
  --base llava-hf/llava-1.5-7b \
  --data data/instruct/train.jsonl \
  --image-root data/prepared/pngs \
  --output models/llava_lora \
  --epochs 3 --lr 1e-4 --batch 8
```

Integration: load LoRA adapters on top of your base model in `medrax/llava/model/builder.py` or where the model is constructed.

### 4.1) Using ChestAgentBench for SFT

ChestAgentBench can be used both for evaluation (see `quickstart.py`) and for supervised instruction fine‑tuning. Convert its metadata to LLaVA‑style JSONL with:

```powershell
python tools/convert_chestagentbench_to_instruct.py --meta chestagentbench/metadata.jsonl --figures-dir figures --out data/chestagentbench_instruct.jsonl --mode repeat
```

This produces one sample per image with conversations like:

```
{"id": "CAB_<qid>_<imgIndex>", "image": "figures/xyz.png", "conversations": [
  {"from": "user", "value": "<image>\nQUESTION: ..."},
  {"from": "assistant", "value": "A\nEXPLANATION: ..."}
]}
```

If your trainer supports multi‑image inputs, you can instead use:

```powershell
python tools/convert_chestagentbench_to_instruct.py --meta chestagentbench/metadata.jsonl --figures-dir figures --out data/chestagentbench_instruct.jsonl --mode pack
```

Tip: to make datasets portable, copy images to a dedicated folder and reference those paths:

```powershell
python tools/convert_chestagentbench_to_instruct.py --meta chestagentbench/metadata.jsonl --figures-dir figures --copy-images-dir data/cab_images --out data/chestagentbench_instruct.jsonl
```

## 5) Report generation SFT (text‑only)

If you have paired inputs (e.g., “Summarize this chest X-ray given symptoms/history”) and target reports, you can fine‑tune a text model (e.g., Llama‑3‑8B‑Instruct) with LoRA:

Data format (JSONL): `{ "prompt": "…", "response": "…" }`

Train with PEFT (similar to step 4 but no images). Then configure the agent to call the report model for summarization tools (`medrax/tools/report_generation.py`).

## 6) Tool selection policy (optional)

By default the agent uses prompts to decide which tools to call. You can supervise this with imitation:
1. Export chat logs with tool calls.
2. Train a small classifier (or SFT a small LM) that maps (question, context) → next tool.
3. Use it as a prior; fall back to the LLM when uncertain.

## 7) Evaluation

Use `experiments/*` to verify:
- Classifier: per‑label AUROC, F1 at threshold.
- Segmentation: Dice/IoU.
- Multimodal/Report: BLEU/ROUGE, and a small doctor review set.

## 8) Safety & compliance

- Strip PHI from DICOM headers before training.
- Keep an audit (dataset hash, code commit, config) for each trained model.
- Human review before clinical usage.

---

Need help wiring your trained weights into the live tools? Open an issue or ask for a targeted patch (classifier, segmentation, LLaVA LoRA loader).
