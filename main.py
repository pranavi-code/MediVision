import os
import warnings
from typing import *
from dotenv import load_dotenv
from transformers import logging

from langgraph.checkpoint.memory import MemorySaver
from langchain_ollama import ChatOllama

from interface import create_demo
from medrax.agent import *
from medrax.tools import *
from medrax.utils import *

warnings.filterwarnings("ignore")
logging.set_verbosity_error()
_ = load_dotenv()


def initialize_agent(
    prompt_file,
    tools_to_use=None,
    model_dir="/model-weights",
    temp_dir="temp",
    device="cpu",  # Changed default to CPU
    model="mistral:latest",  # Use Mistral for native function calling
        temperature=0.2,  # Lower temperature for more reliable tool calling
    top_p=0.95,
    ollama_kwargs={}
):
    """Initialize the MedRAX agent with specified tools and configuration.

    Args:
        prompt_file (str): Path to file containing system prompts
        tools_to_use (List[str], optional): List of tool names to initialize. If None, all tools are initialized.
        model_dir (str, optional): Directory containing model weights. Defaults to "/model-weights".
        temp_dir (str, optional): Directory for temporary files. Defaults to "temp".
        device (str, optional): Device to run models on. Defaults to "cuda".
        model (str, optional): Model to use. Defaults to "mistral:latest".
        temperature (float, optional): Temperature for the model. Defaults to 0.7.
        top_p (float, optional): Top P for the model. Defaults to 0.95.
        ollama_kwargs (dict, optional): Additional keyword arguments for Ollama API, such as base URL.

    Returns:
        Tuple[Agent, Dict[str, BaseTool]]: Initialized agent and dictionary of tool instances
    """
    prompts = load_prompts_from_file(prompt_file)
    prompt = prompts["MEDICAL_ASSISTANT"]

    all_tools = {
        "ChestXRayClassifierTool": lambda: ChestXRayClassifierTool(device=device),
        "ChestXRaySegmentationTool": lambda: ChestXRaySegmentationTool(device=device),
        "LlavaMedTool": lambda: LlavaMedTool(cache_dir=model_dir, device=device, load_in_8bit=True),
        "XRayVQATool": lambda: XRayVQATool(cache_dir=model_dir, device=device),
        "ChestXRayReportGeneratorTool": lambda: ChestXRayReportGeneratorTool(
            cache_dir=model_dir, device=device
        ),
        "XRayPhraseGroundingTool": lambda: XRayPhraseGroundingTool(
            cache_dir=model_dir, temp_dir=temp_dir, load_in_8bit=True, device=device
        ),
        "ChestXRayGeneratorTool": lambda: ChestXRayGeneratorTool(
            model_path=f"{model_dir}/roentgen", temp_dir=temp_dir, device=device
        ),
        "ImageVisualizerTool": lambda: ImageVisualizerTool(),
        "DicomProcessorTool": lambda: DicomProcessorTool(temp_dir=temp_dir),
    }

    # Initialize only selected tools or all if none specified
    tools_dict = {}
    tools_to_use = tools_to_use or all_tools.keys()
    
    print(f"\n🔧 Initializing {len(tools_to_use)} medical tools...")
    for i, tool_name in enumerate(tools_to_use, 1):
        if tool_name in all_tools:
            print(f"  {i}/{len(tools_to_use)} Loading {tool_name}...")
            tools_dict[tool_name] = all_tools[tool_name]()
            print(f"  ✅ {tool_name} loaded successfully")
        else:
            print(f"  ❌ {tool_name} not found in available tools")

    checkpointer = MemorySaver()
    
    # Set default base_url if not provided
    if "base_url" not in ollama_kwargs:
        ollama_kwargs["base_url"] = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    
    # Configure for NATIVE FUNCTION CALLING with Mistral (same as original MedRAX)
    model = ChatOllama(
        model=model,  # Use the specified model
        temperature=temperature, 
        top_p=top_p,
        # Remove format="json" to enable native function calling
        **ollama_kwargs
    )
    
    # COMPLETE FIX: Skip bind_tools to avoid frozenset error
    agent = Agent(
        model,  # Use raw model - Agent will handle tool binding internally
        tools=list(tools_dict.values()),
        log_tools=True,
        log_dir="logs",
        system_prompt=prompt,
        checkpointer=checkpointer,
    )

    print("Agent initialized with Mistral - Native Function Calling (Same as Original MedRAX)")
    return agent, tools_dict


if __name__ == "__main__":
    """
    This is the main entry point for the MedRAX application.
    It initializes the agent with the selected tools and creates the demo.
    """
    print("Starting MedRAX server...")
    
    try:
        # Check if Ollama is running
        import requests
        try:
            response = requests.get("http://localhost:11434", timeout=5)
            print("✓ Ollama server is running")
        except Exception as e:
            print(f"✗ Ollama server not accessible: {e}")
            print("Please start Ollama first: 'ollama serve'")
            exit(1)

        # FIXED CONFIGURATION: All tools with error handling
        selected_tools = [
            "ImageVisualizerTool",
            "DicomProcessorTool", 
            "ChestXRayClassifierTool",
            "ChestXRaySegmentationTool",         # ✅ Working
            "ChestXRayReportGeneratorTool",      # ✅ Working
            "XRayVQATool",                       # ✅ Working (CheXagent)
            "LlavaMedTool",                      # 🔧 Fixed with error handling
            "XRayPhraseGroundingTool",           # 🔧 Fixed with error handling
            # "ChestXRayGeneratorTool",          # ❌ Keep disabled
        ]

        # Models with native function calling support (in order of preference)
        function_calling_models = [
            "qwen2.5:7b",      # Now installed - excellent function calling
            "mistral:latest"   # Fallback option
        ]

        print("Initializing MedRAX with native function calling...")
        agent = None
        
        # Try each model until one works
        for model_name in function_calling_models:
            try:
                print(f"Attempting to use model: {model_name}")
                
                # Collect the ENV variables for Ollama
                ollama_kwargs = {}
                if base_url := os.getenv("OLLAMA_BASE_URL"):
                    ollama_kwargs["base_url"] = base_url

                agent, tools_dict = initialize_agent(
                    "medrax/docs/system_prompts.txt",
                    tools_to_use=selected_tools,
                    model_dir="/model-weights",
                    temp_dir="temp",
                    device="cuda" if os.getenv("CUDA_AVAILABLE", "false").lower() == "true" else "cpu",
                    model=model_name,  # Try each model
                    temperature=0.2,   # Lower temp for reliable function calling
                    ollama_kwargs=ollama_kwargs
                )
                print(f"✅ Successfully initialized with {model_name}")
                print(f"✅ Native function calling enabled with bind_tools()")
                break
                
            except Exception as e:
                print(f"❌ Failed with {model_name}: {e}")
                continue
        
        if agent is None:
            print("\n❌ No compatible function-calling models found!")
            print("Please install one of these models:")
            print("  ollama pull qwen2.5:7b")
            exit(1)

        print("Creating Gradio interface...")
        demo = create_demo(agent, tools_dict)

        print("Starting Gradio server on http://127.0.0.1:7860")
        demo.launch(
            server_name="127.0.0.1", 
            server_port=7860, 
            share=True,  # Set to True only if you need public access
            show_error=True,
            quiet=False,
            debug=False,
            inbrowser=True  # Auto-open browser
        )
        
    except KeyboardInterrupt:
        print("\nShutting down...")
    except Exception as e:
        print(f"Error starting MedRAX: {e}")
        import traceback
        traceback.print_exc()