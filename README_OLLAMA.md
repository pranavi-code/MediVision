# MedRAX with Ollama Mistral Integration

This version of MedRAX has been modified to use Ollama with Mistral instead of OpenAI APIs, making it completely free to run locally.

## Prerequisites

1. **Install Ollama**: Download and install Ollama from [https://ollama.com/](https://ollama.com/)

2. **Pull Mistral Model**: 
   ```bash
   ollama pull mistral:latest
   ```

3. **Verify Ollama is Running**:
   ```bash
   ollama list
   ```

## Installation

```bash
# Clone the repository
git clone https://github.com/bowang-lab/MedRAX.git
cd MedRAX

# Install the modified package
pip install -e .
```

## Configuration

1. **Environment Variables**: Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. **Edit .env file** (optional, defaults should work):
   ```bash
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=mistral:latest
   ```

## Usage

### Running the Main Application

```bash
python main.py
```

The application will now use Ollama Mistral instead of OpenAI GPT models.

### Running Benchmarks

```bash
# Download the benchmark dataset first
huggingface-cli download wanglab/chestagentbench --repo-type dataset --local-dir chestagentbench
unzip chestagentbench/figures.zip

# Run benchmark with Mistral
python quickstart.py \
    --model mistral:latest \
    --temperature 0.2 \
    --max-cases 2 \
    --log-prefix mistral \
    --use-urls
```

### Available Ollama Models

You can use different Ollama models by changing the model parameter:

- `mistral:latest` - Default Mistral model
- `llama3.1:latest` - Llama 3.1 model  
- `codellama:latest` - Code-focused Llama model
- `llava:latest` - Vision-capable model (recommended for medical imaging)

To use a different model:
```bash
# Pull the model first
ollama pull llava:latest

# Then use it in the application
python main.py  # Edit main.py to change the model parameter
```

## Key Changes Made

1. **Dependencies**: Replaced `openai` and `langchain-openai` with `ollama` and `langchain-ollama`
2. **Main Application**: Updated `main.py` to use `ChatOllama` instead of `ChatOpenAI`
3. **Benchmark Scripts**: Modified all benchmark scripts to use Ollama client
4. **Environment Variables**: Changed from `OPENAI_API_KEY` to `OLLAMA_BASE_URL`
5. **Model Names**: Updated default models from GPT to Mistral

## Troubleshooting

### Ollama Connection Issues
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama service
ollama serve
```

### Model Not Found
```bash
# List available models
ollama list

# Pull required model
ollama pull mistral:latest
```

### Performance Optimization

For better performance with medical imaging tasks:

1. **Use Vision Models**: Consider using `llava:latest` for better image understanding
2. **GPU Acceleration**: Ensure Ollama is using GPU if available
3. **Memory Settings**: Adjust Ollama memory settings for large medical images

```bash
# Set Ollama to use more memory (optional)
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
```

## Benefits of Ollama Integration

- ✅ **Free**: No API costs
- ✅ **Private**: All processing happens locally
- ✅ **Offline**: Works without internet connection
- ✅ **Customizable**: Easy to switch between different models
- ✅ **HIPAA Compliant**: Medical data stays on your infrastructure

## Performance Comparison

While Ollama models may have different performance characteristics compared to GPT-4, they offer:
- Complete privacy for sensitive medical data
- No usage costs or rate limits
- Full control over the inference environment