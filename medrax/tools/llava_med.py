from typing import Any, Dict, Optional, Tuple, Type
from pydantic import BaseModel, Field

import torch

# Remove problematic imports that cause frozenset issues
# from langchain_core.callbacks import (
#     AsyncCallbackManagerForToolRun,
#     CallbackManagerForToolRun,
# )
# from langchain_core.tools import BaseTool

from PIL import Image


from medrax.llava.conversation import conv_templates
from medrax.llava.model.builder import load_pretrained_model
from medrax.llava.mm_utils import tokenizer_image_token, process_images
from medrax.llava.constants import (
    IMAGE_TOKEN_INDEX,
    DEFAULT_IMAGE_TOKEN,
    DEFAULT_IM_START_TOKEN,
    DEFAULT_IM_END_TOKEN,
)


class LlavaMedInput(BaseModel):
    """Input for the LLaVA-Med Visual QA tool. Only supports JPG or PNG images."""

    question: str = Field(..., description="The question to ask about the medical image")
    image_path: Optional[str] = Field(
        None,
        description="Path to the medical image file (optional), only supports JPG or PNG images",
    )


class LlavaMedTool:
    """Tool that performs medical visual question answering using LLaVA-Med.

    This tool uses a large language model fine-tuned on medical images to answer
    questions about medical images. It can handle both image-based questions and
    general medical questions without images.
    """

    name: str = "llava_med_qa"
    description: str = (
        "A tool that answers questions about biomedical images and general medical questions using LLaVA-Med. "
        "While it can process chest X-rays, it may not be as reliable for detailed chest X-ray analysis. "
        "Input should be a question and optionally a path to a medical image file."
    )
    args_schema: Type[BaseModel] = LlavaMedInput
    tokenizer: Any = None
    model: Any = None
    image_processor: Any = None
    context_len: int = 200000

    def __init__(
        self,
        model_path: str = "microsoft/llava-med-v1.5-mistral-7b",
        cache_dir: str = "/model-weights",
        low_cpu_mem_usage: bool = True,
        torch_dtype: torch.dtype = torch.bfloat16,
        device: str = "cuda",
        load_in_4bit: bool = False,
        load_in_8bit: bool = False,
        **kwargs,
    ):
        # Don't call super().__init__() to avoid BaseTool frozenset issues
        self.tokenizer = None
        self.model = None
        self.image_processor = None
        self.context_len = 2000
        
        try:
            print(f"🔄 Loading LLaVA-Med model from {model_path}...")
            
            # Try to load the actual LLaVA-Med model with optimized settings
            import os
            os.environ["TRANSFORMERS_OFFLINE"] = "0"  # Ensure online access
            
            # Load with conservative settings and streaming for large model
            print(f"📦 Loading microsoft/llava-med-v1.5-mistral-7b with optimized settings...")
            
            self.tokenizer, self.model, self.image_processor, self.context_len = load_pretrained_model(
                model_path=model_path,
                model_base=None,
                model_name=model_path,
                load_in_4bit=True,  # Use 4-bit quantization to reduce memory
                load_in_8bit=False,
                cache_dir=cache_dir,
                low_cpu_mem_usage=True,
                torch_dtype=torch.float16 if device != "cpu" else torch.float32,
                device=device
            )
            
            if self.model:
                self.model.eval()
                print(f"✅ LLaVA-Med model loaded successfully with 4-bit quantization")
            else:
                raise Exception("Model loading returned None")
                
        except Exception as e:
            print(f"❌ LLaVA-Med loading failed: {e}")
            print(f"🔄 Trying alternative loading approach...")
            
            try:
                # Try with even more conservative settings
                self.tokenizer, self.model, self.image_processor, self.context_len = load_pretrained_model(
                    model_path=model_path,
                    model_base=None,
                    model_name=model_path,
                    load_in_4bit=False,
                    load_in_8bit=True,  # Try 8-bit instead
                    cache_dir=cache_dir,
                    low_cpu_mem_usage=True,
                    torch_dtype=torch.float32,  # Use float32 for stability
                    device="cpu"  # Force CPU if GPU fails
                )
                
                if self.model:
                    self.model.eval()
                    print(f"✅ LLaVA-Med model loaded with 8-bit quantization on CPU")
                else:
                    raise Exception("Alternative loading also failed")
                    
            except Exception as e2:
                print(f"❌ Alternative loading also failed: {e2}")
                print(f"🔄 Creating fallback LLaVA-Med tool...")
                # Create dummy placeholders to prevent complete failure
                self.tokenizer = None
                self.model = None
                self.image_processor = None
                self.context_len = 2000

    def _process_input(
        self, question: str, image_path: Optional[str] = None
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        if self.model.config.mm_use_im_start_end:
            question = (
                DEFAULT_IM_START_TOKEN
                + DEFAULT_IMAGE_TOKEN
                + DEFAULT_IM_END_TOKEN
                + "\n"
                + question
            )
        else:
            question = DEFAULT_IMAGE_TOKEN + "\n" + question

        conv = conv_templates["vicuna_v1"].copy()
        conv.append_message(conv.roles[0], question)
        conv.append_message(conv.roles[1], None)
        prompt = conv.get_prompt()

        input_ids = (
            tokenizer_image_token(prompt, self.tokenizer, IMAGE_TOKEN_INDEX, return_tensors="pt")
            .unsqueeze(0)
            .cuda()
        )

        image_tensor = None
        if image_path:
            image = Image.open(image_path)
            image_tensor = process_images([image], self.image_processor, self.model.config)[0]
            image_tensor = image_tensor.unsqueeze(0).half().cuda()

        return input_ids, image_tensor

    def run(self, question: str, image_path: Optional[str] = None) -> str:
        """Simple run method for agent compatibility"""
        try:
            result, metadata = self._run(question, image_path)
            return result
        except Exception as e:
            return f"LLaVA-Med error: {str(e)}"

    def _run(
        self,
        question: str,
        image_path: Optional[str] = None,
        run_manager: Optional[Any] = None,
    ) -> Tuple[str, Dict]:
        """Answer a medical question, optionally based on an input image.

        Args:
            question (str): The medical question to answer.
            image_path (Optional[str]): The path to the medical image file (if applicable).
            run_manager (Optional[CallbackManagerForToolRun]): The callback manager for the tool run.

        Returns:
            Tuple[str, Dict]: A tuple containing the model's answer and any additional metadata.

        Raises:
            Exception: If there's an error processing the input or generating the answer.
        """
        # Check if model loaded successfully
        if self.model is None or self.tokenizer is None:
            fallback_response = (
                "LLaVA-Med model is not available due to loading issues. "
                "This could be due to model compatibility or resource constraints. "
                "For medical image analysis, please use other available tools like "
                "ChestXRayClassifierTool or XRayVQATool."
            )
            metadata = {
                "question": question,
                "image_path": image_path,
                "analysis_status": "model_unavailable",
                "fallback_used": True
            }
            return fallback_response, metadata
            
        try:
            input_ids, image_tensor = self._process_input(question, image_path)
            
            # Handle device placement more carefully
            if self.model.device.type == 'cpu':
                input_ids = input_ids.to('cpu')
                if image_tensor is not None:
                    image_tensor = image_tensor.to('cpu')
            else:
                input_ids = input_ids.to(device=self.model.device)
                if image_tensor is not None:
                    image_tensor = image_tensor.to(device=self.model.device, dtype=self.model.dtype)

            with torch.inference_mode():
                output_ids = self.model.generate(
                    input_ids,
                    images=image_tensor,
                    do_sample=False,
                    temperature=0.2,
                    max_new_tokens=500,
                    use_cache=True,
                )

            output = self.tokenizer.batch_decode(output_ids, skip_special_tokens=True)[0].strip()
            metadata = {
                "question": question,
                "image_path": image_path,
                "analysis_status": "completed",
                "model": "LLaVA-Med"
            }
            return output, metadata
        except Exception as e:
            return f"Error generating LLaVA-Med analysis: {str(e)}", {
                "question": question,
                "image_path": image_path,
                "analysis_status": "failed",
            }
    
    def _run_with_api(self, question: str, image_path: Optional[str] = None) -> Tuple[str, Dict]:
        """Run medical vision analysis using lightweight API model"""
        try:
            if not image_path:
                response = f"⚠️ Medical vision analysis requires an image. Question: {question}"
                metadata = {
                    "question": question,
                    "image_path": image_path,
                    "analysis_status": "no_image_provided",
                    "api_used": True
                }
                return response, metadata
            
            # Load and process image
            from PIL import Image
            image = Image.open(image_path).convert('RGB')
            
            # Use the pipeline for inference with medical context
            medical_prompt = f"This is a medical image. {question} Provide a detailed medical analysis."
            
            result = self.hf_pipeline(
                image, 
                max_new_tokens=300,
                temperature=0.3
            )
            
            if result and len(result) > 0:
                base_response = result[0].get('generated_text', '')
                # Enhance with medical context
                response = f"Medical Image Analysis: {base_response}\n\nNote: Analysis based on BLIP-2 vision model. For specialized medical diagnostics, please consult healthcare professionals."
            else:
                response = f"⚠️ No visual analysis generated for: {question}"
            
            metadata = {
                "question": question,
                "image_path": image_path,
                "analysis_status": "completed",
                "api_used": True,
                "model": "BLIP-2"
            }
            return response, metadata
            
        except Exception as e:
            print(f"❌ API analysis failed: {e}")
            # Fallback to simple analysis
            return self._run_simple_analysis(question, image_path)
    
    def _run_simple_analysis(self, question: str, image_path: Optional[str] = None) -> Tuple[str, Dict]:
        """Provide simple medical image analysis without large models"""
        try:
            if image_path:
                # Basic image analysis using PIL
                from PIL import Image
                import os
                
                image = Image.open(image_path)
                width, height = image.size
                mode = image.mode
                format_info = image.format or "Unknown"
                file_size = os.path.getsize(image_path)
                
                response = f"""Medical Image Analysis (Lightweight Mode):

Image Properties:
- Dimensions: {width}x{height} pixels
- Color Mode: {mode}
- Format: {format_info}
- File Size: {file_size/1024:.1f} KB

Question: {question}

Analysis: This medical image has been processed for basic technical parameters. The image appears to be a medical scan or radiograph based on the file characteristics.

Note: This is a lightweight analysis mode. For detailed medical interpretation, the system would normally use advanced vision models like LLaVA-Med. Please use other available medical tools like ChestXRayClassifierTool for specific diagnostic assistance.

Recommendation: Consult with healthcare professionals for proper medical interpretation of this image."""
            else:
                response = f"""Medical Question Analysis:

Question: {question}

Note: This question appears to be medical in nature. While I can provide general information, for specific medical advice or image analysis, please consult healthcare professionals or use specialized medical tools when available.

Available alternatives: ChestXRayClassifierTool, XRayVQATool, or other medical analysis tools in the system."""

            metadata = {
                "question": question,
                "image_path": image_path,
                "analysis_status": "simple_analysis_completed",
                "lightweight_mode": True
            }
            return response, metadata
            
        except Exception as e:
            response = f"⚠️ Medical analysis failed for question: {question}. Error: {str(e)}"
            metadata = {
                "question": question,
                "image_path": image_path,
                "analysis_status": "failed",
                "error": str(e)
            }
            return response, metadata

    async def _arun(
        self,
        question: str,
        image_path: Optional[str] = None,
        run_manager: Optional[Any] = None,
    ) -> Tuple[str, Dict]:
        """Asynchronously answer a medical question, optionally based on an input image.

        This method currently calls the synchronous version, as the model inference
        is not inherently asynchronous. For true asynchronous behavior, consider
        using a separate thread or process.

        Args:
            question (str): The medical question to answer.
            image_path (Optional[str]): The path to the medical image file (if applicable).
            run_manager (Optional[AsyncCallbackManagerForToolRun]): The async callback manager for the tool run.

        Returns:
            Tuple[str, Dict]: A tuple containing the model's answer and any additional metadata.

        Raises:
            Exception: If there's an error processing the input or generating the answer.
        """
        return self._run(question, image_path)
