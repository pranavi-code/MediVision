"""
ChestAgentBench runner
======================

This script loads ChestAgentBench-style metadata, runs your chosen model pipeline on
each example (image + question), and computes simple metrics against ground truth.

Supported modes:
  - agent: route via backend chat interface (/chat) or internal agent tools
  - classifier: use medrax.tools.classification.ChestXRayClassifierTool + a simple prompt-to-label mapper
  - vqa: use medrax.tools.xray_vqa.XRayVQATool for free-form Q/A

Usage examples:
  python benchmark/create_benchmark.py --data-dir ./chestagentbench \
    --metadata ./chestagentbench/qa.json --mode vqa --limit 50 --output-dir ./runs
"""

from __future__ import annotations

import os
import json
import csv
import time
import argparse
from typing import Any, Dict, List, Tuple, Set
from pathlib import Path

# Optional local LLM for baselines
try:
    import ollama  # type: ignore
except Exception:  # not required unless you choose a local LLM baseline
    ollama = None  # type: ignore

# Tools from this repo
from medrax.tools.classification import ChestXRayClassifierTool


def _load_json_or_jsonl(path: Path) -> Any:
    """Load a JSON or JSONL file and return the parsed content.

    JSONL returns a list of parsed rows.
    """
    if path.suffix.lower() == ".jsonl":
        rows = []
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rows.append(json.loads(line))
        return rows
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_chestagentbench(metadata_path: str | Path, images_root: str | Path) -> List[Dict[str, Any]]:
    """Load ChestAgentBench-style JSON metadata.

    Expected JSON structure (per item example):
      {
        "image": "images/some_image.png"  # relative to images_root, or absolute
        "question": "What abnormality is present?",
        "answer": "Pleural effusion"
      }
    """
    p = Path(metadata_path)
    data = _load_json_or_jsonl(p)
    items: List[Dict[str, Any]] = []
    root = Path(images_root)
    for i, row in enumerate(data):
        img = str(row.get("image", ""))
        imgp = Path(img)
        if not imgp.is_absolute():
            imgp = root / img
        items.append({
            "index": i,
            "image_path": str(imgp),
            "question": str(row.get("question", "")).strip(),
            "answer": str(row.get("answer", "")).strip(),
            "meta": {k: v for k, v in row.items() if k not in ("image","question","answer")}
        })
    return items


def normalize_text(s: str) -> str:
    return " ".join(str(s or "").strip().lower().split())


def string_match_score(pred: str, gold: str) -> float:
    """Case/space-insensitive exact match as a simple accuracy metric."""
    return 1.0 if normalize_text(pred) == normalize_text(gold) else 0.0


def extract_answer(text: str) -> str:
    """Try to extract a concise answer from a longer generation.

    Heuristics: take first line, drop 'Answer:' prefix, stop at first sentence-ending punctuation.
    """
    s = normalize_text(text)
    if not s:
        return s
    # common prefixes
    for pref in ("answer:", "prediction:", "final:"):
        if s.startswith(pref):
            s = s[len(pref):].strip()
            break
    # split by newline or period
    for sep in ["\n", ". ", ".", "\r"]:
        if sep in s:
            s = s.split(sep, 1)[0].strip()
            break
    return s


PATHOLOGY_SYNONYMS: Dict[str, Set[str]] = {
    "effusion": {"effusion", "pleural effusion"},
    "pneumothorax": {"pneumothorax", "collapsed lung"},
    "consolidation": {"consolidation", "airspace opacity"},
    "edema": {"edema", "pulmonary edema"},
    "pneumonia": {"pneumonia", "infection"},
    "cardiomegaly": {"cardiomegaly", "enlarged heart"},
    "atelectasis": {"atelectasis", "collapse"},
    "fracture": {"fracture", "rib fracture"},
    "mass": {"mass", "tumor"},
    "nodule": {"nodule", "pulmonary nodule"},
}


def pathology_match(pred: str, gold: str) -> float:
    """Fuzzy match: consider synonyms; returns 1.0 if any synonym of gold is contained in pred.

    If gold is not in our ontology, fallback to substring match on normalized strings.
    """
    p = normalize_text(pred)
    g = normalize_text(gold)
    if not p or not g:
        return 0.0
    # map gold to base key if possible
    key = None
    for k, syns in PATHOLOGY_SYNONYMS.items():
        if g in syns or k == g:
            key = k
            break
    if key:
        for syn in PATHOLOGY_SYNONYMS[key]:
            if syn in p:
                return 1.0
        return 0.0
    # fallback substring
    return 1.0 if g in p else 0.0


def run_classifier(image_path: str, question: str, device: str = "cpu") -> str:
    """Map classifier probabilities to a textual answer for simple QA.

    This is a naive baseline: pick the highest-probability label among a limited set if question implies pathology.
    """
    tool = ChestXRayClassifierTool(device=device)
    preds, _ = tool._run(image_path)
    if isinstance(preds, dict) and "error" in preds:
        return f"error: {preds['error']}"
    # Choose among a subset of labels relevant to common questions
    label_space = [
        "Effusion", "Pneumothorax", "Consolidation", "Edema", "Pneumonia",
        "Cardiomegaly", "Atelectasis", "Fracture", "Mass", "Nodule"
    ]
    best = max(label_space, key=lambda k: float(preds.get(k, 0.0)))
    return best


def run_vqa(image_path: str, question: str, device: str = "cuda", max_new_tokens: int = 256) -> str:
    from medrax.tools.xray_vqa import XRayVQATool
    tool = XRayVQATool(device=device)  # This line creates the tool so it exists!
    out, _ = tool._run([image_path], prompt=question, max_new_tokens=max_new_tokens)
    if isinstance(out, dict) and "response" in out:
        return str(out["response"]).strip()
    return str(out)



def run_agent_via_tools(image_path: str, question: str) -> str:
    """Optional: route through your internal agent pipeline.

    For a minimal offline script, we call the classifier directly. If your backend is running,
    you could POST to http://localhost:8585/chat with an image and question.
    """
    return run_classifier(image_path, question)


def main():
    ap = argparse.ArgumentParser(description="Run MediVision models on ChestAgentBench and compute metrics")
    ap.add_argument("--data-dir", type=str, required=True, help="Path to chestagentbench root directory")
    ap.add_argument("--metadata", type=str, required=False, default=None, help="Path to metadata JSON (default: data-dir/qa.json)")
    ap.add_argument("--mode", type=str, choices=["classifier","vqa","agent"], default="vqa", help="Which pipeline to run")
    ap.add_argument("--limit", type=int, default=0, help="Limit number of samples (0 = all)")
    ap.add_argument("--device", type=str, default=None, help="Device override (cuda/cpu/mps)")
    ap.add_argument("--output-dir", type=str, default="./benchmark_runs", help="Directory to save results")
    ap.add_argument("--metric", type=str, choices=["exact","pathology"], default="exact", help="Scoring metric")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        raise SystemExit(f"Data dir not found: {data_dir}")
    def _discover_metadata(dd: Path) -> Path | None:
        # Try common filenames first
        candidates = [
            dd / "qa.json",
            dd / "qa.jsonl",
            dd / "questions.json",
            dd / "annotations.json",
            dd / "dataset.json",
        ]
        for c in candidates:
            if c.exists():
                return c
        # Fallback: scan for any .json/.jsonl that looks like a list of QA dicts
        for c in dd.glob("*.json*"):
            try:
                data = _load_json_or_jsonl(c)
                if isinstance(data, list) and data:
                    sample = data[0]
                    if isinstance(sample, dict) and ("image" in sample) and ("question" in sample):
                        return c
            except Exception:
                continue
        return None

    meta_path = Path(args.metadata) if args.metadata else data_dir / "qa.json"
    if not meta_path.exists():
        discovered = _discover_metadata(data_dir)
        if discovered:
            print(f"[info] Metadata not found at {meta_path}, using discovered: {discovered}")
            meta_path = discovered
        else:
            raise SystemExit(
                f"Metadata file not found. Expected {meta_path}. "
                f"Pass --metadata <path-to-json/jsonl> or place qa.json in {data_dir}."
            )
    images_dir = data_dir / "images"

    items = load_chestagentbench(meta_path, images_dir)
    if args.limit and args.limit > 0:
        items = items[: args.limit]

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    run_id = time.strftime("%Y%m%d_%H%M%S")
    results_path = out_dir / f"results_{args.mode}_{run_id}.jsonl"
    summary_path = out_dir / f"summary_{args.mode}_{run_id}.json"
    csv_path = out_dir / f"results_{args.mode}_{run_id}.csv"

    correct = 0
    correct_path = 0
    total = 0
    rows: List[Dict[str, Any]] = []

    # Device defaults by mode
    if args.device:
        device = args.device
    else:
        device = "cuda" if args.mode == "vqa" else ("cpu")

    with results_path.open("w", encoding="utf-8") as jf, csv_path.open("w", newline="", encoding="utf-8") as cf:
        writer = csv.DictWriter(cf, fieldnames=["index","image_path","question","gold","prediction","prediction_compact","score","score_pathology"])
        writer.writeheader()
        for it in items:
            img = it["image_path"]
            q = it["question"]
            gold = it["answer"]
            try:
                if args.mode == "classifier":
                    pred = run_classifier(img, q, device=device)
                elif args.mode == "vqa":
                    pred = run_vqa(img, q, device=device)
                else:
                    pred = run_agent_via_tools(img, q)
            except Exception as e:
                pred = f"error: {e}"

            # Extract concise prediction for matching
            compact_pred = extract_answer(pred)
            score = string_match_score(compact_pred, gold)
            path_score = pathology_match(compact_pred, gold)
            total += 1
            correct += (1 if score >= 1.0 else 0)
            correct_path += (1 if path_score >= 1.0 else 0)

            rec = {
                "index": it["index"],
                "image_path": img,
                "question": q,
                "gold": gold,
                "prediction": pred,
                "prediction_compact": compact_pred,
                "score": score,
                "score_pathology": path_score,
            }
            rows.append(rec)
            jf.write(json.dumps(rec) + "\n")
            writer.writerow(rec)

    summary = {
        "mode": args.mode,
        "total": total,
        "correct_exact": correct,
        "accuracy_exact": (correct/total if total else 0.0),
        "correct_pathology": correct_path,
        "accuracy_pathology": (correct_path/total if total else 0.0),
    }
    with summary_path.open("w", encoding="utf-8") as sf:
        json.dump(summary, sf, indent=2)

    print(f"Saved results to: {results_path}")
    print(f"Saved CSV to:     {csv_path}")
    print(f"Summary:          {summary}")


if __name__ == "__main__":
    main()