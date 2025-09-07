# MedRAX OpenAI to Ollama Mistral Migration Plan

## Files to Modify:

1. **pyproject.toml** - Update dependencies to remove OpenAI and add Ollama support
2. **main.py** - Replace ChatOpenAI with Ollama client
3. **benchmark/llm.py** - Replace OpenAI client with Ollama client
4. **benchmark/create_benchmark.py** - Update OpenAI usage
5. **quickstart.py** - Update to use Ollama instead of OpenAI
6. **experiments/benchmark_gpt4o.py** - Update benchmark scripts
7. **experiments/benchmark_llama.py** - Update benchmark scripts
8. **experiments/chexbench_gpt4.py** - Update benchmark scripts
9. **medrax/llava/eval/llm.py** - Update LLaVA evaluation
10. **medrax/llava/serve/gradio_web_server.py** - Update Gradio server
11. **medrax/llava/utils.py** - Update utilities

## Key Changes:
- Replace `langchain-openai` with `langchain-community` for Ollama support
- Replace `openai` package with `ollama` package
- Update all ChatOpenAI instances to use Ollama
- Modify environment variable handling (OLLAMA_BASE_URL instead of OPENAI_BASE_URL)
- Update model names to use Mistral
- Ensure compatibility with existing tool integrations

## Implementation Priority:
1. Core agent functionality (main.py)
2. Benchmark and evaluation scripts
3. LLaVA integration components
4. Documentation updates