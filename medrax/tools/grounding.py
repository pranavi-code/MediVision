from typing import Dict, List, Optional, Tuple, Type, Any
from pathlib import Path
import uuid
import tempfile
import matplotlib.pyplot as plt
import torch
from PIL import Image
from pydantic import BaseModel, Field

from transformers import AutoModelForCausalLM, AutoProcessor, BitsAndBytesConfig
# Remove problematic imports that cause frozenset issues
# from langchain_core.callbacks import (
#     AsyncCallbackManagerForToolRun,
#     CallbackManagerForToolRun,
# )
# from langchain_core.tools import BaseTool


class XRayPhraseGroundingInput(BaseModel):
    """Input schema for the XRay Phrase Grounding Tool. Only supports JPG or PNG images."""

    image_path: str = Field(
        ...,
        description="Path to the frontal chest X-ray image file, only supports JPG or PNG images",
    )
    phrase: str = Field(
        ...,
        description="Medical finding or condition to locate in the image (e.g., 'Pleural effusion')",
    )
    max_new_tokens: int = Field(default=300, description="Maximum number of new tokens to generate")


class XRayPhraseGroundingTool:
    """Tool for grounding medical findings in chest X-ray images using the MAIRA-2 model.

    This tool processes chest X-ray images and locates specific medical findings mentioned
    in the input phrase. It returns both the bounding box coordinates and a visualization
    of the finding's location in the image.
    """

    name: str = "xray_phrase_grounding"
    description: str = (
        "Locates and visualizes specific medical findings in chest X-ray images. "
        "Takes a chest X-ray image and medical phrase to locate (e.g., 'Pleural effusion', 'Cardiomegaly'). "
        "Returns bounding box coordinates in format [x_topleft, y_topleft, x_bottomright, y_bottomright] "
        "where each value is between 0-1 representing relative position in the image, "
        "a visualization of the finding's location, and confidence metadata. "
        "Example input: {'image_path': '/path/to/xray.png', 'phrase': 'Pleural effusion', 'max_new_tokens': 300}"
    )
    args_schema: Type[BaseModel] = XRayPhraseGroundingInput

    model: Any = None
    processor: Any = None
    device: str = "cuda"
    temp_dir: Path = None

    def __init__(
        self,
        model_path: str = "microsoft/maira-2",
        cache_dir: Optional[str] = None,
        temp_dir: Optional[str] = None,
        load_in_4bit: bool = False,
        load_in_8bit: bool = False,
        device: Optional[str] = "cuda",
    ):
        """Initialize the XRay Phrase Grounding Tool."""
        # Don't call super().__init__() to avoid BaseTool frozenset issues
        self.device = torch.device(device) if device else "cuda"
        self.model = None
        self.processor = None

        try:
            print(f"🔄 Loading Maira-2 grounding model from {model_path}...")
            
            # Setup quantization config
            quantization_config = None
            if load_in_4bit:
                quantization_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.bfloat16,
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_quant_type="nf4",
                )
            elif load_in_8bit:
                quantization_config = BitsAndBytesConfig(
                    load_in_8bit=True,
                )

            # Try to load Maira-2 with proper authentication handling
            try:
                self.model = AutoModelForCausalLM.from_pretrained(
                    model_path,
                    device_map=self.device,
                    cache_dir=cache_dir,
                    trust_remote_code=True,
                    quantization_config=quantization_config,
                    torch_dtype=torch.float32 if str(self.device) == "cpu" else torch.bfloat16
                )
                self.processor = AutoProcessor.from_pretrained(
                    model_path, 
                    cache_dir=cache_dir, 
                    trust_remote_code=True
                )
                
                if self.model:
                    self.model = self.model.eval()
                    print(f"✅ Maira-2 grounding model loaded successfully")
                else:
                    raise Exception("Model loading returned None")
                
            except Exception as auth_error:
                if "gated repo" in str(auth_error) or "401" in str(auth_error) or "403" in str(auth_error):
                    print(f"❌ Maira-2 requires authentication:")
                    print(f"   1. Visit: https://huggingface.co/microsoft/maira-2")
                    print(f"   2. Request access and wait for approval")
                    print(f"   3. Run: huggingface-cli login")
                    print(f"🔄 Creating fallback grounding tool for now...")
                    raise auth_error
                else:
                    raise auth_error

        except Exception as e:
            print(f"❌ Maira-2 grounding model loading failed: {e}")
            # Create dummy placeholders to prevent complete failure
            self.model = None
            self.processor = None

        self.temp_dir = Path(temp_dir if temp_dir else tempfile.mkdtemp())
        self.temp_dir.mkdir(exist_ok=True)

    def _visualize_bboxes(
        self, image: Image.Image, bboxes: List[Tuple[float, float, float, float]], phrase: str
    ) -> str:
        """Create and save visualization of multiple bounding boxes on the image."""
        plt.figure(figsize=(12, 12))
        plt.imshow(image, cmap="gray")

        for bbox in bboxes:
            x1, y1, x2, y2 = bbox
            width = x2 - x1
            height = y2 - y1

            plt.gca().add_patch(
                plt.Rectangle(
                    (x1 * image.width, y1 * image.height),
                    width * image.width,
                    height * image.height,
                    fill=False,
                    color="red",
                    linewidth=2,
                )
            )

        plt.title(f"Located: {phrase}", pad=20)
        plt.axis("off")

        viz_path = self.temp_dir / f"grounding_{uuid.uuid4().hex[:8]}.png"
        plt.savefig(viz_path, bbox_inches="tight", dpi=150)
        plt.close()

        return str(viz_path)

    def run(self, image_path: str, phrase: str, max_new_tokens: int = 300) -> str:
        """Simple run method for agent compatibility"""
        try:
            result, metadata = self._run(image_path, phrase, max_new_tokens)
            return str(result)
        except Exception as e:
            return f"Grounding tool error: {str(e)}"

    def _run(
        self,
        image_path: str,
        phrase: str,
        max_new_tokens: int = 300,
        run_manager: Optional[Any] = None,
    ) -> Tuple[Dict[str, Any], Dict]:
        """Ground a medical finding phrase in an X-ray image.

        Args:
            image_path: Path to the chest X-ray image file
            phrase: Medical finding to locate in the image
            max_new_tokens: Maximum number of new tokens to generate
            run_manager: Optional callback manager

        Returns:
            Tuple[Dict, Dict]: Output dictionary and metadata dictionary
        """
        # Check if model loaded successfully
        if self.model is None or self.processor is None:
            fallback_output = {
                "phrase": phrase,
                "bounding_boxes": [],
                "visualization_path": None,
                "confidence": 0.0,
                "status": "model_unavailable",
                "message": "Maira-2 grounding model is not available. This may be due to authentication requirements or model access restrictions."
            }
            metadata = {
                "image_path": image_path,
                "phrase": phrase,
                "analysis_status": "model_unavailable",
                "fallback_used": True,
                "suggestion": "For medical finding localization, consider using other available analysis tools."
            }
            return fallback_output, metadata
            
        try:
            image = Image.open(image_path)
            if image.mode != "RGB":
                image = image.convert("RGB")

            inputs = self.processor.format_and_preprocess_phrase_grounding_input(
                frontal_image=image, phrase=phrase, return_tensors="pt"
            )
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                output = self.model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    use_cache=True,
                )

            prompt_length = inputs["input_ids"].shape[-1]
            decoded_text = self.processor.decode(
                output[0][prompt_length:], skip_special_tokens=True
            )
            predictions = self.processor.convert_output_to_plaintext_or_grounded_sequence(
                decoded_text
            )

            metadata = {
                "image_path": image_path,
                "original_size": image.size,
                "model_input_size": tuple(inputs["pixel_values"].shape[-2:]),
                "device": str(self.device),
                "analysis_status": "completed",
            }

            if not predictions:
                output = {
                    "predictions": [],
                    "visualization_path": None,
                }
                metadata["analysis_status"] = "completed_no_finding"
                return output, metadata

            # Process multiple predictions
            processed_predictions = []
            for pred_phrase, pred_bboxes in predictions:
                if not pred_bboxes:  # Skip if no bounding boxes
                    continue

                # Convert model bboxes to list format and get original image bboxes
                model_bboxes = [list(bbox) for bbox in pred_bboxes]
                original_bboxes = [
                    self.processor.adjust_box_for_original_image_size(
                        bbox, width=image.size[0], height=image.size[1]
                    )
                    for bbox in model_bboxes
                ]

                processed_predictions.append(
                    {
                        "phrase": pred_phrase,
                        "bounding_boxes": {
                            "model_coordinates": model_bboxes,
                            "image_coordinates": original_bboxes,
                        },
                    }
                )

            # Create visualization with all bounding boxes
            if processed_predictions:
                all_bboxes = []
                for pred in processed_predictions:
                    all_bboxes.extend(pred["bounding_boxes"]["image_coordinates"])
                viz_path = self._visualize_bboxes(image, all_bboxes, phrase)
            else:
                viz_path = None
                metadata["analysis_status"] = "completed_no_finding"

            output = {
                "predictions": processed_predictions,
                "visualization_path": viz_path,
            }

            return output, metadata

        except Exception as e:
            output = {"error": str(e)}
            metadata = {
                "image_path": image_path,
                "analysis_status": "failed",
                "error_details": str(e),
            }
            return output, metadata

    async def _arun(
        self,
        image_path: str,
        phrase: str,
        run_manager: Optional[Any] = None,
    ) -> Tuple[Dict[str, Any], Dict]:
        """Asynchronous version of _run."""
        return self._run(image_path, phrase)
